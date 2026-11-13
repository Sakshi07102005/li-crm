import fs from 'node:fs';
import path from 'node:path';

const API_BASE = 'http://localhost:4000/api';
const email = 'sales1@licrm.example';
const password = process.env.SEED_SAMPLE_PASSWORD || 'Sample@12345';

function shapeOf(val, depth = 0) {
  if (depth > 3) return typeof val;
  if (val === null) return 'null';
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    return [shapeOf(val[0], depth + 1)];
  }
  if (typeof val === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      if (k.toLowerCase().includes('token') || k.toLowerCase().includes('secret') || k.toLowerCase().includes('password')) {
        res[k] = 'string(REDACTED)';
      } else {
        res[k] = shapeOf(v, depth + 1);
      }
    }
    return res;
  }
  return typeof val;
}

async function run() {
  const shapes = {};

  // 1. Login
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginData = await loginRes.json();
  shapes['POST /auth/login'] = shapeOf(loginData);

  const token = loginData.data?.tokens?.accessToken || loginData.data?.accessToken;
  const refreshToken = loginData.data?.tokens?.refreshToken || loginData.data?.refreshToken;
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. GET /auth/me
  const meRes = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders });
  shapes['GET /auth/me'] = shapeOf(await meRes.json());

  // 3. GET /rbac/permissions
  const rbacRes = await fetch(`${API_BASE}/rbac/permissions`, { headers: authHeaders });
  shapes['GET /rbac/permissions'] = shapeOf(await rbacRes.json());

  // 4. GET /leads?limit=2
  const leadsRes = await fetch(`${API_BASE}/leads?limit=2`, { headers: authHeaders });
  const leadsData = await leadsRes.json();
  shapes['GET /leads?limit=2'] = shapeOf(leadsData);

  const firstLeadId = leadsData.data?.leads?.[0]?.id;

  // 5. GET /leads/:id
  if (firstLeadId) {
    const leadRes = await fetch(`${API_BASE}/leads/${firstLeadId}`, { headers: authHeaders });
    shapes['GET /leads/:id'] = shapeOf(await leadRes.json());
  }

  // 6. GET /leads/lookups
  const lookupsRes = await fetch(`${API_BASE}/leads/lookups`, { headers: authHeaders });
  shapes['GET /leads/lookups'] = shapeOf(await lookupsRes.json());

  // 7. GET /followups?limit=2
  const followupsRes = await fetch(`${API_BASE}/followups?limit=2`, { headers: authHeaders });
  shapes['GET /followups?limit=2'] = shapeOf(await followupsRes.json());

  // 8. GET /tasks?limit=2&mine=true
  const tasksRes = await fetch(`${API_BASE}/tasks?limit=2&mine=true`, { headers: authHeaders });
  shapes['GET /tasks?limit=2&mine=true'] = shapeOf(await tasksRes.json());

  // 9. GET /leads/:id/activities?limit=2
  if (firstLeadId) {
    const actRes = await fetch(`${API_BASE}/leads/${firstLeadId}/activities?limit=2`, { headers: authHeaders });
    shapes['GET /leads/:id/activities?limit=2'] = shapeOf(await actRes.json());
  }

  // 10. GET /reports/dashboard
  const dashRes = await fetch(`${API_BASE}/reports/dashboard`, { headers: authHeaders });
  shapes['GET /reports/dashboard'] = shapeOf(await dashRes.json());

  // 11. POST /auth/refresh
  const refRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  shapes['POST /auth/refresh'] = shapeOf(await refRes.json());

  // 12. Validation error: POST /leads with {}
  const valRes = await fetch(`${API_BASE}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({}),
  });
  shapes['Validation Error: POST /leads with {}'] = await valRes.json();

  // 13. Duplicate test
  const testEmail = `dupetest_${Date.now()}@example.com`;
  const dup1 = await fetch(`${API_BASE}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      leadName: 'Dupe Test',
      email: testEmail,
      mobile: '+919876543210',
      productId: 1,
      sourceId: 1,
      priority: 'medium',
    }),
  });
  const dup1Data = await dup1.json();
  const createdLeadId = dup1Data.data?.id;

  const dup2 = await fetch(`${API_BASE}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      leadName: 'Dupe Test 2',
      email: testEmail,
      mobile: '+919876543210',
      productId: 1,
      sourceId: 1,
      priority: 'medium',
    }),
  });
  shapes['Duplicate Error: POST /leads duplicate'] = await dup2.json();

  if (createdLeadId) {
    await fetch(`${API_BASE}/leads/${createdLeadId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
  }

  const outDir = path.resolve('docs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'api-shapes.txt'), JSON.stringify(shapes, null, 2), 'utf8');
  console.log('Saved shapes to docs/api-shapes.txt');
}

run().catch(console.error);

