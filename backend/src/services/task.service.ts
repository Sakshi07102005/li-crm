import { AuthUser } from '../types/express';
import { query, withTransaction, pool } from '../db/pool';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from './audit.service';
import { leadScope } from './scope.service';
import { validateAssigneeReach } from './followup.service';
import { createNotification } from './notification.service';
import {
  CreateTaskInput,
  UpdateTaskInput,
  ChangeTaskStatusInput,
  ListTasksQuery,
} from '../validators/task.validator';

export interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  isOverdue: boolean;
  lead: {
    id: string;
    leadCode: string;
    leadName: string;
  } | null;
  assignedTo: {
    id: string;
    name: string;
  };
  assignedBy: {
    id: string;
    name: string;
  } | null;
  createdAt: string;
  updatedAt?: string;
}

function taskVisibilityCondition(user: AuthUser, alias = 't', paramOffset = 1): { sql: string; params: any[] } {
  if (user.permissions.includes('tasks.manage') && user.permissions.includes('leads.view_all')) {
    // Admin sees all
    return { sql: 'TRUE', params: [] };
  }

  if (user.permissions.includes('leads.view_team')) {
    // Business Head: assigned_to = user OR assigned_by = user OR assigned_to IN (team members)
    return {
      sql: `(${alias}.assigned_to = $${paramOffset} OR ${alias}.assigned_by = $${paramOffset} OR ${alias}.assigned_to IN (SELECT id FROM users WHERE manager_id = $${paramOffset} AND is_active = TRUE))`,
      params: [user.id],
    };
  }

  // Regular user: assigned to me or assigned by me
  return {
    sql: `(${alias}.assigned_to = $${paramOffset} OR ${alias}.assigned_by = $${paramOffset})`,
    params: [user.id],
  };
}

