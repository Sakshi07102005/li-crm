import { AuthUser } from '../types/express';
import { query } from '../db/pool';

export interface ScopeResult {
  sql: string;
  params: any[];
}

/**
 * Returns a parameterised SQL fragment (WHERE clause addition) for lead visibility.
 * Does NOT include "deleted_at IS NULL" — callers add that.
 *
 * @param user      - Authenticated user
 * @param alias     - SQL alias for the leads table (default 'l')
 * @param paramOffset - Starting $N index for params (default 1)
 */
export function leadScope(user: AuthUser, alias = 'l', paramOffset = 1): ScopeResult {
  const p = user.permissions;
  const uid = user.id;

  if (p.includes('leads.view_all')) {
    // No restriction
    return { sql: 'TRUE', params: [] };
  }

  if (p.includes('leads.view_team')) {
    // assigned_to = user OR created_by = user OR assigned_to IN (direct reports)
    const n = paramOffset;
    const sql = `(
      ${alias}.assigned_to = $${n}
      OR ${alias}.created_by = $${n}
      OR ${alias}.assigned_to IN (
        SELECT id FROM users WHERE manager_id = $${n}
      )
    )`;
    return { sql, params: [uid] };
  }

  if (p.includes('leads.view_own')) {
    const n = paramOffset;
    const sql = `(${alias}.assigned_to = $${n} OR ${alias}.created_by = $${n})`;
    return { sql, params: [uid] };
  }

  if (p.includes('leads.view_marketing')) {
    const n = paramOffset;
    const sql = `(
      ${alias}.source_id IN (SELECT id FROM lead_sources WHERE is_marketing = TRUE)
      OR ${alias}.created_by = $${n}
    )`;
    return { sql, params: [uid] };
  }

  // No view permission
  return { sql: 'FALSE', params: [] };
}

/**
 * Returns a parameterised SQL fragment for user visibility.
 */
export function userScope(user: AuthUser, paramOffset = 1): ScopeResult {
  if (user.permissions.includes('users.manage')) {
    // Admin: see all
    return { sql: 'TRUE', params: [] };
  }

  if (user.permissions.includes('users.view_team')) {
    // Business head: self + direct reports
    const n = paramOffset;
    const sql = `(u.id = $${n} OR u.manager_id = $${n})`;
    return { sql, params: [user.id] };
  }

  // Others: self only
  const n = paramOffset;
  const sql = `u.id = $${n}`;
  return { sql, params: [user.id] };
}

/**
 * Returns the IDs of users whose manager_id = userId.
 */
export async function getTeamUserIds(userId: string): Promise<string[]> {
  const res = await query<{ id: string }>(
    `SELECT id FROM users WHERE manager_id = $1 AND is_active = TRUE`,
    [userId],
  );
  return res.rows.map((r) => r.id);
}

