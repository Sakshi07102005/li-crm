import bcrypt from 'bcryptjs';
import { AuthUser } from '../types/express';
import { query, withTransaction } from '../db/pool';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from './audit.service';
import { userScope } from './scope.service';
import { CreateUserInput, UpdateUserInput, ListUsersQuery } from '../validators/user.validator';

/** Safe user shape — never includes password_hash */
export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  roleId: number;
  roleCode: string;
  roleName: string;
  managerId: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SAFE_COLUMNS = `
  u.id,
  u.email,
  u.first_name AS "firstName",
  u.last_name  AS "lastName",
  u.phone,
  u.avatar_url AS "avatarUrl",
  u.role_id    AS "roleId",
  r.code       AS "roleCode",
  r.name       AS "roleName",
  u.manager_id AS "managerId",
  u.is_active  AS "isActive",
  u.last_login_at AS "lastLoginAt",
  u.created_at AS "createdAt",
  u.updated_at AS "updatedAt"
`;

const FROM_CLAUSE = `
  FROM users u
  JOIN roles r ON r.id = u.role_id
`;

// ─── helpers ────────────────────────────────────────────────────────────────

async function getRoleByCode(
  roleCode: string,
): Promise<{ id: number; code: string; name: string } | null> {
  const res = await query<{ id: number; code: string; name: string }>(
    `SELECT id, code, name FROM roles WHERE code = $1`,
    [roleCode],
  );
  return res.rows[0] ?? null;
}

async function countActiveAdmins(): Promise<number> {
  const res = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.code = 'admin' AND u.is_active = TRUE`,
  );
  return parseInt(res.rows[0].count, 10);
}

// ─── service functions ───────────────────────────────────────────────────────

export async function listUsers(
  caller: AuthUser,
  q: ListUsersQuery,
): Promise<{ users: SafeUser[]; total: number; page: number; limit: number }> {
  const scope = userScope(caller);
  const params: any[] = [];
  const conditions: string[] = [];

  // Scope filter — placeholders start at $1
  if (scope.sql !== 'TRUE') {
    scope.params.forEach((p) => params.push(p));
    conditions.push(scope.sql);
  }

  // Search filter
  if (q.search) {
    params.push(`%${q.search}%`);
    const idx = params.length;
    conditions.push(
      `(LOWER(u.first_name) LIKE LOWER($${idx}) OR LOWER(u.last_name) LIKE LOWER($${idx}) OR LOWER(u.email) LIKE LOWER($${idx}))`,
    );
  }

  // Role filter
  if (q.roleCode) {
    params.push(q.roleCode);
    conditions.push(`r.code = $${params.length}`);
  }

  // isActive filter
  if (q.isActive !== undefined) {
    params.push(q.isActive);
    conditions.push(`u.is_active = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Sorting
  const sortMap: Record<string, string> = {
    firstName: 'u.first_name',
    lastName: 'u.last_name',
    email: 'u.email',
    createdAt: 'u.created_at',
    role: 'r.code',
  };
  const orderBy = sortMap[q.sort ?? 'createdAt'] ?? 'u.created_at';

  // Count
  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) AS count ${FROM_CLAUSE} ${whereClause}`,
    params,
  );
  const total = parseInt(countRes.rows[0].count, 10);

  // Paginate
  const offset = (q.page - 1) * q.limit;
  params.push(q.limit, offset);
  const dataRes = await query<SafeUser>(
    `SELECT ${SAFE_COLUMNS} ${FROM_CLAUSE} ${whereClause}
     ORDER BY ${orderBy} ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { users: dataRes.rows, total, page: q.page, limit: q.limit };
}

export async function getUserById(caller: AuthUser, id: string): Promise<SafeUser> {
  const scope = userScope(caller);
  const params: any[] = [id];
  let whereClause = `WHERE u.id = $1`;

  if (scope.sql !== 'TRUE') {
    // Adjust param offset: scope params start at $2
    const adjustedSql = scope.sql.replace(/\$(\d+)/g, (_m, n) => `$${parseInt(n) + 1}`);
    scope.params.forEach((p) => params.push(p));
    whereClause += ` AND ${adjustedSql}`;
  }

  const res = await query<SafeUser>(
    `SELECT ${SAFE_COLUMNS} ${FROM_CLAUSE} ${whereClause}`,
    params,
  );

  if (res.rowCount === 0) {
    // Return 404 regardless — don't reveal existence to callers outside scope
    throw AppError.notFound('User not found');
  }

  return res.rows[0];
}

