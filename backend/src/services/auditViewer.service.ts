import { AuthUser } from '../types/express';
import { query } from '../db/pool';

export interface ListAuditLogsQuery {
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface AuditLogResponse {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValues: Record<string, any> | null;
  newValues: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'secret',
  'refreshtoken',
  'refresh_token',
  'refreshtokenhash',
  'refresh_token_hash',
  'accesstoken',
  'access_token',
]);

function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitiveData);

  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (val && typeof val === 'object') {
      clean[key] = redactSensitiveData(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

export async function listAuditLogs(
  _user: AuthUser,
  filter: ListAuditLogsQuery,
): Promise<{
  items: AuditLogResponse[];
  total: number;
  page: number;
  limit: number;
}> {
  const page = Math.max(1, Number(filter.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
  const offset = (page - 1) * limit;

  const whereParts: string[] = ['1=1'];
  const params: any[] = [];
  let paramIdx = 1;

  if (filter.action) {
    whereParts.push(`a.action = $${paramIdx++}`);
    params.push(filter.action.trim());
  }

  if (filter.entityType) {
    whereParts.push(`a.entity_type = $${paramIdx++}`);
    params.push(filter.entityType.trim());
  }

  if (filter.entityId) {
    whereParts.push(`a.entity_id = $${paramIdx++}`);
    params.push(filter.entityId.trim());
  }

  if (filter.userId) {
    whereParts.push(`a.user_id = $${paramIdx++}`);
    params.push(filter.userId.trim());
  }

  if (filter.fromDate) {
    whereParts.push(`a.created_at >= $${paramIdx++}`);
    params.push(new Date(filter.fromDate).toISOString());
  }

  if (filter.toDate) {
    whereParts.push(`a.created_at <= $${paramIdx++}`);
    params.push(new Date(filter.toDate).toISOString());
  }

  const whereClause = whereParts.join(' AND ');

  const countSql = `SELECT COUNT(*)::int AS count FROM audit_logs a WHERE ${whereClause}`;
  const countRes = await query<{ count: number }>(countSql, params);
  const total = Number(countRes.rows[0]?.count || 0);

  const listSql = `
    SELECT
      a.id,
      a.action,
      a.entity_type,
      a.entity_id,
      a.old_values,
      a.new_values,
      a.ip_address,
      a.user_agent,
      a.created_at,
      u.id AS user_pk,
      TRIM(u.first_name || ' ' || u.last_name) AS user_name,
      u.email AS user_email
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;

  const listRes = await query(listSql, [...params, limit, offset]);

  const items: AuditLogResponse[] = listRes.rows.map((row) => ({
    id: String(row.id),
    user: row.user_pk
      ? {
          id: row.user_pk,
          name: row.user_name,
          email: row.user_email,
        }
      : null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    oldValues: redactSensitiveData(row.old_values),
    newValues: redactSensitiveData(row.new_values),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: new Date(row.created_at).toISOString(),
  }));

  return {
    items,
    total,
    page,
    limit,
  };
}

