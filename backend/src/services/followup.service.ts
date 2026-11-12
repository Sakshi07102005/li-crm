import { PoolClient } from 'pg';
import { AuthUser } from '../types/express';
import { query, withTransaction } from '../db/pool';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from './audit.service';
import { leadScope } from './scope.service';
import { recomputeNextFollowUp } from './followupSync';
import {
  APP_TIMEZONE,
  getStartOfToday,
  getEndOfToday,
  getEndOfThisWeek,
} from '../utils/time';
import {
  CreateFollowupInput,
  UpdateFollowupInput,
  ChangeFollowupStatusInput,
  ListFollowupsQuery,
} from '../validators/followup.validator';

export interface FollowupResponse {
  id: string;
  type: string;
  notes: string | null;
  status: string;
  scheduledAt: string;
  outcome: string | null;
  completedAt: string | null;
  isOverdue: boolean;
  daysOverdue: number;
  lead: {
    id: string;
    leadCode: string;
    leadName: string;
    companyName: string | null;
    mobile: string | null;
    email: string | null;
  };
  assignedTo: {
    id: string;
    name: string;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChangeFollowupStatusResult {
  followup: FollowupResponse;
  newFollowup?: FollowupResponse | null;
}

export async function validateAssigneeReach(
  caller: AuthUser,
  targetUserId: string,
  clientOrQuery: { query: typeof query } = { query },
): Promise<void> {
  const userRes = await clientOrQuery.query<{ id: string; is_active: boolean; manager_id: string | null }>(
    `SELECT id, is_active, manager_id FROM users WHERE id = $1`,
    [targetUserId],
  );

  if (userRes.rowCount === 0 || !userRes.rows[0].is_active) {
    throw AppError.invalidAssignee('Assignee does not exist or is inactive');
  }

  const target = userRes.rows[0];

  // Admin reach
  if (caller.permissions.includes('leads.view_all') || caller.permissions.includes('users.manage')) {
    return;
  }

  // Business Head reach
  if (caller.permissions.includes('leads.view_team') || caller.permissions.includes('users.view_team')) {
    if (target.id === caller.id || target.manager_id === caller.id) {
      return;
    }
    // Out of team reach
    throw AppError.forbidden('Assignee is outside of your team reach');
  }

  // Everyone else: self only
  if (target.id !== caller.id) {
    throw AppError.forbidden('You do not have permission to assign to other users');
  }
}

export async function createFollowup(
  user: AuthUser,
  input: CreateFollowupInput,
  ip: string | null,
  ua: string | null,
): Promise<FollowupResponse> {
  // Check lead scope and open status
  const scope = leadScope(user, 'l', 2);
  const leadRes = await query<{
    id: string;
    assigned_to: string | null;
    is_final: boolean;
  }>(
    `SELECT l.id, l.assigned_to, st.is_final
     FROM leads l
     JOIN lead_statuses st ON st.id = l.status_id
     WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
    [input.leadId, ...scope.params],
  );

  if (leadRes.rowCount === 0) {
    throw AppError.notFound('Lead not found');
  }

  const lead = leadRes.rows[0];
  if (lead.is_final) {
    throw AppError.leadClosed('Cannot schedule follow-up for a closed lead');
  }

  // Determine assignedTo
  let targetAssignee = input.assignedTo;
  if (!targetAssignee) {
    targetAssignee = lead.assigned_to || user.id;
  }

  // Validate reach if passed or different
  if (input.assignedTo) {
    await validateAssigneeReach(user, input.assignedTo);
  }

  return withTransaction(async (client, commitNow) => {
    const scheduledDate = new Date(input.scheduledAt);

    const insRes = await client.query<{ id: string }>(
      `INSERT INTO follow_ups (lead_id, assigned_to, scheduled_at, type, notes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       RETURNING id`,
      [
        input.leadId,
        targetAssignee,
        scheduledDate.toISOString(),
        input.type || 'call',
        input.notes?.trim() ?? null,
        user.id,
      ],
    );

    const followupId = insRes.rows[0].id;

    // Sync lead's next_follow_up_at
    await recomputeNextFollowUp(client, input.leadId);

    // Insert activity
    await client.query(
      `INSERT INTO activities (lead_id, user_id, type, subject)
       VALUES ($1, $2, 'follow_up', 'Follow-up scheduled')`,
      [input.leadId, user.id],
    );

    await commitNow();

    await writeAuditLog({
      userId: user.id,
      action: 'followup.create',
      entityType: 'followup',
      entityId: followupId,
      newValues: {
        leadId: input.leadId,
        assignedTo: targetAssignee,
        scheduledAt: scheduledDate.toISOString(),
        type: input.type || 'call',
      },
      ip,
      userAgent: ua,
    });

    return getFollowupById(user, followupId);
  });
}

export async function getFollowupById(user: AuthUser, id: string): Promise<FollowupResponse> {
  const scope = leadScope(user, 'l', 2);
  const sql = `
    SELECT
      f.id,
      f.type,
      f.notes,
      f.status,
      f.scheduled_at AS "scheduledAt",
      f.outcome,
      f.completed_at AS "completedAt",
      (f.status = 'pending' AND f.scheduled_at < NOW() AND st.is_final = FALSE) AS "isOverdue",
      CASE
        WHEN f.status = 'pending' AND f.scheduled_at < NOW() AND st.is_final = FALSE THEN
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - f.scheduled_at)) / 86400)::int)
        ELSE 0
      END AS "daysOverdue",
      json_build_object(
        'id', l.id,
        'leadCode', l.lead_code,
        'leadName', l.lead_name,
        'companyName', COALESCE(c.name, l.company_name),
        'mobile', l.mobile,
        'email', l.email
      ) AS lead,
      CASE
        WHEN u.id IS NOT NULL THEN
          json_build_object('id', u.id, 'name', TRIM(u.first_name || ' ' || u.last_name))
        ELSE NULL
      END AS "assignedTo"
    FROM follow_ups f
    JOIN leads l ON l.id = f.lead_id
    JOIN lead_statuses st ON st.id = l.status_id
    LEFT JOIN companies c ON c.id = l.company_id AND c.deleted_at IS NULL
    LEFT JOIN users u ON u.id = f.assigned_to
    WHERE f.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}
  `;

  const res = await query(sql, [id, ...scope.params]);
  if (res.rowCount === 0) {
    throw AppError.notFound('Follow-up not found');
  }

  const r = res.rows[0];
  return {
    id: r.id,
    type: r.type,
    notes: r.notes,
    status: r.status,
    scheduledAt: new Date(r.scheduledAt).toISOString(),
    outcome: r.outcome,
    completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
    isOverdue: Boolean(r.isOverdue),
    daysOverdue: Number(r.daysOverdue),
    lead: r.lead,
    assignedTo: r.assignedTo,
  };
}

export async function listFollowups(user: AuthUser, q: ListFollowupsQuery) {
  const scope = leadScope(user, 'l', 1);
  const conditions: string[] = ['l.deleted_at IS NULL'];
  const params: any[] = [];

  if (scope.sql !== 'TRUE') {
    scope.params.forEach((p) => params.push(p));
    conditions.push(scope.sql);
  }

  if (q.status) {
    params.push(q.status);
    conditions.push(`f.status = $${params.length}`);
  }

  if (q.type) {
    params.push(q.type);
    conditions.push(`f.type = $${params.length}`);
  }

  if (q.assignedTo) {
    params.push(q.assignedTo);
    conditions.push(`f.assigned_to = $${params.length}`);
  }

  if (q.leadId) {
    params.push(q.leadId);
    conditions.push(`f.lead_id = $${params.length}`);
  }

  if (q.from) {
    const fromDate = new Date(q.from);
    if (isNaN(fromDate.getTime())) throw AppError.validationError('Invalid from date');
    params.push(fromDate.toISOString());
    conditions.push(`f.scheduled_at >= $${params.length}`);
  }

  if (q.to) {
    const toDate = new Date(q.to);
    if (isNaN(toDate.getTime())) throw AppError.validationError('Invalid to date');
    // Whole day inclusive in APP_TIMEZONE
    const endOfDay = getEndOfToday(APP_TIMEZONE, toDate);
    params.push(endOfDay.toISOString());
    conditions.push(`f.scheduled_at <= $${params.length}`);
  }

  // overdue and due filters
  if (q.tab === 'overdue' || q.overdue) {
    conditions.push(`f.status = 'pending' AND f.scheduled_at < NOW() AND st.is_final = FALSE`);
  }

  if (q.tab === 'today' || q.due === 'today') {
    const start = getStartOfToday(APP_TIMEZONE);
    const end = getEndOfToday(APP_TIMEZONE);
    params.push(start.toISOString(), end.toISOString());
    const sIdx = params.length - 1;
    const eIdx = params.length;
    conditions.push(`f.status = 'pending' AND f.scheduled_at >= $${sIdx} AND f.scheduled_at <= $${eIdx} AND st.is_final = FALSE`);
  } else if (q.tab === 'this_week' || q.tab === 'week' || q.due === 'week') {
    const start = getStartOfToday(APP_TIMEZONE);
    const end = getEndOfThisWeek(APP_TIMEZONE);
    params.push(start.toISOString(), end.toISOString());
    const sIdx = params.length - 1;
    const eIdx = params.length;
    conditions.push(`f.status = 'pending' AND f.scheduled_at >= $${sIdx} AND f.scheduled_at <= $${eIdx} AND st.is_final = FALSE`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const orderDir = q.order === 'desc' ? 'DESC' : 'ASC';
  let orderSql = `ORDER BY f.scheduled_at ${orderDir}, f.id ASC`;
  if (q.sortBy === 'createdAt') {
    orderSql = `ORDER BY f.created_at ${orderDir}, f.id ASC`;
  }

  // Count
  const countSql = `
    SELECT COUNT(*) AS total
    FROM follow_ups f
    JOIN leads l ON l.id = f.lead_id
    JOIN lead_statuses st ON st.id = l.status_id
    ${whereClause}
  `;
  const countRes = await query<{ total: string }>(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);

  // Pagination
  const offset = (q.page - 1) * q.limit;
  params.push(q.limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const dataSql = `
    SELECT
      f.id,
      f.type,
      f.notes,
      f.status,
      f.scheduled_at AS "scheduledAt",
      f.outcome,
      f.completed_at AS "completedAt",
      (f.status = 'pending' AND f.scheduled_at < NOW() AND st.is_final = FALSE) AS "isOverdue",
      CASE
        WHEN f.status = 'pending' AND f.scheduled_at < NOW() AND st.is_final = FALSE THEN
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - f.scheduled_at)) / 86400)::int)
        ELSE 0
      END AS "daysOverdue",
      json_build_object(
        'id', l.id,
        'leadCode', l.lead_code,
        'leadName', l.lead_name,
        'companyName', COALESCE(c.name, l.company_name),
        'mobile', l.mobile,
        'email', l.email
      ) AS lead,
      CASE
        WHEN u.id IS NOT NULL THEN
          json_build_object('id', u.id, 'name', TRIM(u.first_name || ' ' || u.last_name))
        ELSE NULL
      END AS "assignedTo"
    FROM follow_ups f
    JOIN leads l ON l.id = f.lead_id
    JOIN lead_statuses st ON st.id = l.status_id
    LEFT JOIN companies c ON c.id = l.company_id AND c.deleted_at IS NULL
    LEFT JOIN users u ON u.id = f.assigned_to
    ${whereClause}
    ${orderSql}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const dataRes = await query(dataSql, params);
  const followups = dataRes.rows.map((r) => ({
    id: r.id,
    type: r.type,
    notes: r.notes,
    status: r.status,
    scheduledAt: new Date(r.scheduledAt).toISOString(),
    outcome: r.outcome,
    completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
    isOverdue: Boolean(r.isOverdue),
    daysOverdue: Number(r.daysOverdue),
    lead: r.lead,
    assignedTo: r.assignedTo,
  }));

  const totalPages = Math.ceil(total / q.limit);

  return {
    followups,
    meta: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages,
    },
  };
}