export async function createUser(
  input: CreateUserInput,
  caller: AuthUser,
  ip: string | null,
  userAgent: string | null,
): Promise<SafeUser> {
  const role = await getRoleByCode(input.roleCode);
  if (!role) {
    throw AppError.validationError('Invalid role code');
  }

  // Check email uniqueness (case-insensitive)
  const existing = await query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [
    input.email,
  ]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw AppError.emailAlreadyExists('Email address is already in use');
  }

  const bcryptRounds = 12;
  const passwordHash = await bcrypt.hash(input.password, bcryptRounds);

  const res = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, manager_id, is_active)
     VALUES (LOWER($1), $2, $3, $4, $5, $6, $7, TRUE)
     RETURNING id`,
    [
      input.email,
      passwordHash,
      input.firstName,
      input.lastName,
      input.phone ?? null,
      role.id,
      input.managerId ?? null,
    ],
  );

  const newId = res.rows[0].id;

  await writeAuditLog({
    userId: caller.id,
    action: 'user.create',
    entityType: 'user',
    entityId: newId,
    newValues: {
      email: input.email.toLowerCase(),
      firstName: input.firstName,
      lastName: input.lastName,
      roleCode: input.roleCode,
      managerId: input.managerId ?? null,
    },
    ip,
    userAgent,
  });

  return getUserById(caller, newId);
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  caller: AuthUser,
  ip: string | null,
  userAgent: string | null,
): Promise<SafeUser> {
  // Fetch existing (also enforces scope)
  const existing = await getUserById(caller, id);

  const setClauses: string[] = [];
  const params: any[] = [];

  if (input.firstName !== undefined) {
    params.push(input.firstName);
    setClauses.push(`first_name = $${params.length}`);
  }
  if (input.lastName !== undefined) {
    params.push(input.lastName);
    setClauses.push(`last_name = $${params.length}`);
  }
  if (input.phone !== undefined) {
    params.push(input.phone);
    setClauses.push(`phone = $${params.length}`);
  }
  if (input.managerId !== undefined) {
    params.push(input.managerId);
    setClauses.push(`manager_id = $${params.length}`);
  }

  if (setClauses.length === 0) {
    throw AppError.validationError('No fields to update');
  }

  params.push(id);
  await query(
    `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
    params,
  );

  await writeAuditLog({
    userId: caller.id,
    action: 'user.updated',
    entityType: 'user',
    entityId: id,
    oldValues: {
      firstName: existing.firstName,
      lastName: existing.lastName,
      phone: existing.phone,
      managerId: existing.managerId,
    },
    newValues: {
      firstName: input.firstName ?? existing.firstName,
      lastName: input.lastName ?? existing.lastName,
      phone: input.phone !== undefined ? input.phone : existing.phone,
      managerId: input.managerId !== undefined ? input.managerId : existing.managerId,
    },
    ip,
    userAgent,
  });

  return getUserById(caller, id);
}

export async function changeUserRole(
  id: string,
  roleCode: string,
  caller: AuthUser,
  ip: string | null,
  userAgent: string | null,
): Promise<SafeUser> {
  const existing = await getUserById(caller, id);

  // Block: admin cannot change their own role
  if (id === caller.id) {
    throw AppError.forbidden('You cannot change your own role');
  }

  // Block: cannot demote the last active admin
  if (existing.roleCode === 'admin') {
    const adminCount = await countActiveAdmins();
    if (adminCount <= 1 && roleCode !== 'admin') {
      throw AppError.forbidden('Cannot demote the last active admin');
    }
  }

  const newRole = await getRoleByCode(roleCode);
  if (!newRole) {
    throw AppError.validationError('Invalid role code');
  }

  await query(`UPDATE users SET role_id = $1, updated_at = NOW() WHERE id = $2`, [newRole.id, id]);

  await writeAuditLog({
    userId: caller.id,
    action: 'user.role_changed',
    entityType: 'user',
    entityId: id,
    oldValues: { roleCode: existing.roleCode },
    newValues: { roleCode },
    ip,
    userAgent,
  });

  return getUserById(caller, id);
}

export async function changeUserStatus(
  id: string,
  isActive: boolean,
  caller: AuthUser,
  ip: string | null,
  userAgent: string | null,
): Promise<SafeUser> {
  const existing = await getUserById(caller, id);

  // Block: admin cannot deactivate themselves
  if (id === caller.id && !isActive) {
    throw AppError.forbidden('You cannot deactivate your own account');
  }

  // Block: cannot deactivate the last active admin
  if (existing.roleCode === 'admin' && !isActive) {
    const adminCount = await countActiveAdmins();
    if (adminCount <= 1) {
      throw AppError.forbidden('Cannot deactivate the last active admin');
    }
  }

  await withTransaction(async (client) => {
    await client.query(`UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2`, [
      isActive,
      id,
    ]);

    // On deactivation: revoke all active refresh tokens
    if (!isActive) {
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
        [id],
      );
    }

    await writeAuditLog(
      {
        userId: caller.id,
        action: 'user.status_changed',
        entityType: 'user',
        entityId: id,
        oldValues: { isActive: existing.isActive },
        newValues: { isActive },
        ip,
        userAgent,
      },
      client,
    );
  });

  return getUserById(caller, id);
}

export async function resetUserPassword(
  id: string,
  newPassword: string,
  caller: AuthUser,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  // Verify target exists and is in scope
  await getUserById(caller, id);

  const bcryptRounds = 12;
  const passwordHash = await bcrypt.hash(newPassword, bcryptRounds);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, id],
    );

    // Revoke all active refresh tokens for target user
    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [id],
    );

    await writeAuditLog(
      {
        userId: caller.id,
        action: 'user.password_reset',
        entityType: 'user',
        entityId: id,
        newValues: { resetBy: caller.id },
        ip,
        userAgent,
      },
      client,
    );
  });
}

