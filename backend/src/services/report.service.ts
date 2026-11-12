import { AuthUser } from '../types/express';
import { query } from '../db/pool';
import { leadScope } from './scope.service';
import { getStartOfToday, getEndOfToday } from '../utils/time';
import { exportToCSV, exportToXLSX, ExportColumn } from '../utils/exporters';

export interface ReportFilter {
  fromDate?: string;
  toDate?: string;
  productId?: number;
  sourceId?: number;
  format?: 'json' | 'csv' | 'xlsx';
}

export interface DashboardData {
  summary: {
    totalLeads: number;
    newLeads: number;
    convertedLeads: number;
    lostLeads: number;
  };
  leadsByStatus: Array<{ statusId: number; statusName: string; count: number }>;
  leadsByProduct: Array<{ productId: number; productCode: string; productName: string; count: number }>;
  leadsBySource: Array<{ sourceId: number; sourceName: string; isMarketing: boolean; count: number }>;
  pendingFollowUps: {
    today: number;
    overdue: number;
    total: number;
  };
  pendingTasks: {
    overdue: number;
    total: number;
  };
}

/**
 * Builds standard scoped lead query conditions.
 */
function buildScopedLeadWhere(
  user: AuthUser,
  alias = 'l',
  filters: ReportFilter = {},
  paramOffset = 1,
): { sql: string; params: any[] } {
  const scope = leadScope(user, alias, paramOffset);
  const whereParts: string[] = [`${alias}.deleted_at IS NULL`, scope.sql];
  const params: any[] = [...scope.params];
  let offset = paramOffset + scope.params.length;

  if (filters.fromDate) {
    whereParts.push(`${alias}.created_at >= $${offset++}`);
    params.push(new Date(filters.fromDate).toISOString());
  }

  if (filters.toDate) {
    whereParts.push(`${alias}.created_at <= $${offset++}`);
    params.push(new Date(filters.toDate).toISOString());
  }

  if (filters.productId) {
    whereParts.push(`${alias}.product_id = $${offset++}`);
    params.push(filters.productId);
  }

  if (filters.sourceId) {
    whereParts.push(`${alias}.source_id = $${offset++}`);
    params.push(filters.sourceId);
  }

  return {
    sql: whereParts.join(' AND '),
    params,
  };
}

/**
 * Aggregates main dashboard metrics for caller's authorized scope.
 */