export async function updateFollowup(
  user: AuthUser,
  id: string,
  input: UpdateFollowupInput,
  ip: string | null,
  ua: string | null,
): Promise<FollowupResponse> {
  // Validate assignee reach if provided
  if (input.assignedTo) {
    await validateAssigneeReach(user, input.assignedTo);
  }

  return withTransaction(async (client, commitNow) => {
    let newFollowupId: string | null = null;
    // Lock row
    const lockRes = await client.query<{
      id: string;
      lead_id: string;
      status: string;
      scheduled_at: Date;
      type: string;
      notes: string | null;
      assigned_to: string | null;
    }>(
      `SELECT f.id, f.lead_id, f.status, f.scheduled_at, f.type, f.notes, f.assigned_to
       FROM follow_ups f
       WHERE f.id = $1
       FOR UPDATE OF f`,
      [id],
    );

    if (lockRes.rowCount === 0) {
      throw AppError.notFound('Follow-up not found');
    }

    const current = lockRes.rows[0];

    // Check scope of the lead
    const scope = leadScope(user, 'l', 2);
    const scopeCheck = await client.query(
      `SELECT 1 FROM leads l WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
      [current.lead_id, ...scope.params],
    );
    if (scopeCheck.rowCount === 0) {
      throw AppError.notFound('Follow-up not found');
    }

    // Only while status is pending (else 422 INVALID_FOLLOWUP_STATE)
    if (current.status !== 'pending') {
      throw AppError.invalidFollowupState('Cannot update follow-up that is not pending');
    }

    const targetScheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : current.scheduled_at;
    const targetType = input.type !== undefined ? input.type : current.type;
    const targetNotes = input.notes !== undefined ? (input.notes?.trim() || null) : current.notes;
    const targetAssignedTo = input.assignedTo !== undefined ? input.assignedTo : current.assigned_to;

    await client.query(
      `UPDATE follow_ups SET
         scheduled_at = $1,
         type = $2,
         notes = $3,
         assigned_to = $4,
         updated_at = NOW()
       WHERE id = $5`,
      [targetScheduledAt.toISOString(), targetType, targetNotes, targetAssignedTo, id],
    );

    // Recompute next follow up
    await recomputeNextFollowUp(client, current.lead_id);

    await commitNow();

    await writeAuditLog({
      userId: user.id,
      action: 'followup.update',
      entityType: 'followup',
      entityId: id,
      newValues: {
        scheduledAt: targetScheduledAt.toISOString(),
        type: targetType,
        assignedTo: targetAssignedTo,
      },
      ip,
      userAgent: ua,
    });

    return getFollowupById(user, id);
  });
}

export async function changeFollowupStatus(
  user: AuthUser,
  id: string,
  input: ChangeFollowupStatusInput,
  ip: string | null,
  ua: string | null,
): Promise<ChangeFollowupStatusResult> {
  return withTransaction(async (client, commitNow) => {
    let newFollowupId: string | null = null;
    // Lock row
    const lockRes = await client.query<{
      id: string;
      lead_id: string;
      status: string;
      type: string;
      assigned_to: string | null;
      notes: string | null;
    }>(
      `SELECT f.id, f.lead_id, f.status, f.type, f.assigned_to, f.notes
       FROM follow_ups f
       WHERE f.id = $1
       FOR UPDATE OF f`,
      [id],
    );

    if (lockRes.rowCount === 0) {
      throw AppError.notFound('Follow-up not found');
    }

    const current = lockRes.rows[0];

    // Check scope of the lead
    const scope = leadScope(user, 'l', 2);
    const scopeCheck = await client.query<{ is_final: boolean }>(
      `SELECT st.is_final
       FROM leads l
       JOIN lead_statuses st ON st.id = l.status_id
       WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
      [current.lead_id, ...scope.params],
    );

    if (scopeCheck.rowCount === 0) {
      throw AppError.notFound('Follow-up not found');
    }

    const leadInfo = scopeCheck.rows[0];

    // Allowed only from pending on the locked row (concurrency safety)
    if (current.status !== 'pending') {
      throw AppError.invalidFollowupState('Follow-up is not in pending status');
    }

    const outcomeText = input.outcome?.trim() ?? null;

    if (input.status === 'completed') {
      await client.query(
        `UPDATE follow_ups SET
           status = 'completed',
           outcome = $1,
           completed_at = NOW(),
           updated_at = NOW()
         WHERE id = $2`,
        [outcomeText, id],
      );

      await recomputeNextFollowUp(client, current.lead_id);

      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, subject, notes)
         VALUES ($1, $2, 'follow_up', 'Follow-up completed', $3)`,
        [current.lead_id, user.id, outcomeText],
      );
    } else if (input.status === 'missed') {
      await client.query(
        `UPDATE follow_ups SET
           status = 'missed',
           outcome = $1,
           updated_at = NOW()
         WHERE id = $2`,
        [outcomeText, id],
      );

      await recomputeNextFollowUp(client, current.lead_id);

      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, subject, notes)
         VALUES ($1, $2, 'follow_up', 'Follow-up missed', $3)`,
        [current.lead_id, user.id, outcomeText],
      );
    } else if (input.status === 'rescheduled') {
      if (leadInfo.is_final) {
        throw AppError.leadClosed('Cannot reschedule follow-up on a closed lead');
      }

      const newDate = new Date(input.newScheduledAt!);

      // Old row becomes 'rescheduled'
      await client.query(
        `UPDATE follow_ups SET
           status = 'rescheduled',
           outcome = $1,
           updated_at = NOW()
         WHERE id = $2`,
        [outcomeText, id],
      );

      // Create new pending follow-up
      const newFollowupRes = await client.query<{ id: string }>(
        `INSERT INTO follow_ups (lead_id, assigned_to, scheduled_at, type, notes, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         RETURNING id`,
        [
          current.lead_id,
          current.assigned_to,
          newDate.toISOString(),
          current.type,
          current.notes,
          user.id,
        ],
      );
      newFollowupId = newFollowupRes.rows[0].id;

      await recomputeNextFollowUp(client, current.lead_id);

      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, subject, notes)
         VALUES ($1, $2, 'follow_up', 'Follow-up rescheduled', $3)`,
        [current.lead_id, user.id, outcomeText],
      );
    }

    await commitNow();

    await writeAuditLog({
      userId: user.id,
      action: 'followup.status',
      entityType: 'followup',
      entityId: id,
      newValues: {
        status: input.status,
        outcome: outcomeText,
      },
      ip,
      userAgent: ua,
    });

    const followup = await getFollowupById(user, id);
    const newFollowup = newFollowupId ? await getFollowupById(user, newFollowupId) : null;
    return { followup, newFollowup };
  });
}

