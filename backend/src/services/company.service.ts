import { AuthUser } from '../types/express';
import { query, withTransaction } from '../db/pool';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from './audit.service';
import { leadScope } from './scope.service';
import { normalizeWebsite, escapeLikeWildcards } from '../utils/leadNormalizers';
import {
  CreateCompanyInput,
  UpdateCompanyInput,
  ListCompaniesQuery,
} from '../validators/company.validator';
import * as leadService from './lead.service';
import { ListLeadsQuery } from '../validators/lead.validator';

export interface CompanyResponse {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  location: string | null;
  notes: string | null;
  contactCount?: number;
  leadCount?: number;
  createdAt: string;
  updatedAt?: string;
  contacts?: any[];
}

export async function listCompanies(user: AuthUser, q: ListCompaniesQuery) {
  const conditions: string[] = ['c.deleted_at IS NULL'];
  const params: any[] = [];

  // Search filter
  if (q.q && q.q.trim().length > 0) {
    const escaped = escapeLikeWildcards(q.q.trim());
    params.push(`%${escaped}%`);
    const pIdx = params.length;
    conditions.push(`(c.name ILIKE $${pIdx} ESCAPE '\\' OR c.website ILIKE $${pIdx} ESCAPE '\\' OR c.location ILIKE $${pIdx} ESCAPE '\\')`);
  }

  // Industry filter
  if (q.industry && q.industry.trim().length > 0) {
    params.push(q.industry.trim());
    conditions.push(`c.industry = $${params.length}`);
  }

  // Size filter
  if (q.size) {
    params.push(q.size);
    conditions.push(`c.size = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Order
  const orderDir = q.order === 'desc' ? 'DESC' : 'ASC';
  let orderSql = `ORDER BY c.name ${orderDir}, c.id ASC`;
  if (q.sortBy === 'createdAt') {
    orderSql = `ORDER BY c.created_at ${orderDir}, c.id ASC`;
  } else if (q.sortBy === 'industry') {
    orderSql = `ORDER BY c.industry ${orderDir} NULLS LAST, c.id ASC`;
  }

  // Total count
  const countSql = `SELECT COUNT(*) AS total FROM companies c ${whereClause}`;
  const countRes = await query<{ total: string }>(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);

  // Pagination
  const offset = (q.page - 1) * q.limit;
  const dataParams = [...params];

  // Lead scope params need appropriate param index in dataSql
  const leadParamOffset = dataParams.length + 1;
  const leadScopeAdjusted = leadScope(user, 'l', leadParamOffset);

  dataParams.push(...leadScopeAdjusted.params);
  dataParams.push(q.limit, offset);
  const limitIdx = dataParams.length - 1;
  const offsetIdx = dataParams.length;

  const dataSql = `
    SELECT
      c.id,
      c.name,
      c.website,
      c.industry,
      c.size,
      c.location,
      c.notes,
      c.created_at AS "createdAt",
      COALESCE(ct.cnt, 0)::int AS "contactCount",
      COALESCE(ld.cnt, 0)::int AS "leadCount"
    FROM companies c
    LEFT JOIN (
      SELECT company_id, COUNT(*) AS cnt
      FROM contacts
      WHERE deleted_at IS NULL
      GROUP BY company_id
    ) ct ON ct.company_id = c.id
    LEFT JOIN (
      SELECT l.company_id, COUNT(*) AS cnt
      FROM leads l
      WHERE l.deleted_at IS NULL AND ${leadScopeAdjusted.sql}
      GROUP BY l.company_id
    ) ld ON ld.company_id = c.id
    ${whereClause}
    ${orderSql}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const dataRes = await query(dataSql, dataParams);
  const companies = dataRes.rows.map((row) => ({
    id: row.id,
    name: row.name,
    website: row.website,
    industry: row.industry,
    size: row.size,
    location: row.location,
    notes: row.notes,
    contactCount: row.contactCount,
    leadCount: row.leadCount,
    createdAt: new Date(row.createdAt).toISOString(),
  }));

  const totalPages = Math.ceil(total / q.limit);

  return {
    companies,
    meta: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages,
    },
  };
}

export async function getCompanyById(user: AuthUser, id: string): Promise<CompanyResponse> {
  const compRes = await query(
    `SELECT id, name, website, industry, size, location, notes, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM companies
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  if (compRes.rowCount === 0) {
    throw AppError.notFound('Company not found');
  }

  const c = compRes.rows[0];

  // Scoped lead count
  const scope = leadScope(user, 'l', 2);

  const leadCountRes = await query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM leads l WHERE l.company_id = $1 AND l.deleted_at IS NULL AND ${scope.sql}`,
    [id, ...scope.params],
  );
  const leadCount = parseInt(leadCountRes.rows[0]?.cnt ?? '0', 10);

  // Contacts: primary first then created_at asc
  const contactsRes = await query(
    `SELECT id, company_id AS "companyId", full_name AS "fullName", designation, email, mobile,
            is_primary AS "isPrimary", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM contacts
     WHERE company_id = $1 AND deleted_at IS NULL
     ORDER BY is_primary DESC, created_at ASC`,
    [id],
  );

  const contacts = contactsRes.rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    fullName: row.fullName,
    designation: row.designation,
    email: row.email,
    mobile: row.mobile,
    isPrimary: row.isPrimary,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));

  return {
    id: c.id,
    name: c.name,
    website: c.website,
    industry: c.industry,
    size: c.size,
    location: c.location,
    notes: c.notes,
    leadCount,
    contacts,
    createdAt: new Date(c.createdAt).toISOString(),
    updatedAt: new Date(c.updatedAt).toISOString(),
  };
}