export async function getDashboardData(user: AuthUser): Promise<DashboardData> {
  const scoped = buildScopedLeadWhere(user, 'l');

  // 1. Lead summary counts
  const summarySql = `
    SELECT
      COUNT(*)::int AS "totalLeads",
      COUNT(CASE WHEN st.name = 'New Lead' THEN 1 END)::int AS "newLeads",
      COUNT(CASE WHEN st.name = 'Converted' THEN 1 END)::int AS "convertedLeads",
      COUNT(CASE WHEN st.name = 'Lost' THEN 1 END)::int AS "lostLeads"
    FROM leads l
    JOIN lead_statuses st ON st.id = l.status_id
    WHERE ${scoped.sql}
  `;
  const summaryRes = await query(summarySql, scoped.params);
  const sumRow = summaryRes.rows[0] || {};

  // 2. Leads by status
  const statusSql = `
    SELECT
      st.id AS "statusId",
      st.name AS "statusName",
      COUNT(l.id)::int AS count
    FROM lead_statuses st
    LEFT JOIN leads l ON l.status_id = st.id AND ${scoped.sql}
    GROUP BY st.id, st.name, st.sort_order
    ORDER BY st.sort_order ASC
  `;
  const statusRes = await query(statusSql, scoped.params);

  // 3. Leads by product
  const productSql = `
    SELECT
      p.id AS "productId",
      p.code AS "productCode",
      p.name AS "productName",
      COUNT(l.id)::int AS count
    FROM products p
    LEFT JOIN leads l ON l.product_id = p.id AND ${scoped.sql}
    GROUP BY p.id, p.code, p.name
    ORDER BY p.name ASC
  `;
  const productRes = await query(productSql, scoped.params);

  // 4. Leads by source
  const sourceSql = `
    SELECT
      s.id AS "sourceId",
      s.name AS "sourceName",
      s.is_marketing AS "isMarketing",
      COUNT(l.id)::int AS count
    FROM lead_sources s
    LEFT JOIN leads l ON l.source_id = s.id AND ${scoped.sql}
    GROUP BY s.id, s.name, s.is_marketing
    ORDER BY s.name ASC
  `;
  const sourceRes = await query(sourceSql, scoped.params);

  // 5. Pending follow-ups
  const startToday = getStartOfToday().toISOString();
  const endToday = getEndOfToday().toISOString();
  const followUpScope = leadScope(user, 'l', 3);

  const followUpSql = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(CASE WHEN f.scheduled_at < $1 THEN 1 END)::int AS overdue,
      COUNT(CASE WHEN f.scheduled_at >= $1 AND f.scheduled_at <= $2 THEN 1 END)::int AS today
    FROM follow_ups f
    JOIN leads l ON l.id = f.lead_id AND l.deleted_at IS NULL
    WHERE f.status = 'pending'
      AND ${followUpScope.sql}
  `;
  const followUpRes = await query(followUpSql, [startToday, endToday, ...followUpScope.params]);
  const fRow = followUpRes.rows[0] || {};

  // 6. Pending tasks
  const nowIso = new Date().toISOString();
  let taskWhere = `t.status IN ('pending', 'in_progress')`;
  const taskParams: any[] = [nowIso];

  if (!user.permissions.includes('tasks.manage') || !user.permissions.includes('leads.view_all')) {
    if (user.permissions.includes('leads.view_team')) {
      taskWhere += ` AND (t.assigned_to = $2 OR t.assigned_by = $2 OR t.assigned_to IN (SELECT id FROM users WHERE manager_id = $2))`;
      taskParams.push(user.id);
    } else {
      taskWhere += ` AND (t.assigned_to = $2 OR t.assigned_by = $2)`;
      taskParams.push(user.id);
    }
  }

  const taskSql = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(CASE WHEN t.due_date < $1 THEN 1 END)::int AS overdue
    FROM tasks t
    WHERE ${taskWhere}
  `;
  const taskRes = await query(taskSql, taskParams);
  const tRow = taskRes.rows[0] || {};

  return {
    summary: {
      totalLeads: Number(sumRow.totalLeads || 0),
      newLeads: Number(sumRow.newLeads || 0),
      convertedLeads: Number(sumRow.convertedLeads || 0),
      lostLeads: Number(sumRow.lostLeads || 0),
    },
    leadsByStatus: statusRes.rows.map((r) => ({
      statusId: Number(r.statusId),
      statusName: String(r.statusName),
      count: Number(r.count || 0),
    })),
    leadsByProduct: productRes.rows.map((r) => ({
      productId: Number(r.productId),
      productCode: String(r.productCode),
      productName: String(r.productName),
      count: Number(r.count || 0),
    })),
    leadsBySource: sourceRes.rows.map((r) => ({
      sourceId: Number(r.sourceId),
      sourceName: String(r.sourceName),
      isMarketing: Boolean(r.isMarketing),
      count: Number(r.count || 0),
    })),
    pendingFollowUps: {
      today: Number(fRow.today || 0),
      overdue: Number(fRow.overdue || 0),
      total: Number(fRow.total || 0),
    },
    pendingTasks: {
      overdue: Number(tRow.overdue || 0),
      total: Number(tRow.total || 0),
    },
  };
}

/**
 * Report: Leads by status.
 */
