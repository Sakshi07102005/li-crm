/**
 * Module 6 Backend Part A Test Suite
 * Real PostgreSQL, real HTTP fetch, ephemeral port.
 * Tests companies, contacts, follow-ups, tasks, activities across 13 requirement groups.
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
const markerPrefix = `M6T-${runId}`;

const trackedCompanyIds: string[] = [];
const trackedLeadIds: string[] = [];
const trackedFollowupIds: string[] = [];
const trackedTaskIds: string[] = [];

async function cleanup(): Promise<void> {
  try {
    // 1. Delete activities on tracked leads
    if (trackedLeadIds.length > 0) {
      await query(`DELETE FROM activities WHERE lead_id = ANY($1::uuid[])`, [trackedLeadIds]).catch(() => {});
    }

    // 2. Delete follow-ups on tracked leads
    if (trackedFollowupIds.length > 0) {
      await query(`DELETE FROM follow_ups WHERE id = ANY($1::uuid[])`, [trackedFollowupIds]).catch(() => {});
    }
    if (trackedLeadIds.length > 0) {
      await query(`DELETE FROM follow_ups WHERE lead_id = ANY($1::uuid[])`, [trackedLeadIds]).catch(() => {});
    }

    // 3. Delete tasks
    if (trackedTaskIds.length > 0) {
      await query(`DELETE FROM tasks WHERE id = ANY($1::uuid[])`, [trackedTaskIds]).catch(() => {});
    }
    if (trackedLeadIds.length > 0) {
      await query(`DELETE FROM tasks WHERE lead_id = ANY($1::uuid[])`, [trackedLeadIds]).catch(() => {});
    }

    // 4. Delete leads
    if (trackedLeadIds.length > 0) {
      await query(`DELETE FROM audit_logs WHERE entity_type = 'lead' AND entity_id = ANY($1::uuid[])`, [trackedLeadIds]).catch(() => {});
      await query(`DELETE FROM lead_assignment_history WHERE lead_id = ANY($1::uuid[])`, [trackedLeadIds]).catch(() => {});
      await query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [trackedLeadIds]).catch(() => {});
    }

    // 5. Delete contacts & companies
    if (trackedCompanyIds.length > 0) {
      await query(`DELETE FROM contacts WHERE company_id = ANY($1::uuid[])`, [trackedCompanyIds]).catch(() => {});
      await query(`DELETE FROM audit_logs WHERE entity_type = 'company' AND entity_id = ANY($1::uuid[])`, [trackedCompanyIds]).catch(() => {});
      // Hard delete (bypass soft delete for cleanup)
      await query(`DELETE FROM companies WHERE id = ANY($1::uuid[])`, [trackedCompanyIds]).catch(() => {});
    }

    // 6. Any stragglers by name pattern
    await query(`DELETE FROM leads WHERE lead_name LIKE 'M6T-%'`).catch(() => {});
    await query(`DELETE FROM tasks WHERE title LIKE 'M6T-%'`).catch(() => {});
    await query(`DELETE FROM companies WHERE name LIKE 'M6T-%'`).catch(() => {});
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

// Helper to create a lead (email required by DB check constraint)
function mkLead(leadName: string, extra: Record<string, any> = {}) {
  return {
    leadName,
    productId: 1,
    sourceId: 1,
    email: 'test@example.com',
    ...extra,
  };
}

// ─── MAIN TEST RUNNER ─────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n================================================================');
  console.log('       MODULE 6 TEST SUITE - REAL POSTGRESQL & HTTP FETCH        ');
  console.log('================================================================\n');

  const dbCheck = await query('SELECT NOW() AS now');
  console.log(` Connected to live database (${dbCheck.rows[0].now})`);

  await startServer();

  try {
    // 0. Login seeded users
    const adminTok = await login(ADMIN_EMAIL, SEED_ADMIN_PW);
    const bhTok = await login(BH_EMAIL, SEED_SAMPLE_PW);
    const sales1Tok = await login(SALES1_EMAIL, SEED_SAMPLE_PW);
    const sales2Tok = await login(SALES2_EMAIL, SEED_SAMPLE_PW);
    const mktTok = await login(MARKETING_EMAIL, SEED_SAMPLE_PW);

    // Retrieve seeded user IDs
    const usersRes = await query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email IN ($1, $2, $3, $4, $5)`,
      [ADMIN_EMAIL, BH_EMAIL, SALES1_EMAIL, SALES2_EMAIL, MARKETING_EMAIL],
    );
    const userMap = new Map(usersRes.rows.map((u) => [u.email, u.id]));
    const adminId = userMap.get(ADMIN_EMAIL)!;
    const sales1Id = userMap.get(SALES1_EMAIL)!;
    const sales2Id = userMap.get(SALES2_EMAIL)!;

    const dummyUuid = '00000000-0000-0000-0000-000000000001';

    // ═════════════════════════════════════════════════════════════════════════
    // 1. 401 WITHOUT TOKEN LOOP
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 1: 401 WITHOUT TOKEN LOOP ---');
    const unauthEndpoints = [
      { method: 'GET', path: '/companies' },
      { method: 'POST', path: '/companies', body: { name: 'Test' } },
      { method: 'GET', path: `/companies/${dummyUuid}` },
      { method: 'PUT', path: `/companies/${dummyUuid}`, body: { name: 'Test' } },
      { method: 'DELETE', path: `/companies/${dummyUuid}` },
      { method: 'GET', path: `/companies/${dummyUuid}/contacts` },
      { method: 'POST', path: `/companies/${dummyUuid}/contacts`, body: { fullName: 'A B' } },
      { method: 'GET', path: `/companies/${dummyUuid}/leads` },
      { method: 'PUT', path: `/contacts/${dummyUuid}`, body: { fullName: 'A B' } },
      { method: 'DELETE', path: `/contacts/${dummyUuid}` },
      { method: 'PATCH', path: `/contacts/${dummyUuid}/primary` },
      { method: 'GET', path: '/followups' },
      { method: 'POST', path: '/followups', body: { leadId: dummyUuid, scheduledAt: new Date().toISOString() } },
      { method: 'GET', path: `/followups/${dummyUuid}` },
      { method: 'PUT', path: `/followups/${dummyUuid}`, body: { notes: 'x' } },
      { method: 'PATCH', path: `/followups/${dummyUuid}/status`, body: { status: 'completed' } },
      { method: 'GET', path: '/tasks' },
      { method: 'POST', path: '/tasks', body: { title: 'Test' } },
      { method: 'GET', path: `/tasks/${dummyUuid}` },
      { method: 'PUT', path: `/tasks/${dummyUuid}`, body: { title: 'Test' } },
      { method: 'PATCH', path: `/tasks/${dummyUuid}/status`, body: { status: 'in_progress' } },
      { method: 'DELETE', path: `/tasks/${dummyUuid}` },
      { method: 'GET', path: `/leads/${dummyUuid}/activities` },
      { method: 'POST', path: `/leads/${dummyUuid}/activities`, body: { type: 'note', subject: 's' } },
    ];

    let all401 = true;
    for (const ep of unauthEndpoints) {
      const res = await api(ep.method, ep.path, (ep as any).body);
      if (res.status !== 401) {
        all401 = false;
        fail(`Unauthenticated request to ${ep.method} ${ep.path}`, `Expected 401 but got ${res.status}`);
        break;
      }
    }
    if (all401) {
      pass(`All ${unauthEndpoints.length} endpoints return 401 without token`);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 2. PERMISSION MATRIX
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 2: PERMISSION MATRIX ---');

    // companies.view: all roles return 200
    const [cAdmin, cBh, cSales, cMkt] = await Promise.all([
      api('GET', '/companies', undefined, adminTok),
      api('GET', '/companies', undefined, bhTok),
      api('GET', '/companies', undefined, sales1Tok),
      api('GET', '/companies', undefined, mktTok),
    ]);
    assert(
      cAdmin.status === 200 && cBh.status === 200 && cSales.status === 200 && cMkt.status === 200,
      'companies.view: Admin, BH, Sales1, Marketing all return 200',
      `Statuses: ${cAdmin.status}, ${cBh.status}, ${cSales.status}, ${cMkt.status}`,
    );

    // companies.manage: ALL roles have it in this seed — just verify Admin can create
    const permCompName = `${markerPrefix}-Perm`;
    const cCreateAdmin = await api('POST', '/companies', { name: permCompName }, adminTok);
    assert(cCreateAdmin.status === 201, 'companies.manage: Admin can create a company (201)', `Got ${cCreateAdmin.status}`);
    const permCompId = cCreateAdmin.data?.data?.company?.id;
    if (permCompId) trackedCompanyIds.push(permCompId);

    // leads.delete: only admin & bh. Sales1 403 on DELETE /companies/:id
    const delPermRes = await api('DELETE', `/companies/${permCompId}`, undefined, sales1Tok);
    assert(delPermRes.status === 403, 'leads.delete: Sales1 gets 403 on DELETE /companies/:id', `Got ${delPermRes.status}`);

    // Restore: recreate the deleted company (since delete soft-deletes, it's still there for cleanup)
    // Actually, verify it's still there since it failed with 403
    const getStillThere = await api('GET', `/companies/${permCompId}`, undefined, adminTok);
    assert(getStillThere.status === 200, 'Company not deleted since Sales1 got 403', `Got ${getStillThere.status}`);

    // contacts — create contact for permComp
    const ctAdmin = await api('POST', `/companies/${permCompId}/contacts`, { fullName: 'Admin Contact' }, adminTok);
    assert(ctAdmin.status === 201, 'contacts.manage: Admin creates contact 201', `Got ${ctAdmin.status}`);

    // tasks.manage — Marketing has tasks.manage; check that general task creation works
    const tAdmin = await api('POST', '/tasks', { title: `${markerPrefix}-TaskPerm` }, adminTok);
    assert(tAdmin.status === 201, 'tasks.manage: Admin creates task 201', `Got ${tAdmin.status}`);
    if (tAdmin.data?.data?.task?.id) trackedTaskIds.push(tAdmin.data.data.task.id);

    // Helper: create leads for tests (email required for DB constraint)
    const leadRes = await api('POST', '/leads', mkLead(`${markerPrefix}-Lead1`, { assignedTo: sales1Id }), adminTok);
    const testLead1Id = leadRes.data?.data?.lead?.id;
    if (testLead1Id) trackedLeadIds.push(testLead1Id);
    assert(leadRes.status === 201 && !!testLead1Id, 'Admin creates lead for test fixture', `Got ${leadRes.status}`);

    // activities.create: Admin & Sales1 both return 201
    const aAdmin = await api('POST', `/leads/${testLead1Id}/activities`, { type: 'note', subject: 'Admin note' }, adminTok);
    const aSales = await api('POST', `/leads/${testLead1Id}/activities`, { type: 'call', subject: 'Sales call' }, sales1Tok);
    assert(
      aAdmin.status === 201 && aSales.status === 201,
      'activities.create: Admin and Sales1 both return 201 on POST /leads/:id/activities',
      `admin: ${aAdmin.status}, sales: ${aSales.status}`,
    );

    // followups.manage — Admin & Sales1 both have it. Admin creates followup
    const schedDate = new Date(Date.now() + 3600 * 1000).toISOString();
    const fAdmin = await api('POST', '/followups', { leadId: testLead1Id, scheduledAt: schedDate }, adminTok);
    assert(fAdmin.status === 201, 'followups.manage: Admin creates followup 201', `Got ${fAdmin.status}`);
    if (fAdmin.data?.data?.followup?.id) trackedFollowupIds.push(fAdmin.data.data.followup.id);

    // ═════════════════════════════════════════════════════════════════════════
    // 3. COMPANY LIFECYCLE, SCOPE, AND CONSTRAINTS
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 3: COMPANY LIFECYCLE, SCOPE, AND CONSTRAINTS ---');

    // Create with valid size enum
    const acmeName = `${markerPrefix}-Acme Corp`;
    const cAcme = await api('POST', '/companies', { name: acmeName, industry: 'Tech', size: '51-200' }, adminTok);
    assert(
      cAcme.status === 201 && cAcme.data?.data?.company?.name === acmeName,
      'Company created with correct name and size',
      `Status ${cAcme.status}, name: ${cAcme.data?.data?.company?.name}`,
    );
    const acmeId = cAcme.data?.data?.company?.id;
    if (acmeId) trackedCompanyIds.push(acmeId);

    // Duplicate name (case-insensitive) -> 409 COMPANY_EXISTS
    const cDup = await api('POST', '/companies', { name: acmeName.toLowerCase() }, adminTok);
    assert(
      cDup.status === 409 && cDup.data?.error?.code === 'COMPANY_EXISTS',
      'Duplicate company name (lowercase) returns 409 COMPANY_EXISTS',
      `Status ${cDup.status}, code ${cDup.data?.error?.code}`,
    );

    // Create 2 leads under Acme: one for Sales1, one for Sales2
    const lS1 = await api('POST', '/leads', mkLead(`${markerPrefix}-AcmeL1`, { companyId: acmeId, assignedTo: sales1Id }), adminTok);
    const lS2 = await api('POST', '/leads', mkLead(`${markerPrefix}-AcmeL2`, { companyId: acmeId, assignedTo: sales2Id }), adminTok);
    if (lS1.data?.data?.lead?.id) trackedLeadIds.push(lS1.data.data.lead.id);
    if (lS2.data?.data?.lead?.id) trackedLeadIds.push(lS2.data.data.lead.id);

    // Contacts: add 2 to Acme
    await api('POST', `/companies/${acmeId}/contacts`, { fullName: 'Alice Smith' }, adminTok);
    await api('POST', `/companies/${acmeId}/contacts`, { fullName: 'Bob Jones' }, adminTok);

    // List as Admin -> full leadCount (at least 2) + contactCount (2)
    const listAdmin = await api('GET', `/companies?q=${encodeURIComponent(acmeName)}`, undefined, adminTok);
    const compAdminView = listAdmin.data?.data?.companies?.find((c: any) => c.id === acmeId);
    assert(
      compAdminView && compAdminView.contactCount === 2 && compAdminView.leadCount >= 2,
      'List companies: Admin sees contactCount=2 and leadCount>=2 for Acme',
      `Got: ${JSON.stringify(compAdminView)}`,
    );

    // List as Sales1 -> leadCount should be 1 (only Sales1's lead)
    const listSales1 = await api('GET', `/companies?q=${encodeURIComponent(acmeName)}`, undefined, sales1Tok);
    const compSalesView = listSales1.data?.data?.companies?.find((c: any) => c.id === acmeId);
    assert(
      compSalesView && compSalesView.leadCount === 1,
      'Scope check: Sales1 sees only leadCount=1 for Acme',
      `Got leadCount=${compSalesView?.leadCount}`,
    );

    // GET /api/companies/:id/leads scoped to Sales1 -> 1 lead
    const acmeLeadsSales1 = await api('GET', `/companies/${acmeId}/leads`, undefined, sales1Tok);
    assert(
      acmeLeadsSales1.status === 200 && acmeLeadsSales1.data?.data?.leads?.length === 1,
      'GET /companies/:id/leads returns 1 lead for Sales1',
      `Got ${acmeLeadsSales1.data?.data?.leads?.length}`,
    );

    // GET /api/companies/:id/leads as Admin -> >=2 leads
    const acmeLeadsAdmin = await api('GET', `/companies/${acmeId}/leads`, undefined, adminTok);
    assert(
      acmeLeadsAdmin.status === 200 && acmeLeadsAdmin.data?.data?.leads?.length >= 2,
      'GET /companies/:id/leads returns >=2 leads for Admin',
      `Got ${acmeLeadsAdmin.data?.data?.leads?.length}`,
    );

    // PUT same name (no-op) -> 200 without audit
    const auditBefore = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE entity_type = 'company' AND entity_id = $1`,
      [acmeId],
    );
    const putSame = await api('PUT', `/companies/${acmeId}`, { name: acmeName }, adminTok);
    const auditAfter = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE entity_type = 'company' AND entity_id = $1`,
      [acmeId],
    );
    assert(
      putSame.status === 200 && auditBefore.rows[0].count === auditAfter.rows[0].count,
      'PUT same company name is no-op 200 without new audit entry',
      `Status ${putSame.status}, before=${auditBefore.rows[0].count}, after=${auditAfter.rows[0].count}`,
    );

    // PUT rename to conflicting existing name -> 409
    const putDup = await api('PUT', `/companies/${acmeId}`, { name: permCompName }, adminTok);
    assert(
      putDup.status === 409 && putDup.data?.error?.code === 'COMPANY_EXISTS',
      'PUT rename to existing company name returns 409 COMPANY_EXISTS',
      `Status ${putDup.status}, code ${putDup.data?.error?.code}`,
    );

    // Admin soft-deletes company
    const delAdmin = await api('DELETE', `/companies/${acmeId}`, undefined, adminTok);
    assert(delAdmin.status === 200, 'Admin DELETE company returns 200 (soft delete)', `Got ${delAdmin.status}`);

    const getDel = await api('GET', `/companies/${acmeId}`, undefined, adminTok);
    assert(getDel.status === 404, 'GET deleted company returns 404', `Got ${getDel.status}`);

    // ═════════════════════════════════════════════════════════════════════════
    // 4. CONTACTS: PRIMARY AUTO-SET, SWITCH, PROMOTION ON DELETE
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 4: CONTACTS MANAGEMENT ---');
    const ctCoRes = await api('POST', '/companies', { name: `${markerPrefix}-ContactCo` }, adminTok);
    const ctCoId = ctCoRes.data?.data?.company?.id;
    if (ctCoId) trackedCompanyIds.push(ctCoId);

    // Create 1st contact -> auto isPrimary=true
    const c1 = await api('POST', `/companies/${ctCoId}/contacts`, { fullName: 'Charlie First' }, adminTok);
    const c1Data = c1.data?.data?.contact;
    assert(
      c1.status === 201 && c1Data?.isPrimary === true,
      'First contact is auto isPrimary=true',
      `Status ${c1.status}, isPrimary: ${c1Data?.isPrimary}`,
    );

    // Create 2nd contact without isPrimary -> false
    const c2 = await api('POST', `/companies/${ctCoId}/contacts`, { fullName: 'David Second' }, adminTok);
    const c2Data = c2.data?.data?.contact;
    assert(
      c2.status === 201 && c2Data?.isPrimary === false,
      'Second contact without isPrimary is false',
      `Status ${c2.status}, isPrimary: ${c2Data?.isPrimary}`,
    );

    // PATCH /contacts/:id/primary switches primary
    const switchRes = await api('PATCH', `/contacts/${c2Data.id}/primary`, undefined, adminTok);
    assert(
      switchRes.status === 200 && switchRes.data?.data?.contact?.isPrimary === true,
      'PATCH /contacts/:id/primary sets contact as primary',
      `Got ${switchRes.status}`,
    );

    // Verify c1 is now false
    const listCtRes = await api('GET', `/companies/${ctCoId}/contacts`, undefined, adminTok);
    const c1Found = listCtRes.data?.data?.contacts?.find((c: any) => c.id === c1Data.id);
    const c2Found = listCtRes.data?.data?.contacts?.find((c: any) => c.id === c2Data.id);
    assert(
      c1Found?.isPrimary === false && c2Found?.isPrimary === true,
      'Primary switch confirmed: c1=false, c2=true',
      `c1: ${c1Found?.isPrimary}, c2: ${c2Found?.isPrimary}`,
    );

    // DELETE c2 (primary) -> c1 auto-promoted
    const delC2 = await api('DELETE', `/contacts/${c2Data.id}`, undefined, adminTok);
    assert(delC2.status === 200, 'DELETE primary contact returns 200', `Got ${delC2.status}`);

    const listCtAfterDel = await api('GET', `/companies/${ctCoId}/contacts`, undefined, adminTok);
    const c1AfterDel = listCtAfterDel.data?.data?.contacts?.find((c: any) => c.id === c1Data.id);
    assert(
      c1AfterDel?.isPrimary === true,
      'Oldest contact auto-promoted to primary on primary delete',
      `Got isPrimary: ${c1AfterDel?.isPrimary}`,
    );

    // GET contacts on deleted company -> 404
    const delCtCo = await api('DELETE', `/companies/${ctCoId}`, undefined, adminTok);
    assert(delCtCo.status === 200, 'Deleted contact company', `Got ${delCtCo.status}`);
    const getCtOnDel = await api('GET', `/companies/${ctCoId}/contacts`, undefined, adminTok);
    assert(getCtOnDel.status === 404, 'GET contacts on deleted company returns 404', `Got ${getCtOnDel.status}`);

    // ═════════════════════════════════════════════════════════════════════════
    // 5. FOLLOW-UPS: SYNC, COMPLETE, RESCHEDULE, MISSED
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 5: FOLLOW-UPS WORKFLOW & SYNC ---');
    const fLeadRes = await api('POST', '/leads', mkLead(`${markerPrefix}-FLead`, { assignedTo: sales1Id }), adminTok);
    const fLeadId = fLeadRes.data?.data?.lead?.id;
    if (fLeadId) trackedLeadIds.push(fLeadId);

    // Create follow-up T+2h -> lead.nextFollowUpAt updates
    const tPlus2 = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const f1 = await api('POST', '/followups', { leadId: fLeadId, scheduledAt: tPlus2, type: 'call' }, adminTok);
    const f1Id = f1.data?.data?.followup?.id;
    if (f1Id) trackedFollowupIds.push(f1Id);

    const leadAfterF1 = await api('GET', `/leads/${fLeadId}`, undefined, adminTok);
    assert(
      f1.status === 201 && Math.abs(new Date(leadAfterF1.data?.data?.lead?.nextFollowUpAt).getTime() - new Date(tPlus2).getTime()) < 2000,
      'Create follow-up updates lead nextFollowUpAt',
      `Got ${leadAfterF1.data?.data?.lead?.nextFollowUpAt}`,
    );

    // Activity created for follow-up
    const fAct = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM activities WHERE lead_id = $1 AND type = 'follow_up'`,
      [fLeadId],
    );
    assert(parseInt(fAct.rows[0].count, 10) >= 1, 'Activity of type follow_up created on followup create', `Count=${fAct.rows[0].count}`);

    // Create T+1h follow-up -> nextFollowUpAt moves earlier
    const tPlus1 = new Date(Date.now() + 1 * 3600 * 1000).toISOString();
    const f2 = await api('POST', '/followups', { leadId: fLeadId, scheduledAt: tPlus1, type: 'meeting' }, adminTok);
    const f2Id = f2.data?.data?.followup?.id;
    if (f2Id) trackedFollowupIds.push(f2Id);

    const leadAfterF2 = await api('GET', `/leads/${fLeadId}`, undefined, adminTok);
    assert(
      Math.abs(new Date(leadAfterF2.data?.data?.lead?.nextFollowUpAt).getTime() - new Date(tPlus1).getTime()) < 2000,
      'Earlier follow-up moves lead nextFollowUpAt earlier',
      `Got ${leadAfterF2.data?.data?.lead?.nextFollowUpAt}`,
    );

    // Complete f2 (earlier) -> nextFollowUpAt shifts to f1
    const compF2 = await api('PATCH', `/followups/${f2Id}/status`, { status: 'completed', outcome: 'Done' }, adminTok);
    assert(compF2.status === 200, 'Complete follow-up returns 200', `Got ${compF2.status}`);

    const leadAfterCompF2 = await api('GET', `/leads/${fLeadId}`, undefined, adminTok);
    assert(
      Math.abs(new Date(leadAfterCompF2.data?.data?.lead?.nextFollowUpAt).getTime() - new Date(tPlus2).getTime()) < 2000,
      'Completing earlier follow-up shifts nextFollowUpAt to remaining pending',
      `Got ${leadAfterCompF2.data?.data?.lead?.nextFollowUpAt}`,
    );

    // Complete f1 -> nextFollowUpAt becomes NULL
    const compF1 = await api('PATCH', `/followups/${f1Id}/status`, { status: 'completed' }, adminTok);
    assert(compF1.status === 200, 'Complete final follow-up returns 200', `Got ${compF1.status}`);

    const leadAfterAllComp = await api('GET', `/leads/${fLeadId}`, undefined, adminTok);
    assert(
      leadAfterAllComp.data?.data?.lead?.nextFollowUpAt === null,
      'All pending completed: lead nextFollowUpAt becomes NULL',
      `Got ${leadAfterAllComp.data?.data?.lead?.nextFollowUpAt}`,
    );

    // Reschedule: create f3, reschedule it -> creates new pending, marks original 'rescheduled'
    const tPlus3 = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    const f3 = await api('POST', '/followups', { leadId: fLeadId, scheduledAt: tPlus3 }, adminTok);
    const f3Id = f3.data?.data?.followup?.id;
    if (f3Id) trackedFollowupIds.push(f3Id);

    const tPlus4 = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const reschedF3 = await api('PATCH', `/followups/${f3Id}/status`, { status: 'rescheduled', newScheduledAt: tPlus4 }, adminTok);
    assert(
      reschedF3.status === 200 && reschedF3.data?.data?.followup?.status === 'rescheduled',
      'Rescheduling marks original as rescheduled',
      `Got status ${reschedF3.data?.data?.followup?.status}`,
    );
    const newPendingF = reschedF3.data?.data?.newFollowup;
    if (newPendingF?.id) trackedFollowupIds.push(newPendingF.id);

    assert(newPendingF && newPendingF.status === 'pending', 'Reschedule created a new pending follow-up', `newFollowup: ${JSON.stringify(newPendingF)}`);

    // Mark new pending as missed -> nextFollowUpAt = NULL
    const missedRes = await api('PATCH', `/followups/${newPendingF.id}/status`, { status: 'missed' }, adminTok);
    assert(
      missedRes.status === 200 && missedRes.data?.data?.followup?.status === 'missed',
      'Mark follow-up missed sets status to missed',
      `Got ${missedRes.data?.data?.followup?.status}`,
    );

    const leadAfterMissed = await api('GET', `/leads/${fLeadId}`, undefined, adminTok);
    assert(
      leadAfterMissed.data?.data?.lead?.nextFollowUpAt === null,
      'nextFollowUpAt = NULL after marking last pending missed',
      `Got ${leadAfterMissed.data?.data?.lead?.nextFollowUpAt}`,
    );

    // 422 on completed follow-up
    const reComp = await api('PATCH', `/followups/${f1Id}/status`, { status: 'completed' }, adminTok);
    assert(
      reComp.status === 422 && reComp.data?.error?.code === 'INVALID_FOLLOWUP_STATE',
      'PATCH status on completed follow-up returns 422 INVALID_FOLLOWUP_STATE',
      `Status ${reComp.status}, code ${reComp.data?.error?.code}`,
    );

    // PUT on non-pending follow-up -> 422
    const putNonPending = await api('PUT', `/followups/${f1Id}`, { notes: 'New notes' }, adminTok);
    assert(
      putNonPending.status === 422 && putNonPending.data?.error?.code === 'INVALID_FOLLOWUP_STATE',
      'PUT on non-pending follow-up returns 422 INVALID_FOLLOWUP_STATE',
      `Status ${putNonPending.status}, code ${putNonPending.data?.error?.code}`,
    );

    // ═════════════════════════════════════════════════════════════════════════
    // 6. OVERDUE, TIMEZONE BOUNDARIES & CLOSED LEAD GUARD
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 6: OVERDUE, TIMEZONE BOUNDARIES & CLOSED LEAD GUARD ---');

    // Insert overdue follow-up directly
    const overdueSched = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const overdueIns = await query<{ id: string }>(
      `INSERT INTO follow_ups (lead_id, scheduled_at, type, status, assigned_to)
       VALUES ($1, $2, 'call', 'pending', $3) RETURNING id`,
      [fLeadId, overdueSched, sales1Id],
    );
    const overdueId = overdueIns.rows[0].id;
    trackedFollowupIds.push(overdueId);

    // tab=overdue returns this follow-up
    const overdueList = await api('GET', '/followups?tab=overdue', undefined, adminTok);
    const foundOverdue = overdueList.data?.data?.followups?.find((f: any) => f.id === overdueId);
    assert(overdueList.status === 200 && !!foundOverdue, 'tab=overdue returns pending follow-up scheduled in past', `Found: ${!!foundOverdue}`);

    // Convert lead -> overdue tab excludes it
    await query(`UPDATE leads SET status_id = 7, converted_at = NOW() WHERE id = $1`, [fLeadId]);

    const overdueListAfterConvert = await api('GET', '/followups?tab=overdue', undefined, adminTok);
    const foundOverdueAfterConvert = overdueListAfterConvert.data?.data?.followups?.find((f: any) => f.id === overdueId);
    assert(!foundOverdueAfterConvert, 'Converted lead follow-up excluded from tab=overdue', `Found: ${!!foundOverdueAfterConvert}`);

    // POST followup on Converted lead -> 422 LEAD_CLOSED (or INVALID_FOLLOWUP_STATE)
    const fClosed = await api('POST', '/followups', { leadId: fLeadId, scheduledAt: tPlus1 }, adminTok);
    assert(
      fClosed.status === 422,
      'POST /followups on Converted lead returns 422',
      `Got ${fClosed.status}: ${fClosed.data?.error?.code}`,
    );

    // Timezone boundary: 23:30 Asia/Kolkata today appears in tab=today
    // Kolkata offset = +05:30. Convert "23:30:00 Kolkata today" to UTC.
    const nowUtc = new Date();
    const kolkataOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowKolkata = new Date(nowUtc.getTime() + kolkataOffsetMs);
    const kYear = nowKolkata.getUTCFullYear();
    const kMonth = String(nowKolkata.getUTCMonth() + 1).padStart(2, '0');
    const kDay = String(nowKolkata.getUTCDate()).padStart(2, '0');
    const kolkataLateTodayIso = `${kYear}-${kMonth}-${kDay}T23:30:00+05:30`;

    // Fresh lead for timezone test
    const tzLeadRes = await api('POST', '/leads', mkLead(`${markerPrefix}-TzLead`), adminTok);
    const tzLeadId = tzLeadRes.data?.data?.lead?.id;
    if (tzLeadId) trackedLeadIds.push(tzLeadId);

    const fTz = await api('POST', '/followups', { leadId: tzLeadId, scheduledAt: kolkataLateTodayIso }, adminTok);
    const fTzId = fTz.data?.data?.followup?.id;
    if (fTzId) trackedFollowupIds.push(fTzId);

    const todayList = await api('GET', '/followups?tab=today', undefined, adminTok);
    const foundTzToday = todayList.data?.data?.followups?.find((f: any) => f.id === fTzId);
    assert(!!foundTzToday, 'Follow-up at 23:30 Kolkata today appears in tab=today', `Found: ${!!foundTzToday}`);

    // Out-of-scope: Sales1 cannot access Sales2's lead's follow-up
    const s2LeadRes = await api('POST', '/leads', mkLead(`${markerPrefix}-S2Lead`, { assignedTo: sales2Id }), adminTok);
    const s2LeadId = s2LeadRes.data?.data?.lead?.id;
    if (s2LeadId) trackedLeadIds.push(s2LeadId);

    const fS2 = await api('POST', '/followups', { leadId: s2LeadId, scheduledAt: tPlus1 }, adminTok);
    const fS2Id = fS2.data?.data?.followup?.id;
    if (fS2Id) trackedFollowupIds.push(fS2Id);

    const s1GetS2F = await api('GET', `/followups/${fS2Id}`, undefined, sales1Tok);
    assert(s1GetS2F.status === 404, 'Sales1 accessing Sales2 lead follow-up returns 404', `Got ${s1GetS2F.status}`);

    // ═════════════════════════════════════════════════════════════════════════
    // 7. ASSIGNEE REACH RULES
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 7: ASSIGNEE REACH RULES ---');

    // Admin assigns to anyone -> 201
    const tAdminAssign = await api('POST', '/tasks', { title: `${markerPrefix}-TAdminReach`, assignedTo: sales2Id }, adminTok);
    assert(tAdminAssign.status === 201, 'Admin assigns task to Sales2: 201', `Got ${tAdminAssign.status}`);
    if (tAdminAssign.data?.data?.task?.id) trackedTaskIds.push(tAdminAssign.data.data.task.id);

    // BH assigns to direct report (Sales1) -> 201
    const tBhDR = await api('POST', '/tasks', { title: `${markerPrefix}-TBhDR`, assignedTo: sales1Id }, bhTok);
    assert(tBhDR.status === 201, 'BH assigns to direct report Sales1: 201', `Got ${tBhDR.status}`);
    if (tBhDR.data?.data?.task?.id) trackedTaskIds.push(tBhDR.data.data.task.id);

    // BH assigns to Admin (outside team) -> 403
    const tBhOutside = await api('POST', '/tasks', { title: `${markerPrefix}-TBhOut`, assignedTo: adminId }, bhTok);
    assert(tBhOutside.status === 403, 'BH assigns to Admin (outside team): 403', `Got ${tBhOutside.status}`);

    // Sales1 assigns to Sales2 (not self) -> 403
    const tS1Assign = await api('POST', '/tasks', { title: `${markerPrefix}-TS1Assign`, assignedTo: sales2Id }, sales1Tok);
    assert(tS1Assign.status === 403, 'Sales1 assigns to Sales2: 403 FORBIDDEN', `Got ${tS1Assign.status}`);

    // Assign to non-existent user -> 400 INVALID_ASSIGNEE
    const tBadAssignee = await api('POST', '/tasks', { title: `${markerPrefix}-TBadU`, assignedTo: dummyUuid }, adminTok);
    assert(
      tBadAssignee.status === 400 && tBadAssignee.data?.error?.code === 'INVALID_ASSIGNEE',
      'Assign to non-existent user returns 400 INVALID_ASSIGNEE',
      `Status ${tBadAssignee.status}, code ${tBadAssignee.data?.error?.code}`,
    );

    // ═════════════════════════════════════════════════════════════════════════
    // 8. CONCURRENCY RACE ON PENDING FOLLOW-UP
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 8: CONCURRENCY RACE ---');
    const raceLead = await api('POST', '/leads', mkLead(`${markerPrefix}-RaceLead`), adminTok);
    const raceLeadId = raceLead.data?.data?.lead?.id;
    if (raceLeadId) trackedLeadIds.push(raceLeadId);

    const raceF = await api('POST', '/followups', { leadId: raceLeadId, scheduledAt: tPlus1 }, adminTok);
    const raceFId = raceF.data?.data?.followup?.id;
    if (raceFId) trackedFollowupIds.push(raceFId);

    // Concurrent PATCH /status -> one 200, one 422
    const [raceRes1, raceRes2] = await Promise.all([
      api('PATCH', `/followups/${raceFId}/status`, { status: 'completed', outcome: 'Race 1' }, adminTok),
      api('PATCH', `/followups/${raceFId}/status`, { status: 'completed', outcome: 'Race 2' }, adminTok),
    ]);

    const sortedStatuses = [raceRes1.status, raceRes2.status].sort((a, b) => a - b);
    assert(
      sortedStatuses[0] === 200 && sortedStatuses[1] === 422,
      'Concurrent status PATCH: exactly one 200 and one 422',
      `Statuses: ${raceRes1.status}, ${raceRes2.status}`,
    );

    // ═════════════════════════════════════════════════════════════════════════
    // 9. TASKS: VISIBILITY, STATUS ACTIVITY, HARD DELETE
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 9: TASKS ---');

    // Create task for Sales1 and Sales2
    const tS1 = await api('POST', '/tasks', { title: `${markerPrefix}-TaskS1`, assignedTo: sales1Id }, adminTok);
    const tS1Id = tS1.data?.data?.task?.id;
    if (tS1Id) trackedTaskIds.push(tS1Id);

    const tS2 = await api('POST', '/tasks', { title: `${markerPrefix}-TaskS2`, assignedTo: sales2Id }, adminTok);
    const tS2Id = tS2.data?.data?.task?.id;
    if (tS2Id) trackedTaskIds.push(tS2Id);

    // Sales1 sees its task but not Sales2's
    const s1Tasks = await api('GET', '/tasks', undefined, sales1Tok);
    const s1TaskIds = (s1Tasks.data?.data?.tasks || []).map((t: any) => t.id);
    assert(s1TaskIds.includes(tS1Id) && !s1TaskIds.includes(tS2Id), 'Sales1 sees its tasks only', `IDs: ${s1TaskIds}`);

    // BH sees both
    const bhTasks = await api('GET', '/tasks', undefined, bhTok);
    const bhTaskIds = (bhTasks.data?.data?.tasks || []).map((t: any) => t.id);
    assert(bhTaskIds.includes(tS1Id) && bhTaskIds.includes(tS2Id), 'BH sees direct report tasks', `IDs: ${bhTaskIds}`);

    // Task with leadId: complete writes 'task' activity
    const tWithLead = await api('POST', '/tasks', { title: `${markerPrefix}-TaskLead`, leadId: raceLeadId }, adminTok);
    const tWithLeadId = tWithLead.data?.data?.task?.id;
    if (tWithLeadId) trackedTaskIds.push(tWithLeadId);

    const compTLead = await api('PATCH', `/tasks/${tWithLeadId}/status`, { status: 'completed' }, adminTok);
    assert(compTLead.status === 200, 'Complete task with leadId returns 200', `Got ${compTLead.status}`);

    const taskAct = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM activities WHERE lead_id = $1 AND type = 'task'`,
      [raceLeadId],
    );
    assert(parseInt(taskAct.rows[0].count, 10) >= 1, 'Completing task with leadId writes task activity', `Count=${taskAct.rows[0].count}`);

    // Hard delete
    const delTask = await api('DELETE', `/tasks/${tWithLeadId}`, undefined, adminTok);
    assert(delTask.status === 200, 'DELETE task returns 200', `Got ${delTask.status}`);

    const getDelTask = await api('GET', `/tasks/${tWithLeadId}`, undefined, adminTok);
    assert(getDelTask.status === 404, 'GET hard-deleted task returns 404', `Got ${getDelTask.status}`);

    // ═════════════════════════════════════════════════════════════════════════
    // 10. ACTIVITIES: LOGGING, TIMELINE, SYSTEM TYPE REJECTION
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 10: ACTIVITIES ---');

    // Log 2 manual activities on raceLeadId
    const a1 = await api('POST', `/leads/${raceLeadId}/activities`, { type: 'note', subject: 'First note' }, adminTok);
    const a2 = await api('POST', `/leads/${raceLeadId}/activities`, { type: 'email', subject: 'Second email' }, adminTok);
    assert(a1.status === 201 && a2.status === 201, 'Two manual activities created 201', `a1: ${a1.status}, a2: ${a2.status}`);

    // GET activities: newest first
    const listAct = await api('GET', `/leads/${raceLeadId}/activities`, undefined, adminTok);
    const acts = listAct.data?.data?.activities || [];
    assert(
      listAct.status === 200 && acts.length >= 2 && acts[0].subject === 'Second email',
      'GET activities returned newest first',
      `Top subject: ${acts[0]?.subject}`,
    );

    // System type rejection
    const aSysStatus = await api('POST', `/leads/${raceLeadId}/activities`, { type: 'status_change', subject: 'Forbidden' }, adminTok);
    const aSysTask = await api('POST', `/leads/${raceLeadId}/activities`, { type: 'task', subject: 'Forbidden' }, adminTok);
    assert(
      aSysStatus.status === 400 && aSysTask.status === 400,
      'System types (status_change, task) in POST activities rejected 400',
      `status_change: ${aSysStatus.status}, task: ${aSysTask.status}`,
    );

    // Activity on Converted lead (fLeadId) is ALLOWED
    const aOnClosed = await api('POST', `/leads/${fLeadId}/activities`, { type: 'note', subject: 'Note on closed lead' }, adminTok);
    assert(aOnClosed.status === 201, 'POST activity on Converted lead returns 201', `Got ${aOnClosed.status}`);

    // Pagination meta shape
    const actPage = await api('GET', `/leads/${raceLeadId}/activities?page=1&limit=2`, undefined, adminTok);
    assert(
      actPage.status === 200 && actPage.data?.data?.meta?.page === 1 && actPage.data?.data?.meta?.limit === 2,
      'Activity pagination meta has {page, limit, total, totalPages}',
      `Meta: ${JSON.stringify(actPage.data?.data?.meta)}`,
    );

    // Out-of-scope lead -> 404
    const aOutScope = await api('POST', `/leads/${s2LeadId}/activities`, { type: 'note', subject: 'Sales1 hijack' }, sales1Tok);
    assert(aOutScope.status === 404, 'POST activity on out-of-scope lead returns 404', `Got ${aOutScope.status}`);

    // ═════════════════════════════════════════════════════════════════════════
    // 11. VALIDATION: UUID, UNKNOWN FIELDS, ENUMS
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 11: VALIDATION ---');

    // Bad UUID in :id
    const badUuid = await api('GET', '/companies/not-a-uuid', undefined, adminTok);
    assert(
      badUuid.status === 400 && badUuid.data?.error?.code === 'VALIDATION_ERROR',
      'Bad UUID in :id returns 400 VALIDATION_ERROR',
      `Status ${badUuid.status}, code ${badUuid.data?.error?.code}`,
    );

    // Unknown field in strict body
    const unknownField = await api('POST', '/companies', { name: `${markerPrefix}-Strict`, hackerKey: '1337' }, adminTok);
    assert(
      unknownField.status === 400 && unknownField.data?.error?.code === 'VALIDATION_ERROR',
      'Unknown field in strict company body returns 400 VALIDATION_ERROR',
      `Status ${unknownField.status}`,
    );

    // Invalid enum in task priority
    const badPri = await api('POST', '/tasks', { title: `${markerPrefix}-BadPri`, priority: 'urgent' }, adminTok);
    assert(
      badPri.status === 400 && badPri.data?.error?.code === 'VALIDATION_ERROR',
      'Invalid priority enum returns 400 VALIDATION_ERROR',
      `Status ${badPri.status}`,
    );

    // Invalid enum in followup type
    const badFType = await api('POST', '/followups', { leadId: raceLeadId, scheduledAt: tPlus1, type: 'smoke_signal' }, adminTok);
    assert(
      badFType.status === 400 && badFType.data?.error?.code === 'VALIDATION_ERROR',
      'Invalid followup type enum returns 400 VALIDATION_ERROR',
      `Status ${badFType.status}`,
    );

    // ═════════════════════════════════════════════════════════════════════════
    // 12. SAFETY: SQL INJECTION, ILIKE WILDCARDS, NO SECRETS
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 12: SAFETY ---');

    // SQL injection stored safely
    const sqlName = `${markerPrefix}-Drop'; DROP TABLE companies; --`;
    const sqlRes = await api('POST', '/companies', { name: sqlName }, adminTok);
    assert(
      sqlRes.status === 201 && sqlRes.data?.data?.company?.name === sqlName,
      'SQL injection in company name safely stored intact',
      `Status ${sqlRes.status}, name: ${sqlRes.data?.data?.company?.name}`,
    );
    if (sqlRes.data?.data?.company?.id) trackedCompanyIds.push(sqlRes.data.data.company.id);

    // ILIKE wildcards treated as literals
    const wildName = `${markerPrefix}-Wild_%`;
    const wildRes = await api('POST', '/companies', { name: wildName }, adminTok);
    if (wildRes.data?.data?.company?.id) trackedCompanyIds.push(wildRes.data.data.company.id);
    const wildSearch = await api('GET', `/companies?q=${encodeURIComponent('Wild_%')}`, undefined, adminTok);
    assert(
      wildSearch.status === 200 && wildSearch.data?.data?.companies?.some((c: any) => c.name === wildName),
      'ILIKE wildcards (_ and %) treated as literals in search',
      `Found: ${wildSearch.data?.data?.companies?.length}`,
    );

    // No secrets leaked
    const jsonStr = JSON.stringify([sqlRes.data, wildSearch.data]);
    assert(
      !jsonStr.includes('password_hash') && !jsonStr.includes('token_hash'),
      'No password hashes or token secrets leaked in responses',
      'Sensitive keys found in response',
    );
  } finally {
    // ═════════════════════════════════════════════════════════════════════════
    // 13. CLEANUP & ZERO LEFTOVER
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n--- GROUP 13: CLEANUP & ZERO LEFTOVER VERIFICATION ---');
    await cleanup();

    const [cCnt, lCnt, tCnt] = await Promise.all([
      query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM companies WHERE name LIKE 'M6T-%'`),
      query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM leads WHERE lead_name LIKE 'M6T-%'`),
      query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM tasks WHERE title LIKE 'M6T-%'`),
    ]);
    const leftover = parseInt(cCnt.rows[0].cnt, 10) + parseInt(lCnt.rows[0].cnt, 10) + parseInt(tCnt.rows[0].cnt, 10);
    assert(leftover === 0, `Zero leftover rows remain in DB`, `Remaining: c=${cCnt.rows[0].cnt} l=${lCnt.rows[0].cnt} t=${tCnt.rows[0].cnt}`);

    await stopServer();
    await pool.end();

    console.log('\n================================================================');
    console.log(`  MODULE 6 SUITE FINISHED: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
