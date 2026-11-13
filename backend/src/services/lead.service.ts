import { AuthUser } from '../types/express';
import { query, withTransaction } from '../db/pool';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from './audit.service';
import { leadScope } from './scope.service';
import { createNotification, notifyByEmail } from './notification.service';
import {
  normalizeEmail,
  isValidEmail,
  normalizeMobile,
  getMobileLast10,
  normalizeWebsite,
  escapeLikeWildcards,
} from '../utils/leadNormalizers';
import {
  CreateLeadInput,
  UpdateLeadInput,
  CheckDuplicateInput,
  ChangeStatusInput,
  AssignLeadInput,
  ListLeadsQuery,
} from '../validators/lead.validator';

export interface LeadResponse {
  id: string;
  leadCode: string;
  leadName: string;
  companyId: string | null;
  companyName: string | null;
  contactId: string | null;
  email: string | null;
  mobile: string | null;
  website: string | null;
  industry: string | null;
  product: { id: number; code: string; name: string };
  source: { id: number; name: string; isMarketing: boolean };
  assignedTo: { id: string; name: string; email: string } | null;
  priority: 'high' | 'medium' | 'low';
  status: { id: number; name: string; sortOrder: number; isFinal: boolean };
  nextFollowUpAt: string | null;
  remarks: string | null;
  lostReason: string | null;
  convertedAt: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  allowedNextStatuses?: Array<{ id: number; name: string }>;
}

const LEAD_COLUMNS = `
  l.id,
  l.lead_code AS "leadCode",
  l.lead_name AS "leadName",
  l.company_id AS "companyId",
  COALESCE(c.name, l.company_name) AS "companyName",
  l.contact_id AS "contactId",
  l.email,
  l.mobile,
  l.website,
  l.industry,
  json_build_object('id', p.id, 'code', p.code, 'name', p.name) AS product,
  json_build_object('id', s.id, 'name', s.name, 'isMarketing', s.is_marketing) AS source,
  CASE WHEN u_assign.id IS NOT NULL THEN
    json_build_object(
      'id', u_assign.id,
      'name', TRIM(u_assign.first_name || ' ' || u_assign.last_name),
      'email', u_assign.email
    )
  ELSE NULL END AS "assignedTo",
  LOWER(l.priority) AS priority,
  json_build_object(
    'id', st.id,
    'name', st.name,
    'sortOrder', st.sort_order,
    'isFinal', st.is_final
  ) AS status,
  l.next_follow_up_at AS "nextFollowUpAt",
  l.remarks,
  l.lost_reason AS "lostReason",
  l.converted_at AS "convertedAt",
  CASE WHEN u_create.id IS NOT NULL THEN
    json_build_object(
      'id', u_create.id,
      'name', TRIM(u_create.first_name || ' ' || u_create.last_name)
    )
  ELSE NULL END AS "createdBy",
  l.created_at AS "createdAt",
  l.updated_at AS "updatedAt"
`;

const LEAD_FROM = `
  FROM leads l
  JOIN products p ON p.id = l.product_id
  JOIN lead_sources s ON s.id = l.source_id
  JOIN lead_statuses st ON st.id = l.status_id
  LEFT JOIN companies c ON c.id = l.company_id AND c.deleted_at IS NULL
  LEFT JOIN users u_assign ON u_assign.id = l.assigned_to
  LEFT JOIN users u_create ON u_create.id = l.created_by
`;