export async function createCompany(
  user: AuthUser,
  input: CreateCompanyInput,
  ip: string | null,
  ua: string | null,
): Promise<CompanyResponse> {
  const normName = input.name.trim();

  // Case-insensitive duplicate check
  const dup = await query<{ id: string }>(
    `SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL`,
    [normName],
  );
  if (dup.rowCount && dup.rowCount > 0) {
    throw AppError.companyExists('A company with this name already exists');
  }

  const normWebsite = input.website ? normalizeWebsite(input.website) : null;

  const insertRes = await query<{
    id: string;
    name: string;
    website: string | null;
    industry: string | null;
    size: string | null;
    location: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO companies (name, website, industry, size, location, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, website, industry, size, location, notes, created_at, updated_at`,
    [
      normName,
      normWebsite,
      input.industry?.trim() ?? null,
      input.size ?? null,
      input.location?.trim() ?? null,
      input.notes?.trim() ?? null,
      user.id,
    ],
  );

  const c = insertRes.rows[0];

  await writeAuditLog({
    userId: user.id,
    action: 'company.create',
    entityType: 'company',
    entityId: c.id,
    newValues: {
      name: c.name,
      website: c.website,
      industry: c.industry,
      size: c.size,
      location: c.location,
    },
    ip,
    userAgent: ua,
  });

  return {
    id: c.id,
    name: c.name,
    website: c.website,
    industry: c.industry,
    size: c.size,
    location: c.location,
    notes: c.notes,
    createdAt: new Date(c.created_at).toISOString(),
    updatedAt: new Date(c.updated_at).toISOString(),
  };
}

export async function updateCompany(
  user: AuthUser,
  id: string,
  input: UpdateCompanyInput,
  ip: string | null,
  ua: string | null,
): Promise<CompanyResponse> {
  const curRes = await query<{
    id: string;
    name: string;
    website: string | null;
    industry: string | null;
    size: string | null;
    location: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, name, website, industry, size, location, notes, created_at, updated_at
     FROM companies
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  if (curRes.rowCount === 0) {
    throw AppError.notFound('Company not found');
  }

  const current = curRes.rows[0];

  // If name changed, check duplicate
  let targetName = current.name;
  if (input.name !== undefined) {
    targetName = input.name.trim();
    if (targetName.toLowerCase() !== current.name.toLowerCase()) {
      const dup = await query<{ id: string }>(
        `SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND id <> $2 AND deleted_at IS NULL`,
        [targetName, id],
      );
      if (dup.rowCount && dup.rowCount > 0) {
        throw AppError.companyExists('A company with this name already exists');
      }
    }
  }

  const targetWebsite =
    input.website !== undefined
      ? (input.website ? normalizeWebsite(input.website) : null)
      : current.website;
  const targetIndustry = input.industry !== undefined ? (input.industry?.trim() || null) : current.industry;
  const targetSize = input.size !== undefined ? input.size : current.size;
  const targetLocation = input.location !== undefined ? (input.location?.trim() || null) : current.location;
  const targetNotes = input.notes !== undefined ? (input.notes?.trim() || null) : current.notes;

  // Track changes
  const changes: Record<string, { old: any; new: any }> = {};
  if (targetName !== current.name) changes['name'] = { old: current.name, new: targetName };
  if (targetWebsite !== current.website) changes['website'] = { old: current.website, new: targetWebsite };
  if (targetIndustry !== current.industry) changes['industry'] = { old: current.industry, new: targetIndustry };
  if (targetSize !== current.size) changes['size'] = { old: current.size, new: targetSize };
  if (targetLocation !== current.location) changes['location'] = { old: current.location, new: targetLocation };
  if (targetNotes !== current.notes) changes['notes'] = { old: current.notes, new: targetNotes };

  if (Object.keys(changes).length === 0) {
    // No-op update -> 200 with no audit
    return {
      id: current.id,
      name: current.name,
      website: current.website,
      industry: current.industry,
      size: current.size,
      location: current.location,
      notes: current.notes,
      createdAt: new Date(current.created_at).toISOString(),
      updatedAt: new Date(current.updated_at).toISOString(),
    };
  }

  const updateRes = await query<{
    id: string;
    name: string;
    website: string | null;
    industry: string | null;
    size: string | null;
    location: string | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE companies SET
       name = $1,
       website = $2,
       industry = $3,
       size = $4,
       location = $5,
       notes = $6,
       updated_at = NOW()
     WHERE id = $7
     RETURNING id, name, website, industry, size, location, notes, created_at, updated_at`,
    [targetName, targetWebsite, targetIndustry, targetSize, targetLocation, targetNotes, id],
  );

  const updated = updateRes.rows[0];

  const oldVals: Record<string, any> = {};
  const newVals: Record<string, any> = {};
  for (const k of Object.keys(changes)) {
    oldVals[k] = changes[k].old;
    newVals[k] = changes[k].new;
  }

  await writeAuditLog({
    userId: user.id,
    action: 'company.update',
    entityType: 'company',
    entityId: id,
    oldValues: oldVals,
    newValues: newVals,
    ip,
    userAgent: ua,
  });

  return {
    id: updated.id,
    name: updated.name,
    website: updated.website,
    industry: updated.industry,
    size: updated.size,
    location: updated.location,
    notes: updated.notes,
    createdAt: new Date(updated.created_at).toISOString(),
    updatedAt: new Date(updated.updated_at).toISOString(),
  };
}

export async function deleteCompany(
  user: AuthUser,
  id: string,
  ip: string | null,
  ua: string | null,
): Promise<void> {
  const curRes = await query<{ id: string }>(
    `SELECT id FROM companies WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (curRes.rowCount === 0) {
    throw AppError.notFound('Company not found');
  }

  await query(`UPDATE companies SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);

  await writeAuditLog({
    userId: user.id,
    action: 'company.delete',
    entityType: 'company',
    entityId: id,
    ip,
    userAgent: ua,
  });
}

export async function getCompanyLeads(user: AuthUser, companyId: string, q: ListLeadsQuery) {
  const compRes = await query<{ id: string }>(
    `SELECT id FROM companies WHERE id = $1 AND deleted_at IS NULL`,
    [companyId],
  );
  if (compRes.rowCount === 0) {
    throw AppError.notFound('Company not found');
  }

  return leadService.listLeads(user, { ...q, companyId });
}
