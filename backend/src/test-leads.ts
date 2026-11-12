/**
 * Module 5 Leads Test Suite — real PostgreSQL, real HTTP fetch, ephemeral port.
 * Tests T01 to T21 covering complete Leads API functionality, permissions, workflow,
 * concurrency, indexing, and cleanup.
 */
process.env.NODE_ENV = 'test';

import http from 'http';
import { AddressInfo } from 'net';
import { query, pool } from './db/pool';
import app from './app';

// ─── HTTP & SERVER HELPERS ────────────────────────────────────────────────────

let baseUrl = '';
let server: http.Server;

async function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}/api`;
      console.log(` Test server running on ${baseUrl}`);
      resolve();
    });
  });
}

async function stopServer(): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function api(
  method: string,
  path: string,
  body?: object,
  token?: string,
): Promise<{ status: number; data: any }> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function login(email: string, password: string): Promise<string> {
  const r = await api('POST', '/auth/login', { email, password });
  if (r.status !== 200) {
    throw new Error(`Login failed for ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  }
  return r.data.data.tokens.accessToken;
}

// ─── ASSERTION HELPERS ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(label: string) {
  console.log(`  PASS [${passed + failed + 1}] ${label}`);
  passed++;
}

function fail(label: string, reason: string) {
  console.error(`  FAIL [${passed + failed + 1}] ${label}`);
  console.error(`       Reason: ${reason}`);
  failed++;
}

function assert(condition: boolean, label: string, reason: string) {
  if (condition) pass(label);
  else fail(label, reason);
}

// ─── CLEANUP TRACKING ─────────────────────────────────────────────────────────

const runId = Date.now();
const throwawayLeadIds: string[] = [];
const throwawayUserIds: string[] = [];
const throwawayCompanyIds: string[] = [];