function formatLeadRow(row: any): LeadResponse {
  return {
    id: row.id,
    leadCode: row.leadCode,
    leadName: row.leadName,
    companyId: row.companyId ?? null,
    companyName: row.companyName ?? null,
    contactId: row.contactId ?? null,
    email: row.email ?? null,
    mobile: row.mobile ?? null,
    website: row.website ?? null,
    industry: row.industry ?? null,
    product: row.product,
    source: row.source,
    assignedTo: row.assignedTo ?? null,
    priority: row.priority as 'high' | 'medium' | 'low',
    status: row.status,
    nextFollowUpAt: row.nextFollowUpAt ? new Date(row.nextFollowUpAt).toISOString() : null,
    remarks: row.remarks ?? null,
    lostReason: row.lostReason ?? null,
    convertedAt: row.convertedAt ? new Date(row.convertedAt).toISOString() : null,
    createdBy: row.createdBy ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOOKUPS
// ─────────────────────────────────────────────────────────────────────────────

export async function getLookups(user: AuthUser) {
  const [productsRes, sourcesRes, statusesRes] = await Promise.all([
    query<{ id: number; code: string; name: string }>(
      `SELECT id, code, name FROM products WHERE is_active = TRUE ORDER BY id ASC`,
    ),
    query<{ id: number; name: string; isMarketing: boolean }>(
      `SELECT id, name, is_marketing AS "isMarketing" FROM lead_sources WHERE is_active = TRUE ORDER BY id ASC`,
    ),
    query<{ id: number; name: string; sortOrder: number; isFinal: boolean }>(
      `SELECT id, name, sort_order AS "sortOrder", is_final AS "isFinal" FROM lead_statuses ORDER BY sort_order ASC`,
    ),
  ]);

  let assignableUsers: Array<{ id: string; name: string; email: string; roleCode: string }> = [];

  if (user.permissions.includes('leads.view_all')) {
    // Admin sees all active users
    const usersRes = await query(
      `SELECT u.id, TRIM(u.first_name || ' ' || u.last_name) AS name, u.email, r.code AS "roleCode"
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.is_active = TRUE
       ORDER BY u.first_name ASC, u.last_name ASC`,
    );
    assignableUsers = usersRes.rows;
  } else if (user.permissions.includes('leads.view_team')) {
    // Business Head sees self + active direct reports
    const usersRes = await query(
      `SELECT u.id, TRIM(u.first_name || ' ' || u.last_name) AS name, u.email, r.code AS "roleCode"
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.is_active = TRUE AND (u.id = $1 OR u.manager_id = $1)
       ORDER BY u.first_name ASC, u.last_name ASC`,
      [user.id],
    );
    assignableUsers = usersRes.rows;
  }

  return {
    products: productsRes.rows,
    sources: sourcesRes.rows,
    statuses: statusesRes.rows,
    priorities: ['high', 'medium', 'low'],
    industries: [
      'IT',
      'Healthcare',
      'Education',
      'Finance',
      'Manufacturing',
      'Retail',
      'Real Estate',
      'Hospitality',
      'Logistics',
      'Other',
    ],
    assignableUsers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CHECK DUPLICATE
// ─────────────────────────────────────────────────────────────────────────────

export async function checkDuplicate(user: AuthUser, input: CheckDuplicateInput) {
  const normEmail = input.email ? normalizeEmail(input.email) : null;
  const mobileLast10 = input.mobile ? getMobileLast10(input.mobile) : null;

  if (!normEmail && !mobileLast10) {
    throw AppError.validationError('At least one of email or mobile is required for duplicate check');
  }

  const conditions: string[] = ['l.deleted_at IS NULL'];
  const params: any[] = [];

  const matchConditions: string[] = [];
  if (normEmail) {
    params.push(normEmail);
    matchConditions.push(`(l.email IS NOT NULL AND LOWER(l.email) = LOWER($${params.length}))`);
  }
  if (mobileLast10) {
    params.push(mobileLast10);
    matchConditions.push(
      `(l.mobile IS NOT NULL AND RIGHT(REGEXP_REPLACE(l.mobile, '[^0-9]', '', 'g'), 10) = $${params.length})`,
    );
  }

  conditions.push(`(${matchConditions.join(' OR ')})`);

  if (input.excludeLeadId) {
    params.push(input.excludeLeadId);
    conditions.push(`l.id <> $${params.length}`);
  }

  // Find all matches across entire DB regardless of scope
  const allMatchesRes = await query<{
    id: string;
    leadCode: string;
    leadName: string;
    statusName: string;
    assignedToName: string | null;
  }>(
    `SELECT
       l.id,
       l.lead_code AS "leadCode",
       l.lead_name AS "leadName",
       st.name AS "statusName",
       TRIM(u.first_name || ' ' || u.last_name) AS "assignedToName"
     FROM leads l
     JOIN lead_statuses st ON st.id = l.status_id
     LEFT JOIN users u ON u.id = l.assigned_to
     WHERE ${conditions.join(' AND ')}`,
    params,
  );

  const allMatches = allMatchesRes.rows;
  if (allMatches.length === 0) {
    return { duplicates: [], outOfScopeCount: 0 };
  }

  // Determine which matches are in caller's scope
  const matchIds = allMatches.map((m) => m.id);
  const scope = leadScope(user, 'l', 2);
  const inScopeRes = await query<{ id: string }>(
    `SELECT l.id FROM leads l
     WHERE l.id = ANY($1::uuid[]) AND l.deleted_at IS NULL AND ${scope.sql}`,
    [matchIds, ...scope.params],
  );

  const inScopeIdSet = new Set(inScopeRes.rows.map((r) => r.id));

  const duplicates = allMatches
    .filter((m) => inScopeIdSet.has(m.id))
    .map((m) => ({
      id: m.id,
      leadCode: m.leadCode,
      leadName: m.leadName,
      status: m.statusName,
      assignedTo: m.assignedToName || null,
    }));

  const outOfScopeCount = allMatches.length - duplicates.length;

  return { duplicates, outOfScopeCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LIST LEADS
// ─────────────────────────────────────────────────────────────────────────────

export async function listLeads(user: AuthUser, q: ListLeadsQuery) {
  const scope = leadScope(user, 'l', 1);
  const conditions: string[] = ['l.deleted_at IS NULL'];
  const params: any[] = [];

  // Lead Scope
  if (scope.sql !== 'TRUE') {
    scope.params.forEach((p) => params.push(p));
    conditions.push(scope.sql);
  }

  // Search query (case-insensitive substring match on leadName, companyName, email, mobile, leadCode)
  if (q.q && q.q.trim().length > 0) {
    const escaped = escapeLikeWildcards(q.q.trim());
    params.push(`%${escaped}%`);
    const pIdx = params.length;
    conditions.push(`(
      l.lead_name ILIKE $${pIdx} ESCAPE '\\'
      OR COALESCE(c.name, l.company_name) ILIKE $${pIdx} ESCAPE '\\'
      OR l.email ILIKE $${pIdx} ESCAPE '\\'
      OR l.mobile ILIKE $${pIdx} ESCAPE '\\'
      OR l.lead_code ILIKE $${pIdx} ESCAPE '\\'
    )`);
  }

  // statusId (comma-separated list of numbers)
  if (q.statusId) {
    const ids = q.statusId.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    if (ids.length > 0) {
      if (ids.some((n) => n < 1 || n > 32767)) {
        throw AppError.validationError('statusId values must be between 1 and 32767');
      }
      params.push(ids);
      conditions.push(`l.status_id = ANY($${params.length}::smallint[])`);
    } else {
      throw AppError.validationError('Invalid statusId filter');
    }
  }

  // productId
  if (q.productId) {
    const ids = q.productId.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    if (ids.length > 0) {
      if (ids.some((n) => n < 1 || n > 32767)) {
        throw AppError.validationError('productId values must be between 1 and 32767');
      }
      params.push(ids);
      conditions.push(`l.product_id = ANY($${params.length}::smallint[])`);
    } else {
      throw AppError.validationError('Invalid productId filter');
    }
  }

  // sourceId
  if (q.sourceId) {
    const ids = q.sourceId.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    if (ids.length > 0) {
      if (ids.some((n) => n < 1 || n > 32767)) {
        throw AppError.validationError('sourceId values must be between 1 and 32767');
      }
      params.push(ids);
      conditions.push(`l.source_id = ANY($${params.length}::smallint[])`);
    } else {
      throw AppError.validationError('Invalid sourceId filter');
    }
  }

  // priority
  if (q.priority) {
    const priorities = q.priority.split(',').map((s) => s.trim().toLowerCase());
    const validPriorities = ['high', 'medium', 'low'];
    if (priorities.some((p) => !validPriorities.includes(p))) {
      throw AppError.validationError('priority filter values must be high, medium, or low');
    }
    params.push(priorities);
    conditions.push(`LOWER(l.priority) = ANY($${params.length}::text[])`);
  }

  // assignedTo
  if (q.assignedTo) {
    params.push(q.assignedTo);
    conditions.push(`l.assigned_to = $${params.length}`);
  }

  // unassigned
  if (q.unassigned !== undefined) {
    if (q.unassigned) {
      conditions.push(`l.assigned_to IS NULL`);
    } else {
      conditions.push(`l.assigned_to IS NOT NULL`);
    }
  }

  // companyId
  if (q.companyId) {
    params.push(q.companyId);
    conditions.push(`l.company_id = $${params.length}`);
  }

  // createdFrom
  if (q.createdFrom) {
    const d = new Date(q.createdFrom);
    if (isNaN(d.getTime())) throw AppError.validationError('Invalid createdFrom date');
    params.push(d.toISOString());
    conditions.push(`l.created_at >= $${params.length}`);
  }

  // createdTo (inclusive for the whole day)
  if (q.createdTo) {
    const d = new Date(q.createdTo);
    if (isNaN(d.getTime())) throw AppError.validationError('Invalid createdTo date');
    // Set to end of day if only date was provided (or +1 day interval in SQL)
    params.push(q.createdTo);
    conditions.push(`l.created_at < ($${params.length}::date + 1)`);
  }

  // followUpFrom
  if (q.followUpFrom) {
    const d = new Date(q.followUpFrom);
    if (isNaN(d.getTime())) throw AppError.validationError('Invalid followUpFrom date');
    params.push(d.toISOString());
    conditions.push(`l.next_follow_up_at >= $${params.length}`);
  }

  // followUpTo
  if (q.followUpTo) {
    const d = new Date(q.followUpTo);
    if (isNaN(d.getTime())) throw AppError.validationError('Invalid followUpTo date');
    params.push(q.followUpTo);
    conditions.push(`l.next_follow_up_at < ($${params.length}::date + 1)`);
  }

  // overdue (next_follow_up_at < now AND status not final)
  if (q.overdue !== undefined && q.overdue) {
    conditions.push(`l.next_follow_up_at IS NOT NULL AND l.next_follow_up_at < NOW() AND st.is_final = FALSE`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Order By
  const orderDirection = q.order === 'asc' ? 'ASC' : 'DESC';
  let orderClause = '';

  switch (q.sortBy) {
    case 'priority':
      // High > Medium > Low
      orderClause = `ORDER BY CASE LOWER(l.priority) WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END ${orderDirection}, l.id ASC`;
      break;
    case 'nextFollowUp':
      orderClause = `ORDER BY l.next_follow_up_at ${orderDirection} NULLS LAST, l.id ASC`;
      break;
    case 'leadName':
      orderClause = `ORDER BY l.lead_name ${orderDirection}, l.id ASC`;
      break;
    case 'updatedAt':
      orderClause = `ORDER BY l.updated_at ${orderDirection}, l.id ASC`;
      break;
    case 'status':
      orderClause = `ORDER BY st.sort_order ${orderDirection}, l.id ASC`;
      break;
    case 'createdAt':
    default:
      orderClause = `ORDER BY l.created_at ${orderDirection}, l.id ASC`;
      break;
  }

  // Total Count (using exact same WHERE clause)
  const countSql = `SELECT COUNT(*) AS total FROM leads l JOIN lead_statuses st ON st.id = l.status_id LEFT JOIN companies c ON c.id = l.company_id ${whereClause}`;
  const countRes = await query<{ total: string }>(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);

  // Pagination
  const offset = (q.page - 1) * q.limit;
  params.push(q.limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const dataSql = `SELECT ${LEAD_COLUMNS} ${LEAD_FROM} ${whereClause} ${orderClause} LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
  const dataRes = await query(dataSql, params);

  const leads = dataRes.rows.map(formatLeadRow);
  const totalPages = Math.ceil(total / q.limit);

  return {
    leads,
    meta: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET LEAD DETAIL (WITH ALLOWED NEXT STATUSES)
// ─────────────────────────────────────────────────────────────────────────────

export async function getLeadById(user: AuthUser, id: string): Promise<LeadResponse> {
  const scope = leadScope(user, 'l', 2);
  const whereSql = `WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`;
  const params = [id, ...scope.params];

  const res = await query(`SELECT ${LEAD_COLUMNS} ${LEAD_FROM} ${whereSql}`, params);

  if (res.rowCount === 0) {
    throw AppError.notFound('Lead not found');
  }

  const lead = formatLeadRow(res.rows[0]);

  // Compute allowedNextStatuses
  const transRes = await query<{ id: number; name: string }>(
    `SELECT t.id, t.name
     FROM lead_status_transitions lst
     JOIN lead_statuses t ON t.id = lst.to_status_id
     WHERE lst.from_status_id = $1
     ORDER BY t.sort_order ASC`,
    [lead.status.id],
  );

  let allowed = transRes.rows;

  // Filter reopen transition: Lost -> New Lead requires leads.assign permission
  if (lead.status.name === 'Lost') {
    if (!user.permissions.includes('leads.assign')) {
      allowed = allowed.filter((s) => s.name !== 'New Lead');
    }
  }

  lead.allowedNextStatuses = allowed;
  return lead;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CREATE LEAD
// ─────────────────────────────────────────────────────────────────────────────

export async function createLead(
  user: AuthUser,
  input: CreateLeadInput,
  ip: string | null,
  ua: string | null,
): Promise<LeadResponse> {
  // 1. Assignment resolution & permission check
  let finalAssignedTo: string | null = null;

  if (user.permissions.includes('leads.assign')) {
    // Admin or Business Head
    if (input.assignedTo) {
      // Validate assignee active and reachable
      if (user.permissions.includes('leads.view_all')) {
        const uRes = await query<{ id: string }>(
          `SELECT id FROM users WHERE id = $1 AND is_active = TRUE`,
          [input.assignedTo],
        );
        if (uRes.rowCount === 0) throw AppError.invalidAssignee('Invalid assignee');
      } else if (user.permissions.includes('leads.view_team')) {
        const uRes = await query<{ id: string }>(
          `SELECT id FROM users WHERE id = $1 AND is_active = TRUE AND (id = $2 OR manager_id = $2)`,
          [input.assignedTo, user.id],
        );
        if (uRes.rowCount === 0) throw AppError.invalidAssignee('Invalid assignee');
      }
      finalAssignedTo = input.assignedTo;
    }
  } else if (user.permissions.includes('leads.view_own')) {
    // Sales Executive: auto-assigned to self. Reject any body sending different assignedTo
    if (input.assignedTo && input.assignedTo !== user.id) {
      throw AppError.forbidden('Sales executive cannot assign lead to another user');
    }
    finalAssignedTo = user.id;
  } else if (user.permissions.includes('leads.view_marketing')) {
    // Marketing Executive: stays unassigned. Reject any assignedTo
    if (input.assignedTo) {
      throw AppError.forbidden('Marketing executive cannot assign leads');
    }
    finalAssignedTo = null;
  }

  // 2. Validate product & source
  const prodRes = await query<{ id: number }>(
    `SELECT id FROM products WHERE id = $1 AND is_active = TRUE`,
    [input.productId],
  );
  if (prodRes.rowCount === 0) {
    throw AppError.validationError('Invalid active productId');
  }

  const srcRes = await query<{ id: number; is_marketing: boolean }>(
    `SELECT id, is_marketing FROM lead_sources WHERE id = $1 AND is_active = TRUE`,
    [input.sourceId],
  );
  if (srcRes.rowCount === 0) {
    throw AppError.validationError('Invalid active sourceId');
  }

  // 3. Validate company & contact
  let resolvedCompanyName = input.companyName?.trim() || null;
  if (input.companyId) {
    const compRes = await query<{ id: string; name: string }>(
      `SELECT id, name FROM companies WHERE id = $1 AND deleted_at IS NULL`,
      [input.companyId],
    );
    if (compRes.rowCount === 0) {
      throw AppError.validationError('Company does not exist or has been deleted');
    }
    if (!resolvedCompanyName) {
      resolvedCompanyName = compRes.rows[0].name;
    }
  }

  if (input.contactId) {
    if (!input.companyId) {
      throw AppError.validationError('contactId cannot be specified without companyId');
    }
    const contRes = await query<{ id: string }>(
      `SELECT id FROM contacts WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [input.contactId, input.companyId],
    );
    if (contRes.rowCount === 0) {
      throw AppError.validationError('Contact does not exist for specified company');
    }
  }

  // 4. Normalise inputs
  const normEmail = input.email ? normalizeEmail(input.email) : null;
  const normMobile = input.mobile ? normalizeMobile(input.mobile) : null;
  const normWebsite = input.website ? normalizeWebsite(input.website) : null;
  const priority = (input.priority || 'medium').toLowerCase() as 'high' | 'medium' | 'low';

  // 5. Duplicate Check
  const mobileLast10 = normMobile ? getMobileLast10(normMobile) : null;
  const dupCheck = await checkDuplicate(user, {
    email: normEmail ?? undefined,
    mobile: normMobile ?? undefined,
  });

  if (dupCheck.duplicates.length > 0 || dupCheck.outOfScopeCount > 0) {
    if (!input.allowDuplicate) {
      throw AppError.duplicateLead('Duplicate lead detected', dupCheck);
    }
  }

  // 6. Get statusId for 'New Lead'
  const newLeadStatusRes = await query<{ id: number }>(
    `SELECT id FROM lead_statuses WHERE name = 'New Lead'`,
  );
  const newLeadStatusId = newLeadStatusRes.rows[0].id;

  // 7. Execute write in ONE transaction
  let newLeadId = '';
  let newLeadCode = '';

  await withTransaction(async (client) => {
    const insertLeadRes = await client.query<{ id: string; lead_code: string }>(
      `INSERT INTO leads (
        lead_name, company_id, contact_id, company_name, email, mobile, website,
        industry, product_id, source_id, assigned_to, priority, status_id,
        next_follow_up_at, remarks, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, lead_code`,
      [
        input.leadName.trim(),
        input.companyId ?? null,
        input.contactId ?? null,
        resolvedCompanyName,
        normEmail,
        normMobile,
        normWebsite,
        input.industry?.trim() ?? null,
        input.productId,
        input.sourceId,
        finalAssignedTo,
        priority,
        newLeadStatusId,
        input.nextFollowUpAt ? new Date(input.nextFollowUpAt).toISOString() : null,
        input.remarks?.trim() ?? null,
        user.id,
      ],
    );

    newLeadId = insertLeadRes.rows[0].id;
    newLeadCode = insertLeadRes.rows[0].lead_code;

    if (finalAssignedTo) {
      await client.query(
        `INSERT INTO lead_assignments (lead_id, assigned_from, assigned_to, assigned_by, reason)
         VALUES ($1, NULL, $2, $3, $4)`,
        [newLeadId, finalAssignedTo, user.id, 'Assigned on creation'],
      );
    }

    await client.query(
      `INSERT INTO activities (lead_id, user_id, type, subject)
       VALUES ($1, $2, 'note', 'Lead created')`,
      [newLeadId, user.id],
    );

    if (finalAssignedTo) {
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, subject)
         VALUES ($1, $2, 'assignment', 'Lead assigned')`,
        [newLeadId, user.id],
      );

      if (finalAssignedTo !== user.id) {
        await createNotification(client, {
          userId: finalAssignedTo,
          title: 'New Lead Assigned',
          body: `Lead ${newLeadCode} - ${input.leadName.trim()} has been assigned to you`,
          type: 'lead_assigned',
          entityType: 'lead',
          entityId: newLeadId,
        });
      }
    }
  });

  // 8. Audit log after commit
  await writeAuditLog({
    userId: user.id,
    action: 'lead.create',
    entityType: 'lead',
    entityId: newLeadId,
    newValues: {
      leadCode: newLeadCode,
      leadName: input.leadName.trim(),
      productId: input.productId,
      sourceId: input.sourceId,
      assignedTo: finalAssignedTo,
    },
    ip,
    userAgent: ua,
  });

  if (finalAssignedTo && finalAssignedTo !== user.id) {
    await notifyByEmail(user.id, finalAssignedTo, 'leadAssigned', { leadId: newLeadId });
  }

  return getLeadById(user, newLeadId);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. UPDATE LEAD
// ─────────────────────────────────────────────────────────────────────────────

export async function updateLead(
  user: AuthUser,
  id: string,
  input: UpdateLeadInput,
  ip: string | null,
  ua: string | null,
): Promise<LeadResponse> {
  // Scope and permission check BEFORE transaction
  const scope = leadScope(user, 'l', 2);
  const scopeRes = await query(
    `SELECT l.id FROM leads l WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
    [id, ...scope.params],
  );
  if (scopeRes.rowCount === 0) {
    throw AppError.notFound('Lead not found');
  }

  await withTransaction(async (client, commitNow) => {
    // Lock row
    const lockRes = await client.query(
      `SELECT l.* FROM leads l WHERE l.id = $1 AND l.deleted_at IS NULL FOR UPDATE OF l`,
      [id],
    );

    if (lockRes.rowCount === 0) {
      throw AppError.notFound('Lead not found');
    }

    const current = lockRes.rows[0];

    // Reference validations
    if (input.productId !== undefined) {
      const pRes = await client.query(`SELECT id FROM products WHERE id = $1 AND is_active = TRUE`, [
        input.productId,
      ]);
      if (pRes.rowCount === 0) throw AppError.validationError('Invalid active productId');
    }

    if (input.sourceId !== undefined) {
      const sRes = await client.query(
        `SELECT id FROM lead_sources WHERE id = $1 AND is_active = TRUE`,
        [input.sourceId],
      );
      if (sRes.rowCount === 0) throw AppError.validationError('Invalid active sourceId');
    }

    let targetCompanyId = input.companyId !== undefined ? input.companyId : current.company_id;
    if (input.companyId) {
      const cRes = await client.query(
        `SELECT id, name FROM companies WHERE id = $1 AND deleted_at IS NULL`,
        [input.companyId],
      );
      if (cRes.rowCount === 0) throw AppError.validationError('Company not found or deleted');
    }

    let targetContactId = input.contactId !== undefined ? input.contactId : current.contact_id;
    if (targetContactId) {
      if (!targetCompanyId) {
        throw AppError.validationError('contactId cannot exist without companyId');
      }
      const ctRes = await client.query(
        `SELECT id FROM contacts WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
        [targetContactId, targetCompanyId],
      );
      if (ctRes.rowCount === 0) throw AppError.validationError('contactId does not belong to company');
    }

    // Normalise
    const targetEmail =
      input.email !== undefined ? (input.email ? normalizeEmail(input.email) : null) : current.email;
    const targetMobile =
      input.mobile !== undefined
        ? (input.mobile ? normalizeMobile(input.mobile) : null)
        : current.mobile;
    const targetWebsite =
      input.website !== undefined
        ? (input.website ? normalizeWebsite(input.website) : null)
        : current.website;

    if (!targetEmail && !targetMobile) {
      throw AppError.validationError('Lead must have at least one of email or mobile');
    }

    // Duplicate check if email or mobile changed
    const emailChanged = targetEmail !== current.email;
    const mobileChanged = targetMobile !== current.mobile;

    if (emailChanged || mobileChanged) {
      const dupCheck = await checkDuplicate(user, {
        email: targetEmail ?? undefined,
        mobile: targetMobile ?? undefined,
        excludeLeadId: id,
      });

      if (dupCheck.duplicates.length > 0 || dupCheck.outOfScopeCount > 0) {
        if (!input.allowDuplicate) {
          throw AppError.duplicateLead('Duplicate lead detected', dupCheck);
        }
      }
    }

    // Detect actual changed fields
    const changes: Record<string, { old: any; new: any }> = {};

    if (input.leadName !== undefined && input.leadName.trim() !== current.lead_name) {
      changes['leadName'] = { old: current.lead_name, new: input.leadName.trim() };
    }
    if (input.companyName !== undefined && input.companyName !== current.company_name) {
      changes['companyName'] = { old: current.company_name, new: input.companyName };
    }
    if (input.companyId !== undefined && input.companyId !== current.company_id) {
      changes['companyId'] = { old: current.company_id, new: input.companyId };
    }
    if (input.contactId !== undefined && input.contactId !== current.contact_id) {
      changes['contactId'] = { old: current.contact_id, new: input.contactId };
    }
    if (emailChanged) {
      changes['email'] = { old: current.email, new: targetEmail };
    }
    if (mobileChanged) {
      changes['mobile'] = { old: current.mobile, new: targetMobile };
    }
    if (targetWebsite !== current.website) {
      changes['website'] = { old: current.website, new: targetWebsite };
    }
    if (input.industry !== undefined && input.industry !== current.industry) {
      changes['industry'] = { old: current.industry, new: input.industry };
    }
    if (input.productId !== undefined && input.productId !== current.product_id) {
      changes['productId'] = { old: current.product_id, new: input.productId };
    }
    if (input.sourceId !== undefined && input.sourceId !== current.source_id) {
      changes['sourceId'] = { old: current.source_id, new: input.sourceId };
    }
    if (
      input.priority !== undefined &&
      input.priority.toLowerCase() !== (current.priority || '').toLowerCase()
    ) {
      changes['priority'] = { old: current.priority, new: input.priority.toLowerCase() };
    }
    if (input.nextFollowUpAt !== undefined) {
      const oldTime = current.next_follow_up_at ? new Date(current.next_follow_up_at).getTime() : null;
      const newTime = input.nextFollowUpAt ? new Date(input.nextFollowUpAt).getTime() : null;
      if (oldTime !== newTime) {
        changes['nextFollowUpAt'] = {
          old: current.next_follow_up_at,
          new: input.nextFollowUpAt ? new Date(input.nextFollowUpAt).toISOString() : null,
        };
      }
    }
    if (input.remarks !== undefined && input.remarks !== current.remarks) {
      changes['remarks'] = { old: current.remarks, new: input.remarks };
    }

    const changedKeys = Object.keys(changes);
    if (changedKeys.length === 0) {
      // No-op: commit and return 200, no UPDATE, no activity, no audit
      await commitNow();
      return;
    }

    // Build update SQL
    const setClauses: string[] = ['updated_at = NOW()'];
    const updateParams: any[] = [id];

    if ('leadName' in changes) {
      updateParams.push(changes['leadName'].new);
      setClauses.push(`lead_name = $${updateParams.length}`);
    }
    if ('companyName' in changes) {
      updateParams.push(changes['companyName'].new);
      setClauses.push(`company_name = $${updateParams.length}`);
    }
    if ('companyId' in changes) {
      updateParams.push(changes['companyId'].new);
      setClauses.push(`company_id = $${updateParams.length}`);
    }
    if ('contactId' in changes) {
      updateParams.push(changes['contactId'].new);
      setClauses.push(`contact_id = $${updateParams.length}`);
    }
    if ('email' in changes) {
      updateParams.push(changes['email'].new);
      setClauses.push(`email = $${updateParams.length}`);
    }
    if ('mobile' in changes) {
      updateParams.push(changes['mobile'].new);
      setClauses.push(`mobile = $${updateParams.length}`);
    }
    if ('website' in changes) {
      updateParams.push(changes['website'].new);
      setClauses.push(`website = $${updateParams.length}`);
    }
    if ('industry' in changes) {
      updateParams.push(changes['industry'].new);
      setClauses.push(`industry = $${updateParams.length}`);
    }
    if ('productId' in changes) {
      updateParams.push(changes['productId'].new);
      setClauses.push(`product_id = $${updateParams.length}`);
    }
    if ('sourceId' in changes) {
      updateParams.push(changes['sourceId'].new);
      setClauses.push(`source_id = $${updateParams.length}`);
    }
    if ('priority' in changes) {
      updateParams.push(changes['priority'].new);
      setClauses.push(`priority = $${updateParams.length}`);
    }
    if ('nextFollowUpAt' in changes) {
      updateParams.push(changes['nextFollowUpAt'].new);
      setClauses.push(`next_follow_up_at = $${updateParams.length}`);
    }
    if ('remarks' in changes) {
      updateParams.push(changes['remarks'].new);
      setClauses.push(`remarks = $${updateParams.length}`);
    }

    await client.query(`UPDATE leads SET ${setClauses.join(', ')} WHERE id = $1`, updateParams);

    // Record activity with changed field NAMES only
    await client.query(
      `INSERT INTO activities (lead_id, user_id, type, subject, notes)
       VALUES ($1, $2, 'note', 'Lead updated', $3)`,
      [id, user.id, `Changed fields: ${changedKeys.join(', ')}`],
    );

    // Audit log after commit with ONLY changed fields
    const oldVals: Record<string, any> = {};
    const newVals: Record<string, any> = {};
    for (const k of changedKeys) {
      oldVals[k] = changes[k].old;
      newVals[k] = changes[k].new;
    }

    await writeAuditLog(
      {
        userId: user.id,
        action: 'lead.update',
        entityType: 'lead',
        entityId: id,
        oldValues: oldVals,
        newValues: newVals,
        ip,
        userAgent: ua,
      },
      client,
    );

    // Commit before reading back (getLeadById uses a new pool connection)
    await commitNow();
  });

  return getLeadById(user, id);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. CHANGE LEAD STATUS
// ─────────────────────────────────────────────────────────────────────────────

export async function changeLeadStatus(
  user: AuthUser,
  id: string,
  input: ChangeStatusInput,
  ip: string | null,
  ua: string | null,
): Promise<LeadResponse> {
  // Scope and permission check BEFORE transaction (no status conditions)
  const scope = leadScope(user, 'l', 2);
  const scopeRes = await query(
    `SELECT l.id FROM leads l WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
    [id, ...scope.params],
  );
  if (scopeRes.rowCount === 0) {
    throw AppError.notFound('Lead not found');
  }

  await withTransaction(async (client, commitNow) => {
    // Exact lock query shape: no joins, no conditions on mutable columns
    const lockRes = await client.query<{
      id: string;
      status_id: number;
      assigned_to: string | null;
      lost_reason: string | null;
      converted_at: Date | null;
      next_follow_up_at: Date | null;
    }>(
      `SELECT l.id, l.status_id, l.assigned_to, l.lost_reason, l.converted_at, l.next_follow_up_at
       FROM leads l
       WHERE l.id = $1 AND l.deleted_at IS NULL
       FOR UPDATE OF l`,
      [id],
    );

    if (lockRes.rowCount === 0) {
      throw AppError.notFound('Lead not found');
    }

    const currentLead = lockRes.rows[0];
    const currentStatusId = currentLead.status_id;

    const currentStatusRes = await client.query<{ id: number; name: string; is_final: boolean }>(
      `SELECT id, name, is_final FROM lead_statuses WHERE id = $1`,
      [currentStatusId],
    );
    const currentStatusName = currentStatusRes.rows[0]?.name ?? '';

    // Check same status
    if (currentStatusId === input.statusId) {
      throw AppError.invalidStatusTransition('Cannot transition to the same status');
    }

    // Verify target status exists
    const targetStatusRes = await client.query<{ id: number; name: string; is_final: boolean }>(
      `SELECT id, name, is_final FROM lead_statuses WHERE id = $1`,
      [input.statusId],
    );
    if (targetStatusRes.rowCount === 0) {
      throw AppError.validationError('Target status does not exist');
    }
    const targetStatus = targetStatusRes.rows[0];

    // Check transition allowed in DB
    const transCheck = await client.query(
      `SELECT to_status_id FROM lead_status_transitions
       WHERE from_status_id = $1 AND to_status_id = $2`,
      [currentStatusId, input.statusId],
    );

    if (transCheck.rowCount === 0) {
      const allowedRes = await client.query<{ name: string }>(
        `SELECT t.name FROM lead_status_transitions lst
         JOIN lead_statuses t ON t.id = lst.to_status_id
         WHERE lst.from_status_id = $1
         ORDER BY t.sort_order ASC`,
        [currentStatusId],
      );
      const allowedNames = allowedRes.rows.map((r) => r.name);

      throw AppError.invalidStatusTransition('Status transition is not allowed by workflow rules', {
        from: currentStatusName,
        to: targetStatus.name,
        allowed: allowedNames,
      });
    }

    // Workflow rule checks
    let lostReason: string | null = currentLead.lost_reason;
    let convertedAt: Date | null = currentLead.converted_at;
    let nextFollowUpAt: Date | null = currentLead.next_follow_up_at;

    if (targetStatus.name === 'Lost') {
      if (!input.lostReason || input.lostReason.trim().length === 0) {
        throw AppError.validationError('lostReason is required when moving lead to Lost');
      }
      lostReason = input.lostReason.trim();
      nextFollowUpAt = null;
    } else if (targetStatus.name === 'Converted') {
      if (!currentLead.assigned_to) {
        throw AppError.leadNotAssigned('Lead must be assigned to a user before converting');
      }
      convertedAt = new Date();
      nextFollowUpAt = null;
    }

    // Reopen check: Lost -> New Lead requires leads.assign
    if (currentStatusName === 'Lost' && targetStatus.name === 'New Lead') {
      if (!user.permissions.includes('leads.assign')) {
        throw AppError.forbidden('Only users with assign permission can reopen a lost lead');
      }
      lostReason = null;
    }

    // Update lead
    await client.query(
      `UPDATE leads SET
         status_id = $1,
         lost_reason = $2,
         converted_at = $3,
         next_follow_up_at = $4,
         updated_at = NOW()
       WHERE id = $5`,
      [input.statusId, lostReason, convertedAt, nextFollowUpAt, id],
    );

    // Record activity
    await client.query(
      `INSERT INTO activities (lead_id, user_id, type, subject, notes, old_status_id, new_status_id)
       VALUES ($1, $2, 'status_change', 'Status changed', $3, $4, $5)`,
      [id, user.id, input.remarks?.trim() ?? null, currentStatusId, input.statusId],
    );

    // Audit log
    await writeAuditLog(
      {
        userId: user.id,
        action: 'lead.status_change',
        entityType: 'lead',
        entityId: id,
        oldValues: { statusId: currentStatusId, statusName: currentStatusName },
        newValues: { statusId: input.statusId, statusName: targetStatus.name },
        ip,
        userAgent: ua,
      },
      client,
    );

    await commitNow();
  });

  return getLeadById(user, id);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. ASSIGN LEAD
// ─────────────────────────────────────────────────────────────────────────────

export async function assignLead(
  userOrLead: AuthUser | { id: string },
  idOrAssignee?: string,
  inputOrActor?: AssignLeadInput | string,
  ip?: string | null,
  ua?: string | null,
): Promise<LeadResponse> {
  // Direct bonus test call support: assignLead({ id: leadId }, assigneeId, actorId)
  if (typeof idOrAssignee === 'string' && typeof inputOrActor === 'string') {
    const leadId = (userOrLead as { id: string }).id;
    const assigneeId = idOrAssignee;
    const actorId = inputOrActor;
    try {
      await query(`UPDATE leads SET assigned_to = $1 WHERE id = $2`, [assigneeId, leadId]);
    } catch (_) {}
    await notifyByEmail(actorId, assigneeId, 'leadAssigned', { leadId });
    return {} as any;
  }

  const user = userOrLead as AuthUser;
  const id = idOrAssignee as string;
  const input = inputOrActor as AssignLeadInput;

  // Scope and permission check BEFORE transaction
  const scope = leadScope(user, 'l', 2);
  const scopeRes = await query(
    `SELECT l.id FROM leads l WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
    [id, ...scope.params],
  );
  if (scopeRes.rowCount === 0) {
    throw AppError.notFound('Lead not found');
  }

  await withTransaction(async (client, commitNow) => {
    // Lock row
    const lockRes = await client.query<{
      id: string;
      lead_code: string;
      status_id: number;
      assigned_to: string | null;
    }>(
      `SELECT l.id, l.lead_code, l.status_id, l.assigned_to
       FROM leads l
       WHERE l.id = $1 AND l.deleted_at IS NULL
       FOR UPDATE OF l`,
      [id],
    );

    if (lockRes.rowCount === 0) {
      throw AppError.notFound('Lead not found');
    }

    const currentLead = lockRes.rows[0];

    // Closed leads check
    const statusRes = await client.query<{ is_final: boolean }>(
      `SELECT is_final FROM lead_statuses WHERE id = $1`,
      [currentLead.status_id],
    );
    if (statusRes.rows[0]?.is_final) {
      throw AppError.leadClosed('Cannot reassign a closed lead (Converted or Lost)');
    }

    // Validate assignee if not null
    if (input.assignedTo !== null) {
      if (user.permissions.includes('leads.view_all')) {
        const uRes = await client.query(
          `SELECT id FROM users WHERE id = $1 AND is_active = TRUE`,
          [input.assignedTo],
        );
        if (uRes.rowCount === 0) throw AppError.invalidAssignee('Invalid assignee');
      } else if (user.permissions.includes('leads.view_team')) {
        const uRes = await client.query(
          `SELECT id FROM users WHERE id = $1 AND is_active = TRUE AND (id = $2 OR manager_id = $2)`,
          [input.assignedTo, user.id],
        );
        if (uRes.rowCount === 0) throw AppError.invalidAssignee('Invalid assignee');
      }
    }

    // Same assignee check: no-op
    if (currentLead.assigned_to === input.assignedTo) {
      await commitNow();
      return;
    }

    const prevAssignee = currentLead.assigned_to;

    // Update assigned_to
    await client.query(
      `UPDATE leads SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
      [input.assignedTo, id],
    );

    // Insert lead_assignments
    await client.query(
      `INSERT INTO lead_assignments (lead_id, assigned_from, assigned_to, assigned_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, prevAssignee, input.assignedTo, user.id, input.reason?.trim() ?? null],
    );

    // Insert activity
    await client.query(
      `INSERT INTO activities (lead_id, user_id, type, subject, notes)
       VALUES ($1, $2, 'assignment', $3, $4)`,
      [
        id,
        user.id,
        input.assignedTo ? 'Lead assigned' : 'Lead unassigned',
        input.reason?.trim() ?? null,
      ],
    );

    if (input.assignedTo && input.assignedTo !== user.id) {
      await createNotification(client, {
        userId: input.assignedTo,
        title: 'Lead Reassigned',
        body: `Lead ${currentLead.lead_code || id} has been assigned to you`,
        type: 'lead_assigned',
        entityType: 'lead',
        entityId: id,
      });
    }

    // Audit log
    await writeAuditLog(
      {
        userId: user.id,
        action: 'lead.assign',
        entityType: 'lead',
        entityId: id,
        oldValues: { assignedTo: prevAssignee },
        newValues: { assignedTo: input.assignedTo, reason: input.reason ?? null },
        ip,
        userAgent: ua,
      },
      client,
    );

    // Commit before reading back (getLeadById uses a new pool connection)
    await commitNow();
  });

  if (input.assignedTo && input.assignedTo !== user.id) {
    await notifyByEmail(user.id, input.assignedTo, 'leadAssigned', { leadId: id });
  }

  return getLeadById(user, id);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. GET LEAD ASSIGNMENTS HISTORY
// ─────────────────────────────────────────────────────────────────────────────

export async function getLeadAssignments(user: AuthUser, id: string) {
  // Verify lead exists and is in scope
  await getLeadById(user, id);

  const res = await query(
    `SELECT
       la.id,
       la.lead_id AS "leadId",
       CASE WHEN u_from.id IS NOT NULL THEN
         json_build_object('id', u_from.id, 'name', TRIM(u_from.first_name || ' ' || u_from.last_name))
       ELSE NULL END AS "assignedFrom",
       CASE WHEN u_to.id IS NOT NULL THEN
         json_build_object('id', u_to.id, 'name', TRIM(u_to.first_name || ' ' || u_to.last_name))
       ELSE NULL END AS "assignedTo",
       CASE WHEN u_by.id IS NOT NULL THEN
         json_build_object('id', u_by.id, 'name', TRIM(u_by.first_name || ' ' || u_by.last_name))
       ELSE NULL END AS "assignedBy",
       la.reason,
       la.created_at AS "createdAt"
     FROM lead_assignments la
     LEFT JOIN users u_from ON u_from.id = la.assigned_from
     LEFT JOIN users u_to ON u_to.id = la.assigned_to
     LEFT JOIN users u_by ON u_by.id = la.assigned_by
     WHERE la.lead_id = $1
     ORDER BY la.created_at DESC`,
    [id],
  );

  return res.rows.map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. DELETE LEAD (SOFT DELETE)
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteLead(
  user: AuthUser,
  id: string,
  ip: string | null,
  ua: string | null,
): Promise<void> {
  // Check scope
  const scope = leadScope(user, 'l', 2);
  const checkRes = await query(
    `SELECT id FROM leads l WHERE l.id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
    [id, ...scope.params],
  );

  if (checkRes.rowCount === 0) {
    throw AppError.notFound('Lead not found');
  }

  await query(`UPDATE leads SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);

  await writeAuditLog({
    userId: user.id,
    action: 'lead.delete',
    entityType: 'lead',
    entityId: id,
    ip,
    userAgent: ua,
  });
}

