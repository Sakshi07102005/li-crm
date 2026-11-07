import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { pool, query, withTransaction } from '../db/pool';
import { AppError } from '../utils/AppError';
import { generateRefreshToken, sha256 } from '../utils/crypto';
import {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from '../validators/auth.validator';
import { writeAuditLog } from './audit.service';

const DUMMY_BCRYPT_HASH =
  '$2a$12$e8YjGv2Nn.4dDqm/kK8wTe7w14aOQ3V3Uf9uWq9c.9R9j/H1k3V1q';

export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: {
    code: string;
    name: string;
  };
  managerId?: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  permissions?: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthResponse {
  user: UserResponse;
  tokens: AuthTokens;
}

function createAccessToken(userId: string, roleCode: string): string {
  return jwt.sign(
    {
      sub: userId,
      role: roleCode,
    },
    env.jwt.accessSecret,
    {
      expiresIn: env.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
    },
  );
}

export class AuthService {
  static async register(
    input: RegisterInput,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponse> {
    // 1. Check duplicate email case-insensitively
    const existing = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [input.email],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      throw AppError.emailAlreadyExists('Email address is already registered');
    }

    // 2. Fetch marketing_executive role (lowest role, strictly assigned on public register)
    const roleRes = await query(
      'SELECT id, code, name FROM roles WHERE code = $1',
      ['marketing_executive'],
    );
    if (roleRes.rowCount === 0) {
      throw AppError.internal('Default registration role not configured');
    }
    const role = roleRes.rows[0];

    // 3. Hash password
    const passwordHash = await bcrypt.hash(
      input.password,
      env.security.bcryptRounds,
    );

    // 4. Insert user
    const insertUserSql = `
      INSERT INTO users (
        email,
        password_hash,
        first_name,
        last_name,
        phone,
        role_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, first_name, last_name, phone, avatar_url, is_active, last_login_at, created_at
    `;
    const userRes = await query(insertUserSql, [
      input.email,
      passwordHash,
      input.firstName,
      input.lastName,
      input.phone ?? null,
      role.id,
    ]);
    const user = userRes.rows[0];

    // 5. Generate tokens
    const accessToken = createAccessToken(user.id, role.code);
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = sha256(rawRefreshToken);

    await query(
      `INSERT INTO refresh_tokens (
        user_id,
        token_hash,
        expires_at,
        user_agent,
        ip_address
      ) VALUES ($1, $2, NOW() + ($3 || ' days')::INTERVAL, $4, $5)`,
      [user.id, tokenHash, String(env.jwt.refreshTokenDays), userAgent ?? null, ip ?? null],
    );

    // 6. Audit log
    await writeAuditLog({
      userId: user.id,
      action: 'auth.register',
      entityType: 'user',
      entityId: user.id,
      newValues: {
        email: user.email,
        roleCode: role.code,
      },
      ip,
      userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        avatarUrl: user.avatar_url,
        role: {
          code: role.code,
          name: role.name,
        },
        isActive: user.is_active,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
      },
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: env.jwt.accessExpiresIn,
      },
    };
  }

  static async login(
    input: LoginInput,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponse> {
    const userRes = await query(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.phone,
              u.avatar_url, u.is_active, u.manager_id, u.last_login_at, u.created_at,
              r.id AS role_id, r.code AS role_code, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE LOWER(u.email) = LOWER($1)`,
      [input.email],
    );

    if (userRes.rowCount === 0) {
      // Dummy compare to protect against timing attacks
      await bcrypt.compare(input.password, DUMMY_BCRYPT_HASH);
      await writeAuditLog({
        userId: null,
        action: 'auth.login_failed',
        entityType: 'user',
        newValues: { email: input.email },
        ip,
        userAgent,
      });
      throw AppError.invalidCredentials('Invalid email or password');
    }

    const user = userRes.rows[0];

    // Check password
    const isPasswordValid = await bcrypt.compare(
      input.password,
      user.password_hash,
    );
    if (!isPasswordValid) {
      await writeAuditLog({
        userId: user.id,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        newValues: { email: input.email },
        ip,
        userAgent,
      });
      throw AppError.invalidCredentials('Invalid email or password');
    }

    // Check active status
    if (!user.is_active) {
      throw AppError.accountDisabled('Account has been disabled');
    }

    // Update last_login_at
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [
      user.id,
    ]);

    // Issue tokens
    const accessToken = createAccessToken(user.id, user.role_code);
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = sha256(rawRefreshToken);

    await query(
      `INSERT INTO refresh_tokens (
        user_id,
        token_hash,
        expires_at,
        user_agent,
        ip_address
      ) VALUES ($1, $2, NOW() + ($3 || ' days')::INTERVAL, $4, $5)`,
      [user.id, tokenHash, String(env.jwt.refreshTokenDays), userAgent ?? null, ip ?? null],
    );

    // Audit log
    await writeAuditLog({
      userId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ip,
      userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        avatarUrl: user.avatar_url,
        role: {
          code: user.role_code,
          name: user.role_name,
        },
        managerId: user.manager_id,
        isActive: user.is_active,
        lastLoginAt: new Date(),
        createdAt: user.created_at,
      },
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: env.jwt.accessExpiresIn,
      },
    };
  }

  static async refreshToken(
    presentedToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const presentedHash = sha256(presentedToken);

    return withTransaction(async (client, commitNow) => {
      // 1. Lock and select refresh token
      const tokenRes = await client.query(
        `SELECT id, user_id, expires_at, revoked_at, replaced_by_id
         FROM refresh_tokens
         WHERE token_hash = $1
         FOR UPDATE`,
        [presentedHash],
      );

      if (tokenRes.rowCount === 0) {
        throw AppError.invalidRefreshToken('Invalid or expired refresh token');
      }

      const tokenRecord = tokenRes.rows[0];

      // 2. Revoked token checks
      if (tokenRecord.revoked_at !== null) {
        if (tokenRecord.replaced_by_id !== null) {
          // Token was rotated and then re-presented -> REPLAY ATTACK DETECTED
          await client.query(
            `UPDATE refresh_tokens
             SET revoked_at = NOW()
             WHERE user_id = $1 AND revoked_at IS NULL`,
            [tokenRecord.user_id],
          );

          await commitNow();

          await writeAuditLog({
            userId: tokenRecord.user_id,
            action: 'auth.token_reuse_detected',
            entityType: 'refresh_token',
            entityId: tokenRecord.id,
            ip,
            userAgent,
          });

          throw AppError.tokenReuseDetected(
            'Suspicious token reuse detected. All sessions revoked.',
          );
        } else {
          // Token was revoked without replacement (e.g. logout or change-password)
          // NO mass revocation, NO reuse audit log.
          throw AppError.invalidRefreshToken('Refresh token has been revoked');
        }
      }

      // 3. Expiration check
      if (new Date(tokenRecord.expires_at) <= new Date()) {
        await client.query(
          'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
          [tokenRecord.id],
        );
        throw AppError.invalidRefreshToken('Refresh token has expired');
      }

      // 4. Verify user exists and is active
      const userRes = await client.query(
        `SELECT u.id, u.is_active, r.code AS role_code
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1`,
        [tokenRecord.user_id],
      );

      if (userRes.rowCount === 0) {
        throw AppError.unauthorized('User account no longer exists');
      }

      const user = userRes.rows[0];
      if (!user.is_active) {
        throw AppError.accountDisabled('Account has been disabled');
      }

      // 5. Rotate: create new refresh token
      const newRawRefreshToken = generateRefreshToken();
      const newTokenHash = sha256(newRawRefreshToken);

      const insertRes = await client.query(
        `INSERT INTO refresh_tokens (
          user_id,
          token_hash,
          expires_at,
          user_agent,
          ip_address
        ) VALUES ($1, $2, NOW() + ($3 || ' days')::INTERVAL, $4, $5)
        RETURNING id`,
        [
          user.id,
          newTokenHash,
          String(env.jwt.refreshTokenDays),
          userAgent ?? null,
          ip ?? null,
        ],
      );
      const newRecordId = insertRes.rows[0].id;

      // 6. Revoke old token and set replaced_by_id
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW(), replaced_by_id = $1
         WHERE id = $2`,
        [newRecordId, tokenRecord.id],
      );

      const newAccessToken = createAccessToken(user.id, user.role_code);

      return {
        accessToken: newAccessToken,
        refreshToken: newRawRefreshToken,
        expiresIn: env.jwt.accessExpiresIn,
      };
    });
  }

  static async logout(
    refreshToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const tokenHash = sha256(refreshToken);

    const tokenRes = await query(
      `SELECT id, user_id, revoked_at
       FROM refresh_tokens
       WHERE token_hash = $1`,
      [tokenHash],
    );

    if (tokenRes.rowCount && tokenRes.rowCount > 0) {
      const tokenRecord = tokenRes.rows[0];
      if (tokenRecord.revoked_at === null) {
        await query(
          'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
          [tokenRecord.id],
        );

        await writeAuditLog({
          userId: tokenRecord.user_id,
          action: 'auth.logout',
          entityType: 'refresh_token',
          entityId: tokenRecord.id,
          ip,
          userAgent,
        });
      }
    }
    // Logout is strictly idempotent: always succeeds with 200
  }

  static async getMe(userId: string): Promise<UserResponse> {
    const userRes = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url,
              u.manager_id, u.is_active, u.last_login_at, u.created_at,
              r.id AS role_id, r.code AS role_code, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [userId],
    );

    if (userRes.rowCount === 0) {
      throw AppError.notFound('User not found');
    }

    const user = userRes.rows[0];
    if (!user.is_active) {
      throw AppError.accountDisabled('Account has been disabled');
    }

    const permRes = await query(
      `SELECT p.code
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1
       ORDER BY p.code`,
      [user.role_id],
    );

    const permissions = permRes.rows.map((row) => row.code as string);

    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      role: {
        code: user.role_code,
        name: user.role_name,
      },
      managerId: user.manager_id,
      isActive: user.is_active,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at,
      permissions,
    };
  }

  static async updateMe(
    userId: string,
    input: UpdateProfileInput,
    ip?: string,
    userAgent?: string,
  ): Promise<UserResponse> {
    const current = await this.getMe(userId);

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (input.firstName !== undefined) {
      updates.push(`first_name = $${idx++}`);
      values.push(input.firstName);
    }
    if (input.lastName !== undefined) {
      updates.push(`last_name = $${idx++}`);
      values.push(input.lastName);
    }
    if (input.phone !== undefined) {
      updates.push(`phone = $${idx++}`);
      values.push(input.phone);
    }
    if (input.avatarUrl !== undefined) {
      updates.push(`avatar_url = $${idx++}`);
      values.push(input.avatarUrl);
    }

    if (updates.length > 0) {
      values.push(userId);
      await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
        values,
      );

      await writeAuditLog({
        userId,
        action: 'auth.profile_updated',
        entityType: 'user',
        entityId: userId,
        oldValues: {
          firstName: current.firstName,
          lastName: current.lastName,
          phone: current.phone,
          avatarUrl: current.avatarUrl,
        },
        newValues: input,
        ip,
        userAgent,
      });
    }

    return this.getMe(userId);
  }

  static async changePassword(
    userId: string,
    input: ChangePasswordInput,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const userRes = await query(
      'SELECT id, password_hash, is_active FROM users WHERE id = $1',
      [userId],
    );

    if (userRes.rowCount === 0) {
      throw AppError.notFound('User not found');
    }

    const user = userRes.rows[0];
    if (!user.is_active) {
      throw AppError.accountDisabled('Account has been disabled');
    }

    const isMatch = await bcrypt.compare(
      input.currentPassword,
      user.password_hash,
    );
    if (!isMatch) {
      throw AppError.invalidCredentials('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(
      input.newPassword,
      env.security.bcryptRounds,
    );

    await withTransaction(async (client) => {
      // 1. Update password
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        newHash,
        userId,
      ]);

      // 2. Revoke all refresh tokens for this user
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );

      // 3. Write audit log
      await writeAuditLog(
        {
          userId,
          action: 'auth.password_changed',
          entityType: 'user',
          entityId: userId,
          ip,
          userAgent,
        },
        client,
      );
    });
  }
}