async function cleanup(): Promise<void> {
  try {
    // Delete any leads created by tests (matching TL-% or tracked IDs)
    await query(`DELETE FROM leads WHERE lead_name LIKE 'TL-%'`);
    for (const id of throwawayLeadIds) {
      await query(`DELETE FROM leads WHERE id = $1`, [id]).catch(() => {});
    }
    // Delete companies created for tests
    for (const id of throwawayCompanyIds) {
      await query(`DELETE FROM companies WHERE id = $1`, [id]).catch(() => {});
    }
    // Delete test users if any
    for (const id of throwawayUserIds) {
      await query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [id]).catch(() => {});
      await query(`DELETE FROM audit_logs WHERE user_id = $1`, [id]).catch(() => {});
      await query(`DELETE FROM users WHERE id = $1`, [id]).catch(() => {});
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

// ─── CREDENTIALS & CONSTANTS ──────────────────────────────────────────────────

const ADMIN_EMAIL = 'admin@licrm.example';
const BH_EMAIL = 'businesshead@licrm.example';
const SALES1_EMAIL = 'sales1@licrm.example';
const SALES2_EMAIL = 'sales2@licrm.example';
const MARKETING_EMAIL = 'marketing@licrm.example';

const SEED_ADMIN_PW = process.env.SEED_ADMIN_PASSWORD ?? '';
const SEED_SAMPLE_PW = process.env.SEED_SAMPLE_PASSWORD ?? '';

// ─── MAIN TEST SUITE ──────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n================================================================');
  console.log('       MODULE 5 LEADS SUITE - REAL POSTGRESQL & HTTP FETCH       ');
  console.log('================================================================\n');

  const dbCheck = await query('SELECT NOW() AS now');
  console.log(` Connected to live database (${dbCheck.rows[0].now})`);

  await startServer();

  try {
    // Login all 4 seeded roles
    const adminTok = await login(ADMIN_EMAIL, SEED_ADMIN_PW);
    const bhTok = await login(BH_EMAIL, SEED_SAMPLE_PW);
    const sales1Tok = await login(SALES1_EMAIL, SEED_SAMPLE_PW);
    const sales2Tok = await login(SALES2_EMAIL, SEED_SAMPLE_PW);
    const mktTok = await login(MARKETING_EMAIL, SEED_SAMPLE_PW);

    // Retrieve user profiles
    const [adminMe, bhMe, sales1Me, sales2Me, mktMe] = await Promise.all([
      api('GET', '/auth/me', undefined, adminTok),
      api('GET', '/auth/me', undefined, bhTok),
      api('GET', '/auth/me', undefined, sales1Tok),
      api('GET', '/auth/me', undefined, sales2Tok),
      api('GET', '/auth/me', undefined, mktTok),
    ]);

    const adminId: string = adminMe.data.data.id;
    const bhId: string = bhMe.data.data.id;
    const sales1Id: string = sales1Me.data.data.id;
    const sales2Id: string = sales2Me.data.data.id;
    const mktId: string = mktMe.data.data.id;

    // ─────────────────────────────────────────────────────────────────────────
    // T01: Lookups
    // ─────────────────────────────────────────────────────────────────────────
    {
      const rAdmin = await api('GET', '/leads/lookups', undefined, adminTok);
      const rBh = await api('GET', '/leads/lookups', undefined, bhTok);
      const rSales = await api('GET', '/leads/lookups', undefined, sales1Tok);
      const rMkt = await api('GET', '/leads/lookups', undefined, mktTok);

      const adminAssignable = rAdmin.data?.data?.assignableUsers ?? [];
      const bhAssignable = rBh.data?.data?.assignableUsers ?? [];
      const salesAssignable = rSales.data?.data?.assignableUsers ?? [];
      const mktAssignable = rMkt.data?.data?.assignableUsers ?? [];

      assert(
        rAdmin.status === 200 &&
          rBh.status === 200 &&
          rSales.status === 200 &&
          rMkt.status === 200 &&
          Array.isArray(rAdmin.data.data.statuses) &&
          Array.isArray(rAdmin.data.data.products) &&
          Array.isArray(rAdmin.data.data.sources) &&
          adminAssignable.length >= 4 &&
          bhAssignable.some((u: any) => u.id === sales1Id) &&
          bhAssignable.some((u: any) => u.id === sales2Id) &&
          bhAssignable.some((u: any) => u.id === mktId) &&
          !bhAssignable.some((u: any) => u.id === adminId) &&
          salesAssignable.length === 0 &&
          mktAssignable.length === 0,
        'T01: GET /leads/lookups returns 200 for all 4 roles, scoped assignableUsers, not captured by :id',
        `admin=${rAdmin.status}, bh=${rBh.status}, sales=${rSales.status}, mkt=${rMkt.status}, adminUsers=${adminAssignable.length}, bhUsers=${bhAssignable.length}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T02: 401 without token across all endpoints
    // ─────────────────────────────────────────────────────────────────────────
    {
      const dummyId = '00000000-0000-0000-0000-000000000000';
      const endpoints: Array<[string, string, object?]> = [
        ['GET', '/leads/lookups'],
        ['POST', '/leads/check-duplicate', { email: 'a@b.com' }],
        ['GET', '/leads'],
        ['POST', '/leads', { leadName: 'Test' }],
        ['GET', `/leads/${dummyId}`],
        ['PUT', `/leads/${dummyId}`, { leadName: 'Test' }],
        ['PATCH', `/leads/${dummyId}/status`, { statusId: 2 }],
        ['PATCH', `/leads/${dummyId}/assign`, { assignedTo: dummyId }],
        ['GET', `/leads/${dummyId}/assignments`],
        ['DELETE', `/leads/${dummyId}`],
      ];

      let all401 = true;
      for (const [method, path, body] of endpoints) {
        const res = await api(method, path, body);
        if (res.status !== 401 || res.data?.error?.code !== 'UNAUTHORIZED') {
          all401 = false;
          break;
        }
      }

      assert(all401, 'T02: All 10 lead endpoints return 401 UNAUTHORIZED without token', 'At least one endpoint did not return 401 UNAUTHORIZED');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T03: Create Happy Paths (admin, business_head, sales1, marketing)
    // ─────────────────────────────────────────────────────────────────────────
    let adminLeadId = '';
    let bhLeadId = '';
    let sales1LeadId = '';
    let mktLeadId = '';

    {
      // 1. Admin creates lead assigned to sales1
      const rAdmin = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-AdminLead`,
          email: `tl-admin-${runId}@licrm.test`,
          mobile: '+91 98765 00001',
          productId: 1,
          sourceId: 6, // Reference (non-marketing)
          assignedTo: sales1Id,
          priority: 'high',
        },
        adminTok,
      );

      // 2. Business Head creates lead assigned to sales2
      const rBh = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-BhLead`,
          email: `tl-bh-${runId}@licrm.test`,
          mobile: '+91 98765 00002',
          productId: 2,
          sourceId: 7, // Cold Call (non-marketing)
          assignedTo: sales2Id,
          priority: 'medium',
        },
        bhTok,
      );

      // 3. Sales1 creates lead (auto-assigned to self)
      const rSales = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-Sales1Lead`,
          email: `tl-sales1-${runId}@licrm.test`,
          mobile: '9876500003',
          productId: 1,
          sourceId: 6,
          priority: 'low',
        },
        sales1Tok,
      );

      // 4. Marketing creates lead (stays unassigned)
      const rMkt = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-MktLead`,
          email: `tl-mkt-${runId}@licrm.test`,
          mobile: '9876500004',
          productId: 3,
          sourceId: 1, // Website (is_marketing = true)
        },
        mktTok,
      );

      adminLeadId = rAdmin.data?.data?.lead?.id;
      bhLeadId = rBh.data?.data?.lead?.id;
      sales1LeadId = rSales.data?.data?.lead?.id;
      mktLeadId = rMkt.data?.data?.lead?.id;

      if (adminLeadId) throwawayLeadIds.push(adminLeadId);
      if (bhLeadId) throwawayLeadIds.push(bhLeadId);
      if (sales1LeadId) throwawayLeadIds.push(sales1LeadId);
      if (mktLeadId) throwawayLeadIds.push(mktLeadId);

      const codeRegex = /^LI-LEAD-\d{6}$/;

      // Query DB for lead_assignments and activities on assigned leads
      const assignRowsRes = await query(
        `SELECT COUNT(*) AS count FROM lead_assignments WHERE lead_id = $1`,
        [adminLeadId],
      );
      const actRowsRes = await query(
        `SELECT COUNT(*) AS count FROM activities WHERE lead_id = $1`,
        [adminLeadId],
      );

      const hasAssignmentRow = parseInt(assignRowsRes.rows[0].count, 10) >= 1;
      const hasActivitiesRow = parseInt(actRowsRes.rows[0].count, 10) >= 2; // note + assignment

      assert(
        rAdmin.status === 201 &&
          codeRegex.test(rAdmin.data?.data?.lead?.leadCode) &&
          rAdmin.data?.data?.lead?.status?.name === 'New Lead' &&
          rAdmin.data?.data?.lead?.assignedTo?.id === sales1Id &&
          rBh.status === 201 &&
          rBh.data?.data?.lead?.assignedTo?.id === sales2Id &&
          rSales.status === 201 &&
          rSales.data?.data?.lead?.assignedTo?.id === sales1Id &&
          rMkt.status === 201 &&
          rMkt.data?.data?.lead?.assignedTo === null &&
          hasAssignmentRow &&
          hasActivitiesRow,
        'T03: Create happy paths (admin assigned to sales1, bh to sales2, sales auto-assigned to self, mkt unassigned, leadCode matches regex, rows in DB)',
        `admin=${rAdmin.status}, bh=${rBh.status}, sales=${rSales.status}, mkt=${rMkt.status}, hasAssign=${hasAssignmentRow}, hasAct=${hasActivitiesRow}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T04: Assignment Rules on Create
    // ─────────────────────────────────────────────────────────────────────────
    {
      // 1. Sales1 tries to supply sales2 as assignee -> 403
      const rSalesForbidden = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-ForbiddenAssignSales`,
          email: `tl-sales-forbid-${runId}@licrm.test`,
          productId: 1,
          sourceId: 6,
          assignedTo: sales2Id,
        },
        sales1Tok,
      );

      // 2. Marketing tries to supply an assignee -> 403
      const rMktForbidden = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-ForbiddenAssignMkt`,
          email: `tl-mkt-forbid-${runId}@licrm.test`,
          productId: 1,
          sourceId: 1,
          assignedTo: sales1Id,
        },
        mktTok,
      );

      // 3. Create an inactive throwaway user
      const inactUserRes = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role_id, is_active)
         VALUES ($1, 'dummy_hash', 'Inactive', 'TestUser', 1, FALSE)
         RETURNING id`,
        [`inactive-${runId}@licrm.test`],
      );
      const inactiveUserId = inactUserRes.rows[0].id;
      throwawayUserIds.push(inactiveUserId);

      // Admin tries to assign to inactive user -> 400 INVALID_ASSIGNEE
      const rAdminInactive = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-AdminAssignInactive`,
          email: `tl-admin-inact-${runId}@licrm.test`,
          productId: 1,
          sourceId: 1,
          assignedTo: inactiveUserId,
        },
        adminTok,
      );

      // 4. Business head tries to assign to admin (outside team) -> 400 INVALID_ASSIGNEE
      const rBhOutTeam = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-BhOutTeam`,
          email: `tl-bh-out-${runId}@licrm.test`,
          productId: 1,
          sourceId: 6,
          assignedTo: adminId,
        },
        bhTok,
      );

      assert(
        rSalesForbidden.status === 403 &&
          rMktForbidden.status === 403 &&
          rAdminInactive.status === 400 &&
          rAdminInactive.data?.error?.code === 'INVALID_ASSIGNEE' &&
          rBhOutTeam.status === 400 &&
          rBhOutTeam.data?.error?.code === 'INVALID_ASSIGNEE',
        'T04: Assignment rules on create (sales1 supplying other -> 403, marketing supplying assignee -> 403, inactive -> 400, BH outside team -> 400 INVALID_ASSIGNEE)',
        `sales=${rSalesForbidden.status}, mkt=${rMktForbidden.status}, inact=${rAdminInactive.status}, bh=${rBhOutTeam.status}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T05: Create Validations
    // ─────────────────────────────────────────────────────────────────────────
    {
      const rNoContact = await api('POST', '/leads', { leadName: 'TL-NoContact', productId: 1, sourceId: 1 }, adminTok);
      const rBadEmail = await api(
        'POST',
        '/leads',
        { leadName: 'TL-BadEmail', email: 'not-an-email', productId: 1, sourceId: 1 },
        adminTok,
      );
      const rBadMobileLetters = await api(
        'POST',
        '/leads',
        { leadName: 'TL-BadMobileLetters', mobile: '98765abcd', productId: 1, sourceId: 1 },
        adminTok,
      );
      const rBadMobileShort = await api(
        'POST',
        '/leads',
        { leadName: 'TL-BadMobileShort', mobile: '1234', productId: 1, sourceId: 1 },
        adminTok,
      );
      const rInvalidProd = await api(
        'POST',
        '/leads',
        { leadName: 'TL-InvalidProd', email: 'v@e.com', productId: 999999, sourceId: 1 },
        adminTok,
      );
      const rInvalidSource = await api(
        'POST',
        '/leads',
        { leadName: 'TL-InvalidSrc', email: 'v@e.com', productId: 1, sourceId: 999999 },
        adminTok,
      );
      const rUnknown = await api(
        'POST',
        '/leads',
        { leadName: 'TL-Unknown', email: 'v@e.com', productId: 1, sourceId: 1, extraField: 'bogus' },
        adminTok,
      );
      const rStatusSet = await api(
        'POST',
        '/leads',
        { leadName: 'TL-StatusSet', email: 'v@e.com', productId: 1, sourceId: 1, statusId: 3 },
        adminTok,
      );
      const rCodeSet = await api(
        'POST',
        '/leads',
        { leadName: 'TL-CodeSet', email: 'v@e.com', productId: 1, sourceId: 1, leadCode: 'LD-2026-99999' },
        adminTok,
      );
      const rBadPriority = await api(
        'POST',
        '/leads',
        { leadName: 'TL-BadPriority', email: 'v@e.com', productId: 1, sourceId: 1, priority: 'urgent' },
        adminTok,
      );
      const rBadWebsite = await api(
        'POST',
        '/leads',
        { leadName: 'TL-BadWebsite', email: 'v@e.com', productId: 1, sourceId: 1, website: 'not a url' },
        adminTok,
      );
      const rPastDate = await api(
        'POST',
        '/leads',
        {
          leadName: 'TL-PastDate',
          email: 'v@e.com',
          productId: 1,
          sourceId: 1,
          nextFollowUpAt: '2020-01-01T10:00:00Z',
        },
        adminTok,
      );
      const dummyContactId = '11111111-1111-1111-1111-111111111111';
      const rContactNoCompany = await api(
        'POST',
        '/leads',
        {
          leadName: 'TL-ContactNoCompany',
          email: 'v@e.com',
          productId: 1,
          sourceId: 1,
          contactId: dummyContactId,
        },
        adminTok,
      );
      const rShortName = await api(
        'POST',
        '/leads',
        { leadName: 'A', email: 'v@e.com', productId: 1, sourceId: 1 },
        adminTok,
      );

      // Normalisation check on successful write:
      // website without scheme -> https://, email lowercase, mobile "+91 98765-43210" -> "+919876543210"
      const rNormSuccess = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-NormalisedLead`,
          email: `TL-UPPERCASE-${runId}@LICRM.TEST`,
          mobile: '+91 98765-43210',
          website: 'example.org/path',
          productId: 1,
          sourceId: 1,
        },
        adminTok,
      );
      const normLead = rNormSuccess.data?.data?.lead;
      if (normLead?.id) throwawayLeadIds.push(normLead.id);

      assert(
        rNoContact.status === 400 &&
          rBadEmail.status === 400 &&
          rBadMobileLetters.status === 400 &&
          rBadMobileShort.status === 400 &&
          rInvalidProd.status === 400 &&
          rInvalidSource.status === 400 &&
          rUnknown.status === 400 &&
          rStatusSet.status === 400 &&
          rCodeSet.status === 400 &&
          rBadPriority.status === 400 &&
          rBadWebsite.status === 400 &&
          rPastDate.status === 400 &&
          rContactNoCompany.status === 400 &&
          rShortName.status === 400 &&
          rNormSuccess.status === 201 &&
          normLead.email === `tl-uppercase-${runId}@licrm.test` &&
          normLead.mobile === '+919876543210' &&
          normLead.website === 'https://example.org/path',
        'T05: Create validations (all 14 edge cases -> 400 VALIDATION_ERROR; normalisation stores clean https://, lowercase email, stripped mobile)',
        `normStatus=${rNormSuccess.status}, email=${normLead?.email}, mobile=${normLead?.mobile}, web=${normLead?.website}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T06: Duplicate Checks
    // ─────────────────────────────────────────────────────────────────────────
    {
      // 1. Same email different case -> 409 DUPLICATE_LEAD
      const rDupEmail = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-DupEmail`,
          email: `TL-ADMIN-${runId}@LICRM.TEST`,
          productId: 1,
          sourceId: 1,
        },
        adminTok,
      );

      // 2. Same mobile different format -> 409
      const rDupMobile = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-DupMobile`,
          mobile: '09876500001', // admin lead has +91 98765 00001
          productId: 1,
          sourceId: 1,
        },
        adminTok,
      );

      // 3. allowDuplicate: true -> 201
      const rAllowDup = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-AllowDup`,
          email: `tl-admin-${runId}@licrm.test`,
          productId: 1,
          sourceId: 1,
          allowDuplicate: true,
        },
        adminTok,
      );
      if (rAllowDup.data?.data?.lead?.id) throwawayLeadIds.push(rAllowDup.data.data.lead.id);

      // 4. Soft deleted lead is NOT a duplicate
      const rTempLead = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-SoftDelLead`,
          email: `tl-softdel-${runId}@licrm.test`,
          productId: 1,
          sourceId: 1,
        },
        adminTok,
      );
      const tempId = rTempLead.data.data.lead.id;
      throwawayLeadIds.push(tempId);
      await api('DELETE', `/leads/${tempId}`, undefined, adminTok);

      const rRecreateSoftDel = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-RecreatedSoftDel`,
          email: `tl-softdel-${runId}@licrm.test`,
          productId: 1,
          sourceId: 1,
        },
        adminTok,
      );
      if (rRecreateSoftDel.data?.data?.lead?.id) throwawayLeadIds.push(rRecreateSoftDel.data.data.lead.id);

      // 5. Out-of-scope duplicate (sales2 uses email owned by sales1's lead)
      const rSales2OutScopeDup = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-Sales2OutScope`,
          email: `tl-sales1-${runId}@licrm.test`, // owned by sales1
          productId: 1,
          sourceId: 6,
        },
        sales2Tok,
      );

      // 6. POST /check-duplicate with excludeLeadId
      const rCheckExclude = await api(
        'POST',
        '/leads/check-duplicate',
        {
          email: `tl-admin-${runId}@licrm.test`,
          excludeLeadId: adminLeadId,
        },
        adminTok,
      );

      // 7. Check-duplicate with neither field -> 400
      const rCheckNeither = await api('POST', '/leads/check-duplicate', {}, adminTok);

      assert(
        rDupEmail.status === 409 &&
          rDupEmail.data?.error?.code === 'DUPLICATE_LEAD' &&
          rDupMobile.status === 409 &&
          rAllowDup.status === 201 &&
          rRecreateSoftDel.status === 201 &&
          rSales2OutScopeDup.status === 409 &&
          rSales2OutScopeDup.data?.error?.details?.duplicates?.length === 0 &&
          rSales2OutScopeDup.data?.error?.details?.outOfScopeCount >= 1 &&
          rCheckExclude.status === 200 &&
          rCheckNeither.status === 400,
        'T06: Duplicates (email case-insensitive 409, mobile formats 409, allowDuplicate:true 201, soft-deleted not duplicate, out-of-scope duplicate 409 with count, check-duplicate endpoint)',
        `dupEmail=${rDupEmail.status}, dupMobile=${rDupMobile.status}, allowDup=${rAllowDup.status}, softDel=${rRecreateSoftDel.status}, outScope=${rSales2OutScopeDup.status}, checkNeither=${rCheckNeither.status}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T07: List Basics & Pagination
    // ─────────────────────────────────────────────────────────────────────────
    {
      const rList = await api('GET', '/leads?page=1&limit=2', undefined, adminTok);
      const rOverLimit = await api('GET', '/leads?limit=101', undefined, adminTok);
      const rZeroPage = await api('GET', '/leads?page=0', undefined, adminTok);

      // Pagination walking with limit=5
      const rPage1 = await api('GET', '/leads?page=1&limit=5', undefined, adminTok);
      const rPage2 = await api('GET', '/leads?page=2&limit=5', undefined, adminTok);

      const p1Ids = (rPage1.data?.data?.leads ?? []).map((l: any) => l.id);
      const p2Ids = (rPage2.data?.data?.leads ?? []).map((l: any) => l.id);
      const overlap = p1Ids.some((id: string) => p2Ids.includes(id));

      const totalReported = rPage1.data?.data?.meta?.total;
      const countRes = await query(`SELECT COUNT(*) AS count FROM leads WHERE deleted_at IS NULL`);
      const directSqlTotal = parseInt(countRes.rows[0].count, 10);

      assert(
        rList.status === 200 &&
          rList.data.data.leads.length <= 2 &&
          rList.data.data.meta.page === 1 &&
          rList.data.data.meta.limit === 2 &&
          typeof rList.data.data.meta.total === 'number' &&
          typeof rList.data.data.meta.totalPages === 'number' &&
          rOverLimit.status === 400 &&
          rZeroPage.status === 400 &&
          !overlap &&
          totalReported === directSqlTotal,
        'T07: List pagination (page=1&limit=2 works, meta correct, limit=101 -> 400, page=0 -> 400, limit=5 walks pages without duplicates, total matches DB)',
        `list=${rList.status}, overLimit=${rOverLimit.status}, zeroPage=${rZeroPage.status}, overlap=${overlap}, total=${totalReported} vs sql=${directSqlTotal}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T08: List Filters
    // ─────────────────────────────────────────────────────────────────────────
    {
      // 1. Insert real company via SQL
      const compRes = await query(
        `INSERT INTO companies (name, industry) VALUES ($1, 'Technology') RETURNING id`,
        [`TL-Company-${runId}`],
      );
      const companyId = compRes.rows[0].id;
      throwawayCompanyIds.push(companyId);

      // Create a lead linked to this company
      const rCompLead = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-CompanyLead`,
          companyId,
          email: `tl-comp-${runId}@licrm.test`,
          productId: 1,
          sourceId: 1,
        },
        adminTok,
      );
      const compLeadId = rCompLead.data?.data?.lead?.id;
      if (compLeadId) throwawayLeadIds.push(compLeadId);

      // 2. Set next_follow_up_at in past via SQL on adminLeadId
      await query(
        `UPDATE leads SET next_follow_up_at = NOW() - INTERVAL '2 hours' WHERE id = $1`,
        [adminLeadId],
      );

      // Filters
      const rStatus = await api('GET', '/leads?statusId=1', undefined, adminTok);
      const rStatusMulti = await api('GET', '/leads?statusId=1,2', undefined, adminTok);
      const rProduct = await api('GET', '/leads?productId=1', undefined, adminTok);
      const rSource = await api('GET', '/leads?sourceId=6', undefined, adminTok);
      const rPriority = await api('GET', '/leads?priority=high', undefined, adminTok);
      const rAssigned = await api('GET', `/leads?assignedTo=${sales1Id}`, undefined, adminTok);
      const rUnassigned = await api('GET', '/leads?unassigned=true', undefined, adminTok);
      const rCompany = await api('GET', `/leads?companyId=${companyId}`, undefined, adminTok);
      const rOverdue = await api('GET', '/leads?overdue=true', undefined, adminTok);
      const rSearch = await api('GET', `/leads?q=AdminLead`, undefined, adminTok);
      const rInvalidSort = await api('GET', '/leads?sortBy=nonexistent', undefined, adminTok);

      const allStatus1 = rStatus.data.data.leads.every((i: any) => i.status.id === 1);
      const allStatusMulti = rStatusMulti.data.data.leads.every((i: any) => [1, 2].includes(i.status.id));
      const allProduct1 = rProduct.data.data.leads.every((i: any) => i.product.id === 1);
      const allSource6 = rSource.data.data.leads.every((i: any) => i.source.id === 6);
      const allPriorityHigh = rPriority.data.data.leads.every((i: any) => i.priority === 'high');
      const allAssignedSales1 = rAssigned.data.data.leads.every((i: any) => i.assignedTo?.id === sales1Id);
      const allUnassigned = rUnassigned.data.data.leads.every((i: any) => i.assignedTo === null);
      const compLeadFound = rCompany.data.data.leads.some((i: any) => i.id === compLeadId);
      const overdueContainsAdmin = rOverdue.data.data.leads.some((i: any) => i.id === adminLeadId);
      const searchFound = rSearch.data.data.leads.some((i: any) => i.id === adminLeadId);

      assert(
        allStatus1 &&
          allStatusMulti &&
          allProduct1 &&
          allSource6 &&
          allPriorityHigh &&
          allAssignedSales1 &&
          allUnassigned &&
          compLeadFound &&
          overdueContainsAdmin &&
          searchFound &&
          rInvalidSort.status === 400,
        'T08: List filters (statusId multi, product, source, priority, assignedTo, unassigned, companyId, overdue, q search, invalid sortBy -> 400)',
        `status=${allStatus1}, multi=${allStatusMulti}, prod=${allProduct1}, src=${allSource6}, prio=${allPriorityHigh}, comp=${compLeadFound}, overdue=${overdueContainsAdmin}, search=${searchFound}, invalidSort=${rInvalidSort.status}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T09: List Sorting
    // ─────────────────────────────────────────────────────────────────────────
    {
      const rPrio = await api('GET', '/leads?sortBy=priority&order=desc', undefined, adminTok);
      const prioOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
      let prioSorted = true;
      const itemsPrio = rPrio.data.data.leads;
      for (let i = 0; i < itemsPrio.length - 1; i++) {
        if (prioOrder[itemsPrio[i].priority] < prioOrder[itemsPrio[i + 1].priority]) {
          prioSorted = false;
          break;
        }
      }

      const rNameAsc = await api('GET', '/leads?sortBy=leadName&order=asc', undefined, adminTok);
      let nameAscSorted = true;
      const itemsName = rNameAsc.data.data.leads;
      for (let i = 0; i < itemsName.length - 1; i++) {
        if (itemsName[i].leadName.toLowerCase() > itemsName[i + 1].leadName.toLowerCase()) {
          nameAscSorted = false;
          break;
        }
      }

      assert(
        prioSorted && nameAscSorted,
        'T09: List sorting (priority desc: high > medium > low; leadName asc)',
        `prioSorted=${prioSorted}, nameAscSorted=${nameAscSorted}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T10: Data Scope on List & Detail (RBAC)
    // ─────────────────────────────────────────────────────────────────────────
    {
      const [listAdmin, listBh, listSales1, listSales2, listMkt] = await Promise.all([
        api('GET', '/leads?limit=100', undefined, adminTok),
        api('GET', '/leads?limit=100', undefined, bhTok),
        api('GET', '/leads?limit=100', undefined, sales1Tok),
        api('GET', '/leads?limit=100', undefined, sales2Tok),
        api('GET', '/leads?limit=100', undefined, mktTok),
      ]);

      const adminItems = listAdmin.data.data.leads;
      const bhItems = listBh.data.data.leads;
      const sales1Items = listSales1.data.data.leads;
      const sales2Items = listSales2.data.data.leads;
      const mktItems = listMkt.data.data.leads;

      // Sales1 sees only own leads
      const sales1OwnOnly = sales1Items.every((i: any) => i.assignedTo?.id === sales1Id);
      // Sales2 sees only own leads
      const sales2OwnOnly = sales2Items.every((i: any) => i.assignedTo?.id === sales2Id);
      // Marketing sees marketing-source leads or own created
      const mktMarketingOnly = mktItems.every((i: any) => i.source?.isMarketing === true || i.createdBy?.id === mktId);

      // Sales1 attempts detail on BH's lead (assigned to sales2) -> 404 (not 403)
      const rSalesDetailOutOfScope = await api('GET', `/leads/${bhLeadId}`, undefined, sales1Tok);

      assert(
        adminItems.length >= bhItems.length &&
          bhItems.length >= sales1Items.length &&
          sales1OwnOnly &&
          sales2OwnOnly &&
          mktMarketingOnly &&
          rSalesDetailOutOfScope.status === 404,
        'T10: Scope engine (admin all, BH team, sales1 only own, sales2 only own, mkt marketing; out-of-scope detail returns 404)',
        `admin=${adminItems.length}, bh=${bhItems.length}, sales1=${sales1Items.length}, sales2=${sales2Items.length}, mkt=${mktItems.length}, salesOutOfScope=${rSalesDetailOutOfScope.status}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T11: Detail & allowedNextStatuses
    // ─────────────────────────────────────────────────────────────────────────
    {
      const rDetail = await api('GET', `/leads/${adminLeadId}`, undefined, adminTok);
      const lead = rDetail.data?.data?.lead;
      const allowed = lead?.allowedNextStatuses ?? [];

      // Reopen option for Lost appears only for admin / business_head
      // Walk a throwaway lead to Lost
      const rReopenTestLead = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-ReopenCheck`,
          email: `tl-reopen-${runId}@licrm.test`,
          productId: 1,
          sourceId: 6,
          assignedTo: sales1Id,
        },
        adminTok,
      );
      const reopenLeadId = rReopenTestLead.data.data.lead.id;
      throwawayLeadIds.push(reopenLeadId);

      await api('PATCH', `/leads/${reopenLeadId}/status`, { statusId: 8, lostReason: 'Test reopen' }, adminTok);

      const rLostAdminDetail = await api('GET', `/leads/${reopenLeadId}`, undefined, adminTok);
      const rLostSalesDetail = await api('GET', `/leads/${reopenLeadId}`, undefined, sales1Tok);

      const adminHasNewLead = (rLostAdminDetail.data?.data?.lead?.allowedNextStatuses ?? []).some(
        (s: any) => s.name === 'New Lead',
      );
      const salesHasNewLead = (rLostSalesDetail.data?.data?.lead?.allowedNextStatuses ?? []).some(
        (s: any) => s.name === 'New Lead',
      );

      const rInvalidUuid = await api('GET', '/leads/not-a-valid-uuid', undefined, adminTok);
      const rRandomUuid = await api('GET', '/leads/00000000-0000-0000-0000-000000000000', undefined, adminTok);

      assert(
        rDetail.status === 200 &&
          allowed.some((s: any) => s.name === 'Contacted') &&
          allowed.some((s: any) => s.name === 'Lost') &&
          adminHasNewLead &&
          !salesHasNewLead &&
          rInvalidUuid.status === 400 &&
          rRandomUuid.status === 404,
        'T11: Detail (allowedNextStatuses for New Lead, reopen option for Lost appears only for admin/BH, invalid uuid -> 400, random uuid -> 404)',
        `status=${rDetail.status}, adminReopen=${adminHasNewLead}, salesReopen=${salesHasNewLead}, invalidUuid=${rInvalidUuid.status}, randomUuid=${rRandomUuid.status}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T12: Update
    // ─────────────────────────────────────────────────────────────────────────
    {
      // 1. Update allowed fields
      const rUpdate = await api(
        'PUT',
        `/leads/${adminLeadId}`,
        {
          leadName: `TL-${runId}-AdminLeadUpdated`,
          remarks: 'Updated remarks for testing',
          priority: 'low',
        },
        adminTok,
      );

      // 2. Passing statusId in PUT -> 400 naming dedicated endpoint
      const rPutStatus = await api('PUT', `/leads/${adminLeadId}`, { statusId: 2 }, adminTok);

      // 3. Passing assignedTo in PUT -> 400 naming dedicated endpoint
      const rPutAssignee = await api('PUT', `/leads/${adminLeadId}`, { assignedTo: bhId }, adminTok);

      // 4. Empty body -> 400
      const rEmptyBody = await api('PUT', `/leads/${adminLeadId}`, {}, adminTok);

      // 5. No-op update returns 200 and writes NO new activity / audit row
      const auditBeforeRes = await query(
        `SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id = $1 AND action = 'lead.update'`,
        [adminLeadId],
      );
      const actBeforeRes = await query(
        `SELECT COUNT(*) AS count FROM activities WHERE lead_id = $1 AND subject = 'Lead updated'`,
        [adminLeadId],
      );

      const rNoop = await api(
        'PUT',
        `/leads/${adminLeadId}`,
        {
          leadName: `TL-${runId}-AdminLeadUpdated`,
          remarks: 'Updated remarks for testing',
          priority: 'low',
        },
        adminTok,
      );

      const auditAfterRes = await query(
        `SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id = $1 AND action = 'lead.update'`,
        [adminLeadId],
      );
      const actAfterRes = await query(
        `SELECT COUNT(*) AS count FROM activities WHERE lead_id = $1 AND subject = 'Lead updated'`,
        [adminLeadId],
      );

      const noNewAudit = auditBeforeRes.rows[0].count === auditAfterRes.rows[0].count;
      const noNewActivity = actBeforeRes.rows[0].count === actAfterRes.rows[0].count;

      // 6. Changing email to existing lead email -> 409 unless allowDuplicate
      const rDupEmailUpdate = await api(
        'PUT',
        `/leads/${adminLeadId}`,
        {
          email: `tl-bh-${runId}@licrm.test`,
        },
        adminTok,
      );

      assert(
        rUpdate.status === 200 &&
          rUpdate.data.data.lead.leadName === `TL-${runId}-AdminLeadUpdated` &&
          rPutStatus.status === 400 &&
          rPutAssignee.status === 400 &&
          rEmptyBody.status === 400 &&
          rNoop.status === 200 &&
          noNewAudit &&
          noNewActivity &&
          rDupEmailUpdate.status === 409,
        'T12: Update (allowed fields succeed; statusId/assignedTo in PUT -> 400 naming PATCH endpoints; empty body -> 400; no-op writes no rows; duplicate email -> 409)',
        `update=${rUpdate.status}, putStatus=${rPutStatus.status}, putAssignee=${rPutAssignee.status}, empty=${rEmptyBody.status}, noop=${rNoop.status}, noNewAudit=${noNewAudit}, dupUpdate=${rDupEmailUpdate.status}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T13: Status Workflow
    // ─────────────────────────────────────────────────────────────────────────
    {
      // Create fresh lead for status progression
      const rProgLead = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-ProgressionLead`,
          email: `tl-prog-${runId}@licrm.test`,
          productId: 1,
          sourceId: 6,
          assignedTo: sales1Id,
        },
        adminTok,
      );
      const progLeadId = rProgLead.data.data.lead.id;
      throwawayLeadIds.push(progLeadId);

      // Walk sequence: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 (Converted)
      const r2 = await api('PATCH', `/leads/${progLeadId}/status`, { statusId: 2 }, adminTok); // Contacted
      const r3 = await api('PATCH', `/leads/${progLeadId}/status`, { statusId: 3 }, adminTok); // Interested
      const r4 = await api('PATCH', `/leads/${progLeadId}/status`, { statusId: 4 }, adminTok); // Meeting Scheduled
      const r5 = await api('PATCH', `/leads/${progLeadId}/status`, { statusId: 5 }, adminTok); // Proposal Sent
      const r6 = await api('PATCH', `/leads/${progLeadId}/status`, { statusId: 6 }, adminTok); // Negotiation
      const r7 = await api('PATCH', `/leads/${progLeadId}/status`, { statusId: 7 }, adminTok); // Converted

      // Backward one step (Interested -> Contacted): test on fresh lead
      const rBackLead = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-BackwardLead`,
          email: `tl-back-${runId}@licrm.test`,
          productId: 1,
          sourceId: 6,
          assignedTo: sales1Id,
        },
        adminTok,
      );
      const backLeadId = rBackLead.data.data.lead.id;
      throwawayLeadIds.push(backLeadId);

      await api('PATCH', `/leads/${backLeadId}/status`, { statusId: 2 }, adminTok); // Contacted
      await api('PATCH', `/leads/${backLeadId}/status`, { statusId: 3 }, adminTok); // Interested
      const rBackward = await api('PATCH', `/leads/${backLeadId}/status`, { statusId: 2 }, adminTok); // Back to Contacted (allowed)

      // Converting an unassigned lead -> 422 LEAD_NOT_ASSIGNED
      const rUnassignedLead = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-UnassignedConvert`,
          email: `tl-unassigned-convert-${runId}@licrm.test`,
          productId: 3,
          sourceId: 1, // marketing -> unassigned
        },
        mktTok,
      );
      const unassignedLeadId = rUnassignedLead.data.data.lead.id;
      throwawayLeadIds.push(unassignedLeadId);

      // Move unassigned lead to Proposal Sent
      await api('PATCH', `/leads/${unassignedLeadId}/status`, { statusId: 5 }, adminTok);
      const rUnassignedConvertFail = await api('PATCH', `/leads/${unassignedLeadId}/status`, { statusId: 7 }, adminTok);

      // Lost without lostReason -> 400
      const rLostNoReason = await api('PATCH', `/leads/${backLeadId}/status`, { statusId: 8 }, adminTok);
      // Lost with reason -> 200
      const rLostWithReason = await api(
        'PATCH',
        `/leads/${backLeadId}/status`,
        { statusId: 8, lostReason: 'Lost deal to competitor' },
        adminTok,
      );

      // Reopening Lost -> New Lead: sales1 (no leads.assign) -> 403; BH -> 200
      const rSalesReopen = await api('PATCH', `/leads/${backLeadId}/status`, { statusId: 1 }, sales1Tok);
      const rBhReopen = await api('PATCH', `/leads/${backLeadId}/status`, { statusId: 1 }, bhTok);

      assert(
        r2.status === 200 &&
          r3.status === 200 &&
          r4.status === 200 &&
          r5.status === 200 &&
          r6.status === 200 &&
          r7.status === 200 &&
          r7.data.data.lead.convertedAt !== null &&
          rBackward.status === 200 &&
          rUnassignedConvertFail.status === 422 &&
          rUnassignedConvertFail.data?.error?.code === 'LEAD_NOT_ASSIGNED' &&
          rLostNoReason.status === 400 &&
          rLostWithReason.status === 200 &&
          rSalesReopen.status === 403 &&
          rBhReopen.status === 200 &&
          rBhReopen.data.data.lead.lostReason === null,
        'T13: Status workflow (walk 1->7 Converted with convertedAt; backward step 200; unassigned convert -> 422 LEAD_NOT_ASSIGNED; lostReason required for Lost; reopen: sales 403, BH 200)',
        `converted=${r7.status}, back=${rBackward.status}, unassignedConvert=${rUnassignedConvertFail.status}, lostNoReason=${rLostNoReason.status}, salesReopen=${rSalesReopen.status}, bhReopen=${rBhReopen.status}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T14: Concurrency Race Condition (Row Locking)
    // ─────────────────────────────────────────────────────────────────────────
    {
      const rRaceLead = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-ConcurrencyRaceLead`,
          email: `tl-race-${runId}@licrm.test`,
          productId: 1,
          sourceId: 6,
          assignedTo: sales1Id,
        },
        adminTok,
      );
      const raceLeadId = rRaceLead.data.data.lead.id;
      throwawayLeadIds.push(raceLeadId);

      // Walk to Negotiation (status 6)
      await api('PATCH', `/leads/${raceLeadId}/status`, { statusId: 5 }, adminTok); // Proposal Sent
      await api('PATCH', `/leads/${raceLeadId}/status`, { statusId: 6 }, adminTok); // Negotiation

      // Count status_change activities before race
      const actBeforeRes = await query(
        `SELECT COUNT(*) AS count FROM activities WHERE lead_id = $1 AND type = 'status_change'`,
        [raceLeadId],
      );
      const actBefore = parseInt(actBeforeRes.rows[0].count, 10);

      // Fire parallel requests: one to Converted (7), one to Lost (8)
      const [resConverted, resLost] = await Promise.all([
        api('PATCH', `/leads/${raceLeadId}/status`, { statusId: 7 }, adminTok),
        api('PATCH', `/leads/${raceLeadId}/status`, { statusId: 8, lostReason: 'Race condition test' }, adminTok),
      ]);

      const winner = resConverted.status === 200 ? resConverted : resLost;
      const loser = resConverted.status === 200 ? resLost : resConverted;
      const winnerTargetStatusId = resConverted.status === 200 ? 7 : 8;

      // Count status_change activities after race
      const actAfterRes = await query(
        `SELECT COUNT(*) AS count FROM activities WHERE lead_id = $1 AND type = 'status_change'`,
        [raceLeadId],
      );
      const actAfter = parseInt(actAfterRes.rows[0].count, 10);
      const activitiesAdded = actAfter - actBefore;

      const dbLeadRes = await query(`SELECT status_id FROM leads WHERE id = $1`, [raceLeadId]);
      const finalDbStatus = dbLeadRes.rows[0]?.status_id;

      const winnerOk = winner.status === 200;
      const loserOk = loser.status === 422 && loser.data?.error?.code === 'INVALID_STATUS_TRANSITION';
      const activitiesOk = activitiesAdded === 1;
      const dbStatusOk = finalDbStatus === winnerTargetStatusId;

      const diag = `winnerStatus=${winner.status}, loserStatus=${loser.status}, loserErrorCode=${loser.data?.error?.code}, finalDbStatus=${finalDbStatus}, addedActivities=${activitiesAdded}`;

      assert(
        winnerOk && loserOk && activitiesOk && dbStatusOk,
        'T14: Concurrency race condition (parallel Converted & Lost on Negotiation -> exactly one 200, one 422, exactly one status_change activity added)',
        diag,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T15: Assign & History
    // ─────────────────────────────────────────────────────────────────────────
    {
      const rAssignLead = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-AssignTestLead`,
          email: `tl-assign-test-${runId}@licrm.test`,
          productId: 1,
          sourceId: 6,
          assignedTo: sales1Id,
        },
        adminTok,
      );
      const assignLeadId = rAssignLead.data.data.lead.id;
      throwawayLeadIds.push(assignLeadId);

      // 1. Reassign from sales1 to sales2
      const rReassign = await api(
        'PATCH',
        `/leads/${assignLeadId}/assign`,
        { assignedTo: sales2Id, reason: 'Rebalancing team workload' },
        adminTok,
      );

      // Verify sales1 now gets 404 (lead no longer in their scope) and sales2 gets 200
      const rSales1Check = await api('GET', `/leads/${assignLeadId}`, undefined, sales1Tok);
      const rSales2Check = await api('GET', `/leads/${assignLeadId}`, undefined, sales2Tok);

      // 2. Sales executive tries to assign -> 403
      const rSalesAssignForbidden = await api(
        'PATCH',
        `/leads/${assignLeadId}/assign`,
        { assignedTo: sales1Id },
        sales2Tok,
      );

      // 3. GET /assignments
      const rHist = await api('GET', `/leads/${assignLeadId}/assignments`, undefined, adminTok);
      const assignments = rHist.data?.data?.assignments ?? [];

      // 4. Closed lead cannot be assigned -> 422 LEAD_CLOSED
      await api('PATCH', `/leads/${assignLeadId}/status`, { statusId: 8, lostReason: 'Closing for test' }, adminTok);
      const rAssignClosed = await api(
        'PATCH',
        `/leads/${assignLeadId}/assign`,
        { assignedTo: sales1Id },
        adminTok,
      );

      assert(
        rReassign.status === 200 &&
          rSales1Check.status === 404 &&
          rSales2Check.status === 200 &&
          rSalesAssignForbidden.status === 403 &&
          assignments.length >= 2 &&
          assignments[0].reason === 'Rebalancing team workload' &&
          rAssignClosed.status === 422 &&
          rAssignClosed.data?.error?.code === 'LEAD_CLOSED',
        'T15: Assign & history (reassign updates scope: old gets 404, new gets 200; sales -> 403; history returned; closed lead -> 422 LEAD_CLOSED)',
        `reassign=${rReassign.status}, sales1Scope=${rSales1Check.status}, sales2Scope=${rSales2Check.status}, salesForbidden=${rSalesAssignForbidden.status}, closed=${rAssignClosed.status}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T16: Delete (Soft Delete)
    // ─────────────────────────────────────────────────────────────────────────
    {
      const rDelLead = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-DeleteTargetLead`,
          email: `tl-delete-${runId}@licrm.test`,
          productId: 1,
          sourceId: 6,
          assignedTo: sales1Id,
        },
        adminTok,
      );
      const delLeadId = rDelLead.data.data.lead.id;
      throwawayLeadIds.push(delLeadId);

      // 1. Sales tries to delete -> 403
      const rSalesDel = await api('DELETE', `/leads/${delLeadId}`, undefined, sales1Tok);
      // 2. Marketing tries to delete -> 403
      const rMktDel = await api('DELETE', `/leads/${delLeadId}`, undefined, mktTok);
      // 3. Admin deletes -> 200
      const rAdminDel = await api('DELETE', `/leads/${delLeadId}`, undefined, adminTok);

      // Verify soft deleted in DB
      const dbCheck = await query(`SELECT deleted_at FROM leads WHERE id = $1`, [delLeadId]);
      const isSoftDeleted = dbCheck.rows[0]?.deleted_at !== null;

      // GET on deleted lead -> 404
      const rGetDel = await api('GET', `/leads/${delLeadId}`, undefined, adminTok);

      assert(
        rSalesDel.status === 403 &&
          rMktDel.status === 403 &&
          rAdminDel.status === 200 &&
          isSoftDeleted &&
          rGetDel.status === 404,
        'T16: Delete (sales/marketing -> 403; admin -> 200; soft deleted in DB; subsequent GET -> 404)',
        `salesDel=${rSalesDel.status}, mktDel=${rMktDel.status}, adminDel=${rAdminDel.status}, softDeleted=${isSoftDeleted}, getDel=${rGetDel.status}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T17: Audit Logs Verification
    // ─────────────────────────────────────────────────────────────────────────
    {
      const auditRes = await query(
        `SELECT DISTINCT action FROM audit_logs WHERE entity_type = 'lead'`,
      );
      const actions = new Set(auditRes.rows.map((r) => r.action));

      const hasCreate = actions.has('lead.create');
      const hasUpdate = actions.has('lead.update');
      const hasStatus = actions.has('lead.status_change');
      const hasAssign = actions.has('lead.assign');
      const hasDelete = actions.has('lead.delete');

      assert(
        hasCreate && hasUpdate && hasStatus && hasAssign && hasDelete,
        'T17: Audit rows exist for lead.create, lead.update, lead.status_change, lead.assign, and lead.delete',
        `actions found: ${Array.from(actions).join(', ')}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T18: SQL Injection & LIKE Wildcard Escaping
    // ─────────────────────────────────────────────────────────────────────────
    {
      // 1. Create fixtures with literal % and _
      const rPctLead = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-100%`,
          email: `tl-pct-${runId}@licrm.test`,
          productId: 1,
          sourceId: 1,
        },
        adminTok,
      );
      const rUnderscoreLead = await api(
        'POST',
        '/leads',
        {
          leadName: `TL-${runId}-a_b`,
          email: `tl-under-${runId}@licrm.test`,
          productId: 1,
          sourceId: 1,
        },
        adminTok,
      );
      if (rPctLead.data?.data?.lead?.id) throwawayLeadIds.push(rPctLead.data.data.lead.id);
      if (rUnderscoreLead.data?.data?.lead?.id) throwawayLeadIds.push(rUnderscoreLead.data.data.lead.id);

      // Search for literal '%'
      const rPctSearch = await api('GET', '/leads?q=%', undefined, adminTok);
      const pctMatches = rPctSearch.data?.data?.leads ?? [];
      const onlyContainsPercent = pctMatches.every((l: any) =>
        l.leadName.includes('%') || (l.email && l.email.includes('%')),
      );

      // SQL injection in q
      const rSqlInjectQ = await api('GET', "/leads?q='; DROP TABLE leads;--", undefined, adminTok);
      const checkTableRes = await query(`SELECT to_regclass('public.leads') AS tbl`);
      const tableStillExists = checkTableRes.rows[0].tbl !== null;

      // SQL injection in sortBy
      const rSqlInjectSort = await api('GET', '/leads?sortBy=createdAt;DROP TABLE leads', undefined, adminTok);

      assert(
        onlyContainsPercent &&
          rSqlInjectQ.status === 200 &&
          tableStillExists &&
          rSqlInjectSort.status === 400,
        'T18: SQL injection & LIKE wildcards (q=% matches only rows containing %, table survives injection payload, sortBy injection -> 400)',
        `onlyPct=${onlyContainsPercent}, injectQ=${rSqlInjectQ.status}, tableExists=${tableStillExists}, injectSort=${rSqlInjectSort.status}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T19: Response Hygiene
    // ─────────────────────────────────────────────────────────────────────────
    {
      const rDetail = await api('GET', `/leads/${sales1LeadId}`, undefined, adminTok);
      const bodyStr = JSON.stringify(rDetail.data);

      const noPasswordHash = !bodyStr.includes('password') && !bodyStr.includes('hash');
      const noDeletedAt = !rDetail.data.data.lead.deletedAt && !rDetail.data.data.lead.deleted_at;

      // Verify list items contain exact documented keys
      const rList = await api('GET', '/leads?limit=1', undefined, adminTok);
      const firstItem = rList.data?.data?.leads?.[0];
      const documentedKeys = [
        'id', 'leadCode', 'leadName', 'companyId', 'companyName', 'contactId',
        'email', 'mobile', 'website', 'industry', 'product', 'source',
        'assignedTo', 'priority', 'status', 'nextFollowUpAt', 'remarks',
        'lostReason', 'convertedAt', 'createdBy', 'createdAt', 'updatedAt'
      ];
      const itemKeys = Object.keys(firstItem);
      const keysMatch = documentedKeys.every((k) => itemKeys.includes(k));

      assert(
        rDetail.status === 200 && noPasswordHash && noDeletedAt && keysMatch,
        'T19: Response hygiene (no passwords, hashes, tokens, or deleted_at; list items match documented keys)',
        `noPasswordHash=${noPasswordHash}, noDeletedAt=${noDeletedAt}, keysMatch=${keysMatch}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T20: DB Errors Mapping
    // ─────────────────────────────────────────────────────────────────────────
    {
      // 1. Syntactically valid but non-existent uuid for companyId -> 400
      const randomUuid = '00000000-0000-0000-0000-000000000000';
      const rNonExistentComp = await api(
        'POST',
        '/leads',
        {
          leadName: 'TL-NonExistentComp',
          email: 'tl-nonexist@licrm.test',
          productId: 1,
          sourceId: 1,
          companyId: randomUuid,
        },
        adminTok,
      );

      // 2. Invalid UUID in query parameter
      const rInvalidUuidQuery = await api('GET', '/leads?assignedTo=not-a-uuid', undefined, adminTok);

      assert(
        rNonExistentComp.status === 400 &&
          rNonExistentComp.data?.error?.code === 'VALIDATION_ERROR' &&
          rInvalidUuidQuery.status === 400 &&
          rInvalidUuidQuery.data?.error?.code === 'VALIDATION_ERROR',
        'T20: DB errors mapping (non-existent companyId -> 400 VALIDATION_ERROR; invalid UUID query param -> 400 VALIDATION_ERROR, no 500 or SQL leak)',
        `nonExistComp=${rNonExistentComp.status} (${rNonExistentComp.data?.error?.code}), invalidQuery=${rInvalidUuidQuery.status} (${rInvalidUuidQuery.data?.error?.code})`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // T21: Index Verification
    // ─────────────────────────────────────────────────────────────────────────
    {
      // 1. Query pg_indexes for idx_leads_mobile_last10
      const idxRes = await query(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'leads' AND indexname = 'idx_leads_mobile_last10'`,
      );
      const indexExists = idxRes.rowCount === 1;

      // 2. Run EXPLAIN on the indexed expression with enable_seqscan=off
      await query('SET enable_seqscan = OFF');
      const explainRes = await query(
        `EXPLAIN SELECT id FROM leads WHERE RIGHT(REGEXP_REPLACE(mobile, '[^0-9]', '', 'g'), 10) = '9876500001' AND deleted_at IS NULL AND mobile IS NOT NULL`,
      );
      await query('SET enable_seqscan = ON');

      const explainText = explainRes.rows.map((r: any) => r['QUERY PLAN']).join('\n');
      const usesIndex = explainText.includes('idx_leads_mobile_last10');

      assert(
        indexExists && usesIndex,
        'T21: Index verification (idx_leads_mobile_last10 exists in pg_indexes and EXPLAIN with enable_seqscan=off uses it)',
        `indexExists=${indexExists}, usesIndex=${usesIndex}`,
      );
    }

  } finally {
    // ── CLEANUP ──
    await cleanup();
    await stopServer();
    await pool.end();
  }

  console.log('\n----------------------------------------------------------------');
  console.log(` SUMMARY: ${passed} passed, ${failed} failed out of ${passed + failed} test suites.`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
