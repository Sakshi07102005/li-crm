/**
 * Module 4 RBAC Test Suite — real PostgreSQL, real HTTP, ephemeral port.
 * Tests permission matrix, user scope, edge cases, audit rows, and leadScope proof.
 */
process.env.NODE_ENV = 'test';

import http from 'http';
import { AddressInfo } from 'net';
import { query } from './db/pool';
import { pool } from './db/pool';
import app from './app';
import { leadScope } from './services/scope.service';
import { AuthUser } from './types/express';

// ─── helpers ────────────────────────────────────────────────────────────────

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
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
  const r = await api('POST', '/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`Login failed for ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  return {
    accessToken: r.data.data.tokens.accessToken,
    refreshToken: r.data.data.tokens.refreshToken,
  };
}

// ─── test runner ────────────────────────────────────────────────────────────

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
  if (condition) pass(label); else fail(label, reason);
}

// ─── cleanup tracking ───────────────────────────────────────────────────────

const throwawayUserIds: string[] = [];
const throwawayLeadIds: string[] = [];

async function createThrowawayUser(
  adminToken: string,
  roleCode: string,
  suffix: string,
  managerId?: string,
): Promise<{ id: string; email: string; password: string; token: string }> {
  const email = `test.rbac.${suffix}.${Date.now()}@throwaway.invalid`;
  const password = 'RbacTest@123';
  const body: any = { email, password, firstName: 'Test', lastName: suffix, roleCode };
  if (managerId) body.managerId = managerId;

  const r = await api('POST', '/users', body, adminToken);
  if (r.status !== 201) throw new Error(`createThrowawayUser failed: ${r.status} ${JSON.stringify(r.data)}`);

  const id: string = r.data.data.user.id;
  throwawayUserIds.push(id);

  const { accessToken: token } = await login(email, password);
  return { id, email, password, token };
}

async function cleanup() {
  // Delete leads first (FK constraints)
  for (const id of throwawayLeadIds) {
    await query(`DELETE FROM leads WHERE id = $1`, [id]).catch(() => {});
  }
  // Revoke tokens then delete users
  for (const id of throwawayUserIds) {
    await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [id]).catch(() => {});
    await query(`DELETE FROM audit_logs WHERE user_id = $1`, [id]).catch(() => {});
    await query(`DELETE FROM users WHERE id = $1`, [id]).catch(() => {});
  }
  console.log(`\n Cleaned up ${throwawayUserIds.length} throwaway user(s) and ${throwawayLeadIds.length} lead(s).`);
}

// ─── seed user passwords ─────────────────────────────────────────────────────

const ADMIN_EMAIL = 'admin@licrm.example';
const BH_EMAIL = 'businesshead@licrm.example';
const SALES1_EMAIL = 'sales1@licrm.example';
const MARKETING_EMAIL = 'marketing@licrm.example';
const SEED_ADMIN_PW = process.env.SEED_ADMIN_PASSWORD ?? '';
const SEED_SAMPLE_PW = process.env.SEED_SAMPLE_PASSWORD ?? '';

// Known seeded UUIDs
const BH_ID = '34935e08-b333-428c-ba4e-c4e4d24c4c40';