export async function getLeadsByStatusReport(
  user: AuthUser,
  filters: ReportFilter = {},
): Promise<{ rows: any[]; columns: ExportColumn[] }> {
  const scoped = buildScopedLeadWhere(user, 'l', filters);

  const sql = `
    SELECT
      st.name AS "status",
      COUNT(l.id)::int AS "count"
    FROM lead_statuses st
    LEFT JOIN leads l ON l.status_id = st.id AND ${scoped.sql}
    GROUP BY st.id, st.name, st.sort_order
    ORDER BY st.sort_order ASC
  `;
  const res = await query(sql, scoped.params);
  const total = res.rows.reduce((acc, r) => acc + Number(r.count), 0);

  const rows = res.rows.map((r) => {
    const count = Number(r.count);
    const percentage = total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0;
    return {
      status: r.status,
      count,
      percentage,
    };
  });

  const columns: ExportColumn[] = [
    { header: 'Status', key: 'status', width: 22 },
    { header: 'Lead Count', key: 'count', width: 14 },
    { header: 'Percentage (%)', key: 'percentage', width: 16 },
  ];

  return { rows, columns };
}

/**
 * Report: Leads by source.
 */
export async function getLeadsBySourceReport(
  user: AuthUser,
  filters: ReportFilter = {},
): Promise<{ rows: any[]; columns: ExportColumn[] }> {
  const scoped = buildScopedLeadWhere(user, 'l', filters);

  const sql = `
    SELECT
      s.name AS "source",
      s.is_marketing AS "isMarketing",
      COUNT(l.id)::int AS "count"
    FROM lead_sources s
    LEFT JOIN leads l ON l.source_id = s.id AND ${scoped.sql}
    GROUP BY s.id, s.name, s.is_marketing
    ORDER BY "count" DESC, s.name ASC
  `;
  const res = await query(sql, scoped.params);
  const total = res.rows.reduce((acc, r) => acc + Number(r.count), 0);

  const rows = res.rows.map((r) => {
    const count = Number(r.count);
    const percentage = total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0;
    return {
      source: r.source,
      isMarketing: Boolean(r.isMarketing),
      count,
      percentage,
    };
  });

  const columns: ExportColumn[] = [
    { header: 'Source', key: 'source', width: 22 },
    { header: 'Marketing Channel', key: 'isMarketing', width: 18 },
    { header: 'Lead Count', key: 'count', width: 14 },
    { header: 'Percentage (%)', key: 'percentage', width: 16 },
  ];

  return { rows, columns };
}

/**
 * Report: Leads by product vertical.
 */
export async function getLeadsByProductReport(
  user: AuthUser,
  filters: ReportFilter = {},
): Promise<{ rows: any[]; columns: ExportColumn[] }> {
  const scoped = buildScopedLeadWhere(user, 'l', filters);

  const sql = `
    SELECT
      p.code AS "productCode",
      p.name AS "productName",
      COUNT(l.id)::int AS "count"
    FROM products p
    LEFT JOIN leads l ON l.product_id = p.id AND ${scoped.sql}
    GROUP BY p.id, p.code, p.name
    ORDER BY p.name ASC
  `;
  const res = await query(sql, scoped.params);
  const total = res.rows.reduce((acc, r) => acc + Number(r.count), 0);

  const rows = res.rows.map((r) => {
    const count = Number(r.count);
    const percentage = total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0;
    return {
      productCode: r.productCode,
      productName: r.productName,
      count,
      percentage,
    };
  });

  const columns: ExportColumn[] = [
    { header: 'Product Code', key: 'productCode', width: 20 },
    { header: 'Product Name', key: 'productName', width: 25 },
    { header: 'Lead Count', key: 'count', width: 14 },
    { header: 'Percentage (%)', key: 'percentage', width: 16 },
  ];

  return { rows, columns };
}

/**
 * Report: Team performance.
 */