export async function createTask(
  user: AuthUser,
  input: CreateTaskInput,
  ip: string | null,
  ua: string | null,
): Promise<TaskResponse> {
  // If leadId passed, check in scope
  if (input.leadId) {
    const scope = leadScope(user, 'l', 2);
    const lRes = await query<{ id: string }>(
      `SELECT id FROM leads l WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
      [input.leadId, ...scope.params],
    );
    if (lRes.rowCount === 0) {
      throw AppError.notFound('Lead not found');
    }
  }

  const targetAssignee = input.assignedTo || user.id;

  if (targetAssignee !== user.id) {
    if (!user.permissions.includes('tasks.assign')) {
      throw AppError.forbidden('Assigning tasks to another user requires tasks.assign permission');
    }
    await validateAssigneeReach(user, targetAssignee);
  }

  const due = input.dueDate ? new Date(input.dueDate).toISOString() : null;

  const insRes = await query<{ id: string }>(
    `INSERT INTO tasks (title, description, lead_id, assigned_to, assigned_by, due_date, priority, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING id`,
    [
      input.title.trim(),
      input.description?.trim() ?? null,
      input.leadId ?? null,
      targetAssignee,
      user.id,
      due,
      input.priority || 'medium',
    ],
  );

  const taskId = insRes.rows[0].id;

  await writeAuditLog({
    userId: user.id,
    action: 'task.create',
    entityType: 'task',
    entityId: taskId,
    newValues: {
      title: input.title.trim(),
      leadId: input.leadId ?? null,
      assignedTo: targetAssignee,
      priority: input.priority || 'medium',
    },
    ip,
    userAgent: ua,
  });

  if (targetAssignee !== user.id) {
    await createNotification(pool, {
      userId: targetAssignee,
      title: 'New Task Assigned',
      body: `Task "${input.title.trim()}" has been assigned to you`,
      type: 'task_assigned',
      entityType: 'task',
      entityId: taskId,
    });
  }

  return getTaskById(user, taskId);
}

export async function getTaskById(user: AuthUser, id: string): Promise<TaskResponse> {
  const vis = taskVisibilityCondition(user, 't', 2);

  const sql = `
    SELECT
      t.id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.due_date AS "dueDate",
      t.completed_at AS "completedAt",
      (t.status IN ('pending', 'in_progress') AND t.due_date IS NOT NULL AND t.due_date < NOW()) AS "isOverdue",
      CASE
        WHEN l.id IS NOT NULL THEN
          json_build_object(
            'id', l.id,
            'leadCode', l.lead_code,
            'leadName', l.lead_name
          )
        ELSE NULL
      END AS lead,
      json_build_object(
        'id', u_to.id,
        'name', TRIM(u_to.first_name || ' ' || u_to.last_name)
      ) AS "assignedTo",
      CASE
        WHEN u_by.id IS NOT NULL THEN
          json_build_object(
            'id', u_by.id,
            'name', TRIM(u_by.first_name || ' ' || u_by.last_name)
          )
        ELSE NULL
      END AS "assignedBy",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt"
    FROM tasks t
    LEFT JOIN leads l ON l.id = t.lead_id AND l.deleted_at IS NULL
    JOIN users u_to ON u_to.id = t.assigned_to
    LEFT JOIN users u_by ON u_by.id = t.assigned_by
    WHERE t.id = $1 AND ${vis.sql}
  `;

  const res = await query(sql, [id, ...vis.params]);
  if (res.rowCount === 0) {
    throw AppError.notFound('Task not found');
  }

  const r = res.rows[0];
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
    completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
    isOverdue: Boolean(r.isOverdue),
    lead: r.lead,
    assignedTo: r.assignedTo,
    assignedBy: r.assignedBy,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

export async function listTasks(user: AuthUser, q: ListTasksQuery) {
  const vis = taskVisibilityCondition(user, 't', 1);
  const conditions: string[] = [];
  const params: any[] = [];

  if (vis.sql !== 'TRUE') {
    vis.params.forEach((p) => params.push(p));
    conditions.push(vis.sql);
  }

  if (q.status) {
    params.push(q.status);
    conditions.push(`t.status = $${params.length}`);
  }

  if (q.priority) {
    params.push(q.priority);
    conditions.push(`t.priority = $${params.length}`);
  }

  if (q.assignedTo) {
    params.push(q.assignedTo);
    conditions.push(`t.assigned_to = $${params.length}`);
  }

  if (q.leadId) {
    params.push(q.leadId);
    conditions.push(`t.lead_id = $${params.length}`);
  }

  if (q.mine) {
    params.push(user.id);
    conditions.push(`t.assigned_to = $${params.length}`);
  }

  if (q.overdue) {
    conditions.push(`t.status IN ('pending', 'in_progress') AND t.due_date IS NOT NULL AND t.due_date < NOW()`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const orderDir = q.order === 'desc' ? 'DESC' : 'ASC';
  let orderSql = `ORDER BY t.due_date ${orderDir} NULLS LAST, t.id ASC`;
  if (q.sortBy === 'createdAt') {
    orderSql = `ORDER BY t.created_at ${orderDir}, t.id ASC`;
  } else if (q.sortBy === 'priority') {
    orderSql = `ORDER BY CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END ${orderDir}, t.id ASC`;
  }

  const countSql = `SELECT COUNT(*) AS total FROM tasks t ${whereClause}`;
  const countRes = await query<{ total: string }>(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);

  const offset = (q.page - 1) * q.limit;
  params.push(q.limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const dataSql = `
    SELECT
      t.id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.due_date AS "dueDate",
      t.completed_at AS "completedAt",
      (t.status IN ('pending', 'in_progress') AND t.due_date IS NOT NULL AND t.due_date < NOW()) AS "isOverdue",
      CASE
        WHEN l.id IS NOT NULL THEN
          json_build_object(
            'id', l.id,
            'leadCode', l.lead_code,
            'leadName', l.lead_name
          )
        ELSE NULL
      END AS lead,
      json_build_object(
        'id', u_to.id,
        'name', TRIM(u_to.first_name || ' ' || u_to.last_name)
      ) AS "assignedTo",
      CASE
        WHEN u_by.id IS NOT NULL THEN
          json_build_object(
            'id', u_by.id,
            'name', TRIM(u_by.first_name || ' ' || u_by.last_name)
          )
        ELSE NULL
      END AS "assignedBy",
      t.created_at AS "createdAt"
    FROM tasks t
    LEFT JOIN leads l ON l.id = t.lead_id AND l.deleted_at IS NULL
    JOIN users u_to ON u_to.id = t.assigned_to
    LEFT JOIN users u_by ON u_by.id = t.assigned_by
    ${whereClause}
    ${orderSql}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const dataRes = await query(dataSql, params);
  const tasks = dataRes.rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
    completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
    isOverdue: Boolean(r.isOverdue),
    lead: r.lead,
    assignedTo: r.assignedTo,
    assignedBy: r.assignedBy,
    createdAt: new Date(r.createdAt).toISOString(),
  }));

  const totalPages = Math.ceil(total / q.limit);

  return {
    tasks,
    meta: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages,
    },
  };
}

