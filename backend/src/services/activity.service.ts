import { AuthUser } from '../types/express';
import { query } from '../db/pool';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from './audit.service';
import { leadScope } from './scope.service';
import { CreateActivityInput, ListActivitiesQuery } from '../validators/activity.validator';

export interface ActivityResponse {
  id: string;
  type: string;
  subject: string | null;
  notes: string | null;
  outcome: string | null;
  occurredAt: string;
  user: {
    id: string;
    name: string;
  } | null;
  oldStatus: string | null;
  newStatus: string | null;
  createdAt?: string;
}

export async function createActivity(
  user: AuthUser,
  leadId: string,
  input: CreateActivityInput,
  ip: string | null,
  ua: string | null,
): Promise<ActivityResponse> {
  // Check lead scope (closed leads are allowed)
  const scope = leadScope(user, 'l', 2);
  const leadRes = await query<{ id: string }>(
    `SELECT id FROM leads l WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
    [leadId, ...scope.params],
  );

  if (leadRes.rowCount === 0) {
    throw AppError.notFound('Lead not found');
  }

  const occurredAtDate = input.occurredAt ? new Date(input.occurredAt) : new Date();

  const insRes = await query<{
    id: string;
    type: string;
    subject: string | null;
    notes: string | null;
    outcome: string | null;
    occurred_at: Date;
    created_at: Date;
  }>(
    `INSERT INTO activities (lead_id, user_id, type, subject, notes, outcome, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, type, subject, notes, outcome, occurred_at, created_at`,
    [
      leadId,
      user.id,
      input.type,
      input.subject.trim(),
      input.notes?.trim() ?? null,
      input.outcome?.trim() ?? null,
      occurredAtDate.toISOString(),
    ],
  );

  const act = insRes.rows[0];

  await writeAuditLog({
    userId: user.id,
    action: 'activity.create',
    entityType: 'activity',
    entityId: act.id,
    newValues: {
      leadId,
      type: input.type,
      subject: input.subject.trim(),
      occurredAt: occurredAtDate.toISOString(),
    },
    ip,
    userAgent: ua,
  });

  const userRes = await query<{ id: string; first_name: string; last_name: string }>(
    `SELECT id, first_name, last_name FROM users WHERE id = $1`,
    [user.id],
  );
  const u = userRes.rows[0];

  return {
    id: act.id,
    type: act.type,
    subject: act.subject,
    notes: act.notes,
    outcome: act.outcome,
    occurredAt: new Date(act.occurred_at).toISOString(),
    user: u ? { id: u.id, name: `${u.first_name} ${u.last_name}`.trim() } : null,
    oldStatus: null,
    newStatus: null,
    createdAt: new Date(act.created_at).toISOString(),
  };
}

export async function listLeadActivities(
  user: AuthUser,
  leadId: string,
  q: ListActivitiesQuery,
) {
  // Check lead scope
  const scope = leadScope(user, 'l', 2);
  const leadRes = await query<{ id: string }>(
    `SELECT id FROM leads l WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
    [leadId, ...scope.params],
  );

  if (leadRes.rowCount === 0) {
    throw AppError.notFound('Lead not found');
  }

  const conditions: string[] = ['a.lead_id = $1'];
  const params: any[] = [leadId];

  if (q.type) {
    const types = q.type.split(',').map((t) => t.trim()).filter(Boolean);
    if (types.length > 0) {
      params.push(types);
      conditions.push(`a.type = ANY($${params.length}::text[])`);
    }
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countSql = `SELECT COUNT(*) AS total FROM activities a ${whereClause}`;
  const countRes = await query<{ total: string }>(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);

  const offset = (q.page - 1) * q.limit;
  params.push(q.limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const dataSql = `
    SELECT
      a.id,
      a.type,
      a.subject,
      a.notes,
      a.outcome,
      a.occurred_at AS "occurredAt",
      CASE
        WHEN u.id IS NOT NULL THEN
          json_build_object(
            'id', u.id,
            'name', TRIM(u.first_name || ' ' || u.last_name)
          )
        ELSE NULL
      END AS "user",
      st_old.name AS "oldStatus",
      st_new.name AS "newStatus"
    FROM activities a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN lead_statuses st_old ON st_old.id = a.old_status_id
    LEFT JOIN lead_statuses st_new ON st_new.id = a.new_status_id
    ${whereClause}
    ORDER BY a.occurred_at DESC, a.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const dataRes = await query(dataSql, params);
  const activities = dataRes.rows.map((r) => ({
    id: r.id,
    type: r.type,
    subject: r.subject,
    notes: r.notes,
    outcome: r.outcome,
    occurredAt: new Date(r.occurredAt).toISOString(),
    user: r.user,
    oldStatus: r.oldStatus ?? null,
    newStatus: r.newStatus ?? null,
  }));

  const totalPages = Math.ceil(total / q.limit);

  return {
    activities,
    meta: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages,
    },
  };
}