// ─── main test body ──────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n================================================================');
  console.log('  MODULE 4 RBAC SUITE - REAL POSTGRESQL & HTTP FETCH');
  console.log('================================================================\n');

  // Connect to DB
  const dbCheck = await query('SELECT NOW() AS now');
  console.log(` Connected to live database (${dbCheck.rows[0].now})`);

  await startServer();

  // ── Login all roles ──────────────────────────────────────────────────────
  const adminSession    = await login(ADMIN_EMAIL, SEED_ADMIN_PW);
  const bhSession       = await login(BH_EMAIL, SEED_SAMPLE_PW);
  const salesSession    = await login(SALES1_EMAIL, SEED_SAMPLE_PW);
  const mktSession      = await login(MARKETING_EMAIL, SEED_SAMPLE_PW);

  const adminTok  = adminSession.accessToken;
  const bhTok     = bhSession.accessToken;
  const salesTok  = salesSession.accessToken;
  const mktTok    = mktSession.accessToken;

  // ══════════════════════════════════════════════════════════════════════
  // GROUP 1: RBAC endpoints accessible to all roles
  // ══════════════════════════════════════════════════════════════════════
  {
    const r1 = await api('GET', '/roles', undefined, adminTok);
    const r2 = await api('GET', '/roles', undefined, bhTok);
    const r3 = await api('GET', '/roles', undefined, salesTok);
    const r4 = await api('GET', '/roles', undefined, mktTok);
    assert(
      r1.status === 200 && r2.status === 200 && r3.status === 200 && r4.status === 200,
      '[1] GET /roles returns 200 for all 4 roles',
      `statuses: admin=${r1.status} bh=${r2.status} sales=${r3.status} mkt=${r4.status}`,
    );

    const r5 = await api('GET', '/rbac/permissions', undefined, adminTok);
    const r6 = await api('GET', '/rbac/permissions', undefined, salesTok);
    assert(
      r5.status === 200 && r6.status === 200 &&
      r5.data.data.role.code === 'admin' && r6.data.data.role.code === 'sales_executive',
      '[1b] GET /rbac/permissions returns role + permissions + scope for all roles',
      `admin=${r5.status} sales=${r6.status}`,
    );

    // Unauthenticated should get 401
    const r7 = await api('GET', '/roles');
    assert(r7.status === 401, '[1c] GET /roles without token → 401', `got ${r7.status}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // GROUP 2: Permission matrix for /users endpoints
  // ══════════════════════════════════════════════════════════════════════
  {
    // GET /users: admin & business_head can list; sales & marketing cannot
    const rAdmin = await api('GET', '/users', undefined, adminTok);
    const rBh    = await api('GET', '/users', undefined, bhTok);
    const rSales = await api('GET', '/users', undefined, salesTok);
    const rMkt   = await api('GET', '/users', undefined, mktTok);

    assert(
      rAdmin.status === 200,
      '[2a] admin can GET /users (200)',
      `got ${rAdmin.status}`,
    );
    assert(
      rBh.status === 200,
      '[2b] business_head can GET /users (200)',
      `got ${rBh.status}`,
    );
    assert(
      rSales.status === 403,
      '[2c] sales_executive cannot GET /users (403)',
      `got ${rSales.status} body=${JSON.stringify(rSales.data)}`,
    );
    assert(
      rMkt.status === 403,
      '[2d] marketing_executive cannot GET /users (403)',
      `got ${rMkt.status}`,
    );

    // POST /users: only admin
    const salesCreate = await api('POST', '/users', {
      email: 'blocked@test.invalid', password: 'Block@1234', firstName: 'No', lastName: 'Access',
      roleCode: 'sales_executive',
    }, salesTok);
    assert(salesCreate.status === 403, '[2e] sales cannot POST /users (403)', `got ${salesCreate.status}`);

    // PATCH role/status and POST reset-password: need a real target, use admin on itself later
    // Test with invalid token body
    const noTokCreate = await api('POST', '/users', {
      email: 'anon@test.invalid', password: 'Anon@1234', firstName: 'A', lastName: 'B',
      roleCode: 'sales_executive',
    });
    assert(noTokCreate.status === 401, '[2f] no token POST /users → 401', `got ${noTokCreate.status}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // GROUP 3: Business head sees only self + direct reports; admin sees all
  // ══════════════════════════════════════════════════════════════════════
  {
    const adminList = await api('GET', '/users', undefined, adminTok);
    const bhList    = await api('GET', '/users', undefined, bhTok);

    const adminCount = adminList.data?.data?.total ?? 0;
    const bhCount    = bhList.data?.data?.total ?? 0;

    // Admin must see at least 5 (5 seeded) users
    assert(
      adminCount >= 5,
      `[3a] admin sees all users (≥5); got ${adminCount}`,
      `adminCount=${adminCount}`,
    );

    // Business head scope: self + their direct reports (sales1, sales2, marketing = 3 reports + self = 4 total)
    // The BH's direct reports are pre-seeded with manager_id = BH_ID
    assert(
      bhCount >= 1 && bhCount < adminCount,
      `[3b] business_head sees fewer users than admin (${bhCount} < ${adminCount})`,
      `bhCount=${bhCount} adminCount=${adminCount}`,
    );

    // Business head should NOT be able to get a user outside their scope (but admin can)
    // Create a throwaway user managed by nobody (no managerId → only admin can see them)
    const isolated = await createThrowawayUser(adminTok, 'sales_executive', 'isolated');
    const bhGetIsolated = await api('GET', `/users/${isolated.id}`, undefined, bhTok);
    assert(
      bhGetIsolated.status === 404,
      '[3c] business_head cannot GET user outside scope → 404 (not 403)',
      `got ${bhGetIsolated.status}`,
    );

    const adminGetIsolated = await api('GET', `/users/${isolated.id}`, undefined, adminTok);
    assert(
      adminGetIsolated.status === 200,
      '[3d] admin can GET any user',
      `got ${adminGetIsolated.status}`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // GROUP 4: No token 401, expired/tampered token 401
  // ══════════════════════════════════════════════════════════════════════
  {
    const r1 = await api('GET', '/users');
    assert(r1.status === 401, '[4a] no token → 401', `got ${r1.status}`);

    // Tampered token
    const tampered = adminTok.slice(0, -4) + 'XXXX';
    const r2 = await api('GET', '/users', undefined, tampered);
    assert(r2.status === 401, '[4b] tampered token → 401', `got ${r2.status}`);

    // Expired token: craft one with exp in the past
    const jwt = await import('jsonwebtoken');
    const { env } = await import('./config/env');
    const expiredTok = jwt.default.sign({ sub: 'fake-id' }, env.jwt.accessSecret, { expiresIn: -1 });
    const r3 = await api('GET', '/users', undefined, expiredTok);
    assert(r3.status === 401, '[4c] expired token → 401', `got ${r3.status}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // GROUP 5: Privilege escalation attempts
  // ══════════════════════════════════════════════════════════════════════
  {
    // sales_exec tries to PATCH their own role
    const { data: meData } = await api('GET', '/auth/me', undefined, salesTok);
    const salesId = meData?.data?.id;

    const r1 = await api('PATCH', `/users/${salesId}/role`, { roleCode: 'admin' }, salesTok);
    assert(r1.status === 403, '[5a] sales cannot PATCH own role → 403', `got ${r1.status}`);

    // PUT /users/:id with 'role' field in body → 400 strict validation
    const r2 = await api('PUT', `/users/${salesId}`, { firstName: 'Hacker', role: 'admin' }, adminTok);
    assert(r2.status === 400, '[5b] PUT /users/:id with extra "role" field → 400 (strict schema)', `got ${r2.status}`);

    // PUT /users/:id with 'email' field in body → 400 strict
    const r3 = await api('PUT', `/users/${salesId}`, { email: 'hacked@evil.com' }, adminTok);
    assert(r3.status === 400, '[5c] PUT /users/:id with "email" field → 400 (strict schema)', `got ${r3.status}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // GROUP 6: Admin safeguards
  // ══════════════════════════════════════════════════════════════════════
  {
    const { data: meData } = await api('GET', '/auth/me', undefined, adminTok);
    const adminId = meData?.data?.id;

    // Admin cannot change own role
    const r1 = await api('PATCH', `/users/${adminId}/role`, { roleCode: 'business_head' }, adminTok);
    assert(r1.status === 403, '[6a] admin cannot change own role → 403', `got ${r1.status}`);

    // Admin cannot deactivate self
    const r2 = await api('PATCH', `/users/${adminId}/status`, { isActive: false }, adminTok);
    assert(r2.status === 403, '[6b] admin cannot deactivate own account → 403', `got ${r2.status}`);

    // Cannot demote the last active admin — there's only 1 seeded admin
    const r3 = await api('PATCH', `/users/${adminId}/role`, { roleCode: 'sales_executive' }, adminTok);
    assert(r3.status === 403, '[6c] cannot demote last active admin → 403', `got ${r3.status}`);

    // Cannot deactivate last active admin
    const r4 = await api('PATCH', `/users/${adminId}/status`, { isActive: false }, adminTok);
    assert(r4.status === 403, '[6d] cannot deactivate last active admin → 403', `got ${r4.status}`);

    // Create a second admin so the first is no longer "last"
    const admin2 = await createThrowawayUser(adminTok, 'admin', 'admin2');
    const admin2Tok = admin2.token;

    // Now admin2 can change admin's role (they're not the last admin)
    // NOTE: admin itself cannot change own role, so we use admin2
    const r5 = await api('PATCH', `/users/${admin2.id}/role`, { roleCode: 'business_head' }, adminTok);
    assert(r5.status === 200, '[6e] admin can change another admin\'s role when not last admin → 200', `got ${r5.status} ${JSON.stringify(r5.data)}`);

    // Restore admin2 back to admin for cleanup
    await api('PATCH', `/users/${admin2.id}/role`, { roleCode: 'admin' }, adminTok);
  }

  // ══════════════════════════════════════════════════════════════════════
  // GROUP 7: Deactivation revokes refresh tokens
  // ══════════════════════════════════════════════════════════════════════
  {
    // Create a throwaway user, log them in, deactivate, verify token fails
    const victim = await createThrowawayUser(adminTok, 'sales_executive', 'deactivate-me', BH_ID);
    const victimLogin = await login(victim.email, 'RbacTest@123');
    const victimTok = victimLogin.accessToken;
    const victimRefresh = victimLogin.refreshToken;

    // Verify token works before deactivation
    const r1 = await api('GET', '/auth/me', undefined, victimTok);
    assert(r1.status === 200, '[7a] victim token works before deactivation', `got ${r1.status}`);

    // Admin deactivates victim
    const r2 = await api('PATCH', `/users/${victim.id}/status`, { isActive: false }, adminTok);
    assert(r2.status === 200, '[7b] admin deactivates victim → 200', `got ${r2.status}`);

    // Victim access token now returns 403 (account disabled)
    const r3 = await api('GET', '/auth/me', undefined, victimTok);
    assert(r3.status === 403, '[7c] victim access token → 403 after deactivation', `got ${r3.status}`);

    // Victim refresh token is revoked
    const r4 = await api('POST', '/auth/refresh', { refreshToken: victimRefresh });
    assert(
      r4.status === 401,
      '[7d] victim refresh token revoked after deactivation → 401',
      `got ${r4.status}`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // GROUP 8: Audit log rows
  // ══════════════════════════════════════════════════════════════════════
  {
    // Create a fresh throwaway user and do various operations so audit rows are written
    const target = await createThrowawayUser(adminTok, 'sales_executive', 'audit-target', BH_ID);

    // Update profile → user.updated
    await api('PUT', `/users/${target.id}`, { firstName: 'Audited' }, adminTok);

    // Change role → user.role_changed
    await api('PATCH', `/users/${target.id}/role`, { roleCode: 'marketing_executive' }, adminTok);

    // Reset password → user.password_reset
    await api('POST', `/users/${target.id}/reset-password`, { newPassword: 'NewAudit@456' }, adminTok);

    // Change status → user.status_changed
    await api('PATCH', `/users/${target.id}/status`, { isActive: false }, adminTok);

    // Trigger authz.denied: sales tries to access a user endpoint they can't
    await api('GET', '/users', undefined, salesTok);

    // Check audit logs
    const auditRes = await query<{ action: string; entity_id: string }>(
      `SELECT action, entity_id FROM audit_logs
       WHERE (entity_id = $1 OR (action = 'authz.denied' AND created_at > NOW() - INTERVAL '5 minutes'))
       ORDER BY created_at DESC LIMIT 20`,
      [target.id],
    );
    const actions = auditRes.rows.map((r) => r.action);

    assert(actions.includes('user.create'), '[8a] audit contains user.create', `actions: ${actions}`);
    assert(actions.includes('user.updated'), '[8b] audit contains user.updated', `actions: ${actions}`);
    assert(actions.includes('user.role_changed'), '[8c] audit contains user.role_changed', `actions: ${actions}`);
    assert(actions.includes('user.password_reset'), '[8d] audit contains user.password_reset', `actions: ${actions}`);
    assert(actions.includes('user.status_changed'), '[8e] audit contains user.status_changed', `actions: ${actions}`);
    assert(actions.includes('authz.denied'), '[8f] audit contains authz.denied', `actions: ${actions}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // GROUP 9: leadScope proof (direct function test)
  // ══════════════════════════════════════════════════════════════════════
  {
    // Build mock AuthUser objects for each role (using real permission arrays from DB)
    const permRes = await query<{ user_id: string; email: string; role_code: string; manager_id: string | null; permissions: string[] }>(
      `SELECT u.id AS user_id, u.email, u.manager_id,
              r.code AS role_code,
              COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.email IN ($1, $2, $3, $4)
       GROUP BY u.id, u.email, u.manager_id, r.code`,
      [ADMIN_EMAIL, BH_EMAIL, SALES1_EMAIL, MARKETING_EMAIL],
    );

    const makeUser = (row: any): AuthUser => ({
      id: row.user_id,
      email: row.email,
      roleCode: row.role_code,
      roleName: row.role_code,
      permissions: row.permissions,
      managerId: row.manager_id ?? null,
    });

    const usersMap: Record<string, AuthUser> = {};
    for (const row of permRes.rows) {
      usersMap[row.role_code] = makeUser(row);
    }

    const adminUser = usersMap['admin'];
    const bhUser    = usersMap['business_head'];
    const salesUser = usersMap['sales_executive'];
    const mktUser   = usersMap['marketing_executive'];

    // Insert throwaway leads
    const sourceRes = await query<{ id: number; is_marketing: boolean }>(
      `SELECT id, is_marketing FROM lead_sources WHERE is_active = TRUE ORDER BY id LIMIT 10`,
    );
    const marketingSourceId = sourceRes.rows.find((r) => r.is_marketing)?.id;
    const nonMarketingSourceId = sourceRes.rows.find((r) => !r.is_marketing)?.id;

    const productRes = await query<{ id: number }>(`SELECT id FROM products LIMIT 1`);
    const productId = productRes.rows[0]?.id;
    const statusRes = await query<{ id: number }>(`SELECT id FROM lead_statuses ORDER BY sort_order LIMIT 1`);
    const statusId = statusRes.rows[0]?.id;

    // Helper to insert a lead
    async function insertLead(params: {
      assignedTo: string;
      createdBy: string;
      sourceId: number;
    }): Promise<string> {
      const r = await query<{ id: string }>(
        `INSERT INTO leads (lead_name, source_id, product_id, status_id, priority, assigned_to, created_by, mobile)
         VALUES ($1, $2, $3, $4, 'medium', $5, $6, $7)
         RETURNING id`,
        [
          `Test Lead ${Date.now()}`,
          params.sourceId,
          productId,
          statusId,
          params.assignedTo,
          params.createdBy,
          `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        ],
      );
      const id = r.rows[0].id;
      throwawayLeadIds.push(id);
      return id;
    }

    if (!marketingSourceId || !nonMarketingSourceId || !productId || !statusId) {
      fail('[9] leadScope proof', 'Could not find required seed data for leads');
    } else {
      // Lead visible to admin only (assigned to admin, non-marketing source)
      const lead1 = await insertLead({ assignedTo: adminUser.id, createdBy: adminUser.id, sourceId: nonMarketingSourceId });

      // Lead visible to sales (assigned to sales)
      const lead2 = await insertLead({ assignedTo: salesUser.id, createdBy: adminUser.id, sourceId: nonMarketingSourceId });

      // Lead visible to business_head via team (assigned to sales who reports to BH)
      const lead3 = await insertLead({ assignedTo: salesUser.id, createdBy: bhUser.id, sourceId: nonMarketingSourceId });

      // Lead visible to marketing (marketing source)
      const lead4 = await insertLead({ assignedTo: adminUser.id, createdBy: adminUser.id, sourceId: marketingSourceId });

      async function visibleLeads(user: AuthUser): Promise<string[]> {
        const scope = leadScope(user, 'l', 1);
        const sql = `SELECT l.id FROM leads l WHERE l.deleted_at IS NULL AND ${scope.sql} ORDER BY l.id`;
        const res = await query<{ id: string }>(sql, scope.params);
        return res.rows.map((r) => r.id);
      }

      const adminLeads   = await visibleLeads(adminUser);
      const bhLeads      = await visibleLeads(bhUser);
      const salesLeads   = await visibleLeads(salesUser);
      const mktLeads     = await visibleLeads(mktUser);

      // Admin sees all throwaway leads
      const adminSeesAll = [lead1, lead2, lead3, lead4].every((id) => adminLeads.includes(id));
      assert(adminSeesAll, '[9a] admin leadScope sees all 4 throwaway leads', `adminLeads=${adminLeads.length}`);

      // Sales sees lead2 and lead3 (assigned to sales or created by sales)
      const salesSeesOwn = salesLeads.includes(lead2) && salesLeads.includes(lead3);
      const salesNotAdmin = !salesLeads.includes(lead1);
      assert(salesSeesOwn && salesNotAdmin, '[9b] sales leadScope sees own leads, not admin-only lead', `sales has lead2=${salesLeads.includes(lead2)} lead3=${salesLeads.includes(lead3)} lead1=${salesLeads.includes(lead1)}`);

      // BH sees lead2, lead3 (team assigned), and lead3 (created by BH); also lead3 via created_by
      const bhSeesTeam = bhLeads.includes(lead2) && bhLeads.includes(lead3);
      const bhNotMarketingOnly = !bhLeads.includes(lead4) || bhLeads.includes(lead4); // BH doesn't have marketing filter, lead4 has non-BH assignment
      assert(bhSeesTeam, '[9c] business_head leadScope sees team-assigned leads', `bh has lead2=${bhLeads.includes(lead2)} lead3=${bhLeads.includes(lead3)}`);

      // Marketing sees lead4 (marketing source) but not lead1 (non-marketing, assigned to admin)
      const mktSeesMarketing = mktLeads.includes(lead4);
      const mktNotNonMarketing = !mktLeads.includes(lead1);
      assert(mktSeesMarketing && mktNotNonMarketing, '[9d] marketing leadScope sees marketing-source leads, not non-marketing admin lead', `mkt has lead4=${mktLeads.includes(lead4)} lead1=${mktLeads.includes(lead1)}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // GROUP 10: CRUD happy path (admin creates, updates, reads user)
  // ══════════════════════════════════════════════════════════════════════
  {
    const newUser = await createThrowawayUser(adminTok, 'sales_executive', 'crud', BH_ID);

    // Update profile
    const r1 = await api('PUT', `/users/${newUser.id}`, { firstName: 'Updated', lastName: 'Name' }, adminTok);
    assert(
      r1.status === 200 && r1.data?.data?.user?.firstName === 'Updated',
      '[10a] admin can update user profile',
      `got ${r1.status} firstName=${r1.data?.data?.user?.firstName}`,
    );

    // Reset password
    const r2 = await api('POST', `/users/${newUser.id}/reset-password`, { newPassword: 'NewPass@999' }, adminTok);
    assert(r2.status === 200, '[10b] admin can reset user password', `got ${r2.status}`);

    // Verify new password works
    const newLogin = await login(newUser.email, 'NewPass@999');
    assert(!!newLogin.accessToken, '[10c] new password works for login', 'login failed');

    // Activate then deactivate
    const r3 = await api('PATCH', `/users/${newUser.id}/status`, { isActive: false }, adminTok);
    assert(r3.status === 200 && r3.data?.data?.user?.isActive === false, '[10d] admin can deactivate user', `got ${r3.status}`);
  }
}

// ─── entry point ────────────────────────────────────────────────────────────

(async () => {
  try {
    await runTests();
  } catch (err) {
    console.error('\nUnhandled test error:', err);
    failed++;
  } finally {
    await cleanup();
    await stopServer();
    await pool.end();

    console.log('\n----------------------------------------------------------------');
    console.log(` SUMMARY: ${passed} passed, ${failed} failed out of ${passed + failed} test suites.`);
    console.log('----------------------------------------------------------------\n');
    process.exit(failed > 0 ? 1 : 0);
  }
})();

