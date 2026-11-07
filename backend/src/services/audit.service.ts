import { PoolClient } from 'pg';
import { query } from '../db/pool';

export interface AuditLogParams {
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function writeAuditLog(
  params: AuditLogParams,
  client?: PoolClient,
): Promise<void> {
  const sql = `
    INSERT INTO audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      old_values,
      new_values,
      ip_address,
      user_agent
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;
  const values = [
    params.userId ?? null,
    params.action,
    params.entityType ?? null,
    params.entityId ?? null,
    params.oldValues ? JSON.stringify(params.oldValues) : null,
    params.newValues ? JSON.stringify(params.newValues) : null,
    params.ip ?? null,
    params.userAgent ?? null,
  ];

  try {
    if (client) {
      await client.query(sql, values);
    } else {
      await query(sql, values);
    }
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