export async function getTeamPerformanceReport(
  user: AuthUser,
  _filters: ReportFilter = {},
): Promise<{ rows: any[]; columns: ExportColumn[] }> {
  let userCondition = 'u.is_active = TRUE';
  const userParams: any[] = [];

  if (user.permissions.includes('reports.view_team') && !user.permissions.includes('reports.view_all')) {
    userCondition += ` AND (u.id = $1 OR u.manager_id = $1)`;
    userParams.push(user.id);
  } else if (user.permissions.includes('reports.view_own')) {
    userCondition += ` AND u.id = $1`;
    userParams.push(user.id);
  }

  const sql = `
    SELECT
      u.id AS "userId",
      TRIM(u.first_name || ' ' || u.last_name) AS "userName",
      u.email,
      r.name AS "roleName",
      COUNT(DISTINCT l_created.id)::int AS "leadsCreated",
      COUNT(DISTINCT l_assigned.id)::int AS "leadsAssigned",
      COUNT(DISTINCT CASE WHEN st_assigned.name = 'Converted' THEN l_assigned.id END)::int AS "leadsConverted",
      COUNT(DISTINCT f_done.id)::int AS "followupsCompleted"
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN leads l_created ON l_created.created_by = u.id AND l_created.deleted_at IS NULL
    LEFT JOIN leads l_assigned ON l_assigned.assigned_to = u.id AND l_assigned.deleted_at IS NULL
    LEFT JOIN lead_statuses st_assigned ON st_assigned.id = l_assigned.status_id
    LEFT JOIN follow_ups f_done ON f_done.assigned_to = u.id AND f_done.status = 'completed'
    WHERE ${userCondition}
    GROUP BY u.id, u.first_name, u.last_name, u.email, r.name
    ORDER BY "leadsConverted" DESC, "leadsAssigned" DESC, "userName" ASC
  `;

  const res = await query(sql, userParams);

  const rows = res.rows.map((r) => ({
    userId: r.userId,
    userName: r.userName,
    email: r.email,
    role: r.roleName,
    leadsCreated: Number(r.leadsCreated || 0),
    leadsAssigned: Number(r.leadsAssigned || 0),
    leadsConverted: Number(r.leadsConverted || 0),
    followupsCompleted: Number(r.followupsCompleted || 0),
  }));

  const columns: ExportColumn[] = [
    { header: 'Employee', key: 'userName', width: 24 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Role', key: 'role', width: 20 },
    { header: 'Leads Created', key: 'leadsCreated', width: 16 },
    { header: 'Leads Assigned', key: 'leadsAssigned', width: 16 },
    { header: 'Converted', key: 'leadsConverted', width: 14 },
    { header: 'Follow-ups Done', key: 'followupsCompleted', width: 18 },
  ];

  return { rows, columns };
}

/**
 * Report: Lead conversion rates.
 */
export async function getConversionRatesReport(
  user: AuthUser,
  filters: ReportFilter = {},
): Promise<{ rows: any[]; columns: ExportColumn[] }> {
  const scoped = buildScopedLeadWhere(user, 'l', filters);

  const sql = `
    SELECT
      p.name AS "product",
      s.name AS "source",
      COUNT(l.id)::int AS "totalLeads",
      COUNT(CASE WHEN st.name = 'Converted' THEN 1 END)::int AS "convertedCount",
      COUNT(CASE WHEN st.name = 'Lost' THEN 1 END)::int AS "lostCount"
    FROM leads l
    JOIN products p ON p.id = l.product_id
    JOIN lead_sources s ON s.id = l.source_id
    JOIN lead_statuses st ON st.id = l.status_id
    WHERE ${scoped.sql}
    GROUP BY p.name, s.name
    ORDER BY "totalLeads" DESC
  `;

  const res = await query(sql, scoped.params);

  const rows = res.rows.map((r) => {
    const totalLeads = Number(r.totalLeads || 0);
    const convertedCount = Number(r.convertedCount || 0);
    const lostCount = Number(r.lostCount || 0);
    const conversionRate = totalLeads > 0 ? Number(((convertedCount / totalLeads) * 100).toFixed(2)) : 0;
    return {
      product: r.product,
      source: r.source,
      totalLeads,
      convertedCount,
      lostCount,
      conversionRate,
    };
  });

  const columns: ExportColumn[] = [
    { header: 'Product', key: 'product', width: 24 },
    { header: 'Source', key: 'source', width: 22 },
    { header: 'Total Leads', key: 'totalLeads', width: 14 },
    { header: 'Converted', key: 'convertedCount', width: 14 },
    { header: 'Lost', key: 'lostCount', width: 12 },
    { header: 'Conversion Rate (%)', key: 'conversionRate', width: 20 },
  ];

  return { rows, columns };
}

export { exportToCSV, exportToXLSX };