export async function updateTask(
  user: AuthUser,
  id: string,
  input: UpdateTaskInput,
  ip: string | null,
  ua: string | null,
): Promise<TaskResponse> {
  const taskRes = await query<{
    id: string;
    title: string;
    description: string | null;
    lead_id: string | null;
    assigned_to: string;
    assigned_by: string | null;
    due_date: Date | null;
    priority: string;
    status: string;
  }>(`SELECT * FROM tasks WHERE id = $1`, [id]);

  if (taskRes.rowCount === 0) {
    throw AppError.notFound('Task not found');
  }

  const current = taskRes.rows[0];

  // Permission check: assigner, admin, or business_head for team tasks
  const isAssigner = current.assigned_by === user.id;
  const isAdmin = user.permissions.includes('tasks.manage') && user.permissions.includes('leads.view_all');
  let isBhTeam = false;
  if (user.permissions.includes('leads.view_team')) {
    const teamRes = await query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND manager_id = $2 AND is_active = TRUE`,
      [current.assigned_to, user.id],
    );
    if (teamRes.rowCount && teamRes.rowCount > 0) {
      isBhTeam = true;
    }
  }

  if (!isAssigner && !isAdmin && !isBhTeam) {
    throw AppError.forbidden('Only assigner, admin, or business head for team tasks can edit this task');
  }

  // Validate lead if changed
  let targetLeadId = current.lead_id;
  if (input.leadId !== undefined) {
    targetLeadId = input.leadId;
    if (targetLeadId) {
      const scope = leadScope(user, 'l', 2);
      const lRes = await query<{ id: string }>(
        `SELECT id FROM leads l WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
        [targetLeadId, ...scope.params],
      );
      if (lRes.rowCount === 0) {
        throw AppError.notFound('Lead not found');
      }
    }
  }

  // Validate assignee if changed
  let targetAssignedTo = current.assigned_to;
  if (input.assignedTo !== undefined && input.assignedTo !== null) {
    targetAssignedTo = input.assignedTo;
    if (targetAssignedTo !== current.assigned_to && targetAssignedTo !== user.id) {
      if (!user.permissions.includes('tasks.assign')) {
        throw AppError.forbidden('Assigning tasks to another user requires tasks.assign permission');
      }
      await validateAssigneeReach(user, targetAssignedTo);
    }
  }

  const targetTitle = input.title !== undefined ? input.title.trim() : current.title;
  const targetDesc = input.description !== undefined ? (input.description?.trim() || null) : current.description;
  const targetDueDate = input.dueDate !== undefined ? (input.dueDate ? new Date(input.dueDate).toISOString() : null) : (current.due_date ? current.due_date.toISOString() : null);
  const targetPriority = input.priority !== undefined ? input.priority : current.priority;

  await query(
    `UPDATE tasks SET
       title = $1,
       description = $2,
       lead_id = $3,
       assigned_to = $4,
       due_date = $5,
       priority = $6,
       updated_at = NOW()
     WHERE id = $7`,
    [targetTitle, targetDesc, targetLeadId, targetAssignedTo, targetDueDate, targetPriority, id],
  );

  await writeAuditLog({
    userId: user.id,
    action: 'task.update',
    entityType: 'task',
    entityId: id,
    newValues: {
      title: targetTitle,
      assignedTo: targetAssignedTo,
      priority: targetPriority,
      dueDate: targetDueDate,
    },
    ip,
    userAgent: ua,
  });

  return getTaskById(user, id);
}

export async function changeTaskStatus(
  user: AuthUser,
  id: string,
  input: ChangeTaskStatusInput,
  ip: string | null,
  ua: string | null,
): Promise<TaskResponse> {
  const taskRes = await query<{
    id: string;
    lead_id: string | null;
    assigned_to: string;
    assigned_by: string | null;
    status: string;
  }>(`SELECT id, lead_id, assigned_to, assigned_by, status FROM tasks WHERE id = $1`, [id]);

  if (taskRes.rowCount === 0) {
    throw AppError.notFound('Task not found');
  }

  const task = taskRes.rows[0];

  const isAssignee = task.assigned_to === user.id;
  const isAssigner = task.assigned_by === user.id;
  const isAdmin = user.permissions.includes('tasks.manage') && user.permissions.includes('leads.view_all');

  if (!isAssignee && !isAssigner && !isAdmin) {
    throw AppError.forbidden('Only assignee, assigner, or admin can update task status');
  }

  const newStatus = input.status;
  const isCompleted = newStatus === 'completed';

  return withTransaction(async (client, commitNow) => {
    await client.query(
      `UPDATE tasks SET
         status = $1,
         completed_at = ${isCompleted ? 'NOW()' : 'NULL'},
         updated_at = NOW()
       WHERE id = $2`,
      [newStatus, id],
    );

    // If task has leadId and becomes completed, write activity {type: 'task', subject: 'Task completed'}
    if (task.lead_id && isCompleted) {
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, subject)
         VALUES ($1, $2, 'task', 'Task completed')`,
        [task.lead_id, user.id],
      );
    }

    await commitNow();

    await writeAuditLog({
      userId: user.id,
      action: 'task.status',
      entityType: 'task',
      entityId: id,
      newValues: { status: newStatus },
      ip,
      userAgent: ua,
    });

    return getTaskById(user, id);
  });
}

export async function deleteTask(
  user: AuthUser,
  id: string,
  ip: string | null,
  ua: string | null,
): Promise<void> {
  const taskRes = await query<{ id: string; assigned_by: string | null }>(
    `SELECT id, assigned_by FROM tasks WHERE id = $1`,
    [id],
  );

  if (taskRes.rowCount === 0) {
    throw AppError.notFound('Task not found');
  }

  const task = taskRes.rows[0];
  const isAssigner = task.assigned_by === user.id;
  const isAdmin = user.permissions.includes('tasks.manage') && user.permissions.includes('leads.view_all');

  if (!isAssigner && !isAdmin) {
    throw AppError.forbidden('Only assigner or admin can delete tasks');
  }

  // Hard delete
  await query(`DELETE FROM tasks WHERE id = $1`, [id]);

  await writeAuditLog({
    userId: user.id,
    action: 'task.delete',
    entityType: 'task',
    entityId: id,
    ip,
    userAgent: ua,
  });
}

