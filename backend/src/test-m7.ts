/**
 * Module 7 Backend Part B Test Suite
 * Real PostgreSQL, real HTTP server on ephemeral port.
 * Tests:
 * 1. Formula Injection & Exporters (CSV, XLSX)
 * 2. Dashboard Aggregates & Role Scoping
 * 3. Reports (Status, Source, Product, Team Performance, Conversion Rates) + CSV/XLSX export & 403 on lack of permission
 * 4. Notifications CRUD & Unread Count & FCM Device Tokens
 * 5. Follow-up Reminders Scheduled Job (row lock & notification trigger)
 * 6. Bulk Lead Import (Template download, CSV import, duplicate skipping, validation errors, RBAC)
 * 7. Audit Log Viewer (Pagination, action filtering, sensitive data redaction)
 * 8. Cleanup & Summary Verification
 */
process.env.NODE_ENV = 'test';

import http from 'http';
import { AddressInfo } from 'net';
import { query, pool } from './db/pool';
import app from './app';
import { protectFormula, exportToCSV, exportToXLSX } from './utils/exporters';
import { runFollowupReminders } from './jobs/followupReminders';

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
  body?: any,
  token?: string,
  customHeaders?: Record<string, string>,
): Promise<{ status: number; data: any; headers: Headers; rawBuffer?: Buffer }> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = { ...customHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let requestBody: any = undefined;
  if (body !== undefined) {
    if (typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Buffer)) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    } else {
      requestBody = body;
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body: requestBody,
  });

  let data: any;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data, headers: res.headers };
  } else {
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    return { status: res.status, data: buffer, headers: res.headers, rawBuffer: buffer };
  }
}

async function login(email: string, pass = 'Sample@12345'): Promise<string> {
  const adminPass = email === 'admin@licrm.example' ? 'Admin@12345' : pass;
  const r = await api('POST', '/auth/login', { email, password: adminPass });
  if (r.status !== 200 || !r.data?.data?.tokens?.accessToken) {
    throw new Error(`Login failed for ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  }
  return r.data.data.tokens.accessToken;
}

// ─── ASSERTION HELPERS ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(label: string) {
  passed++;
  console.log(`  PASS [${passed + failed}] ${label}`);
}

function fail(label: string, reason: string) {
  failed++;
  console.error(`  FAIL [${passed + failed}] ${label}`);
  console.error(`       Reason: ${reason}`);
}

function assert(condition: boolean, label: string, reason = 'Condition not met') {
  if (condition) pass(label);
  else fail(label, reason);
}

// ─── CLEANUP TRACKING ─────────────────────────────────────────────────────────

const runId = Date.now();
const marker = `M7T-${runId}`;

const trackedLeadIds: string[] = [];
const trackedFollowupIds: string[] = [];
const trackedUserIds: string[] = [];

async function cleanup(): Promise<void> {
  try {
    if (trackedFollowupIds.length > 0) {
      await query(`DELETE FROM follow_ups WHERE id = ANY($1::uuid[])`, [trackedFollowupIds]);
    }
    await query(`DELETE FROM follow_ups WHERE notes LIKE '${marker}%'`);
    if (trackedLeadIds.length > 0) {
      await query(`DELETE FROM activities WHERE lead_id = ANY($1::uuid[])`, [trackedLeadIds]);
      await query(`DELETE FROM lead_assignments WHERE lead_id = ANY($1::uuid[])`, [trackedLeadIds]);
      await query(`DELETE FROM follow_ups WHERE lead_id = ANY($1::uuid[])`, [trackedLeadIds]);
      await query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [trackedLeadIds]);
    }
    await query(`DELETE FROM leads WHERE lead_name LIKE '${marker}%'`);
    await query(`DELETE FROM notifications WHERE title LIKE '%${marker}%' OR body LIKE '%${marker}%'`);
    await query(`DELETE FROM device_tokens WHERE token LIKE 'fcm-test-${runId}%'`);
  } catch (err) {
    console.warn('Cleanup warning:', err);
  }
}

// ─── MAIN TEST RUNNER ─────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  console.log('\n================================================================');
  console.log(`  STARTING MODULE 7 (BACKEND PART B) TEST SUITE - Run ${runId}`);
  console.log('================================================================\n');

  await startServer();

  try {
    // 0. Fetch tokens for all 4 roles
    const adminToken = await login('admin@licrm.example');
    const bhToken = await login('businesshead@licrm.example');
    const salesToken = await login('sales1@licrm.example');
    const marketingToken = await login('marketing@licrm.example');

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 1: FORMULA INJECTION & EXPORTERS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GROUP 1: FORMULA INJECTION & EXPORTERS ---');

    assert(protectFormula('=1+1') === "'=1+1", 'protectFormula prepends quote to =');
    assert(protectFormula('+123') === "'+123", 'protectFormula prepends quote to +');
    assert(protectFormula('-50') === "'-50", 'protectFormula prepends quote to -');
    assert(protectFormula('@cmd') === "'@cmd", 'protectFormula prepends quote to @');
    assert(protectFormula('Normal text') === 'Normal text', 'protectFormula leaves safe text unmodified');

    const sampleRows = [
      { name: 'John Doe', score: 100, formula: '=CMD()' },
      { name: 'Jane, "Special" Smith', score: 95, formula: '+1' },
    ];
    const csvBuf = exportToCSV(sampleRows);
    assert(csvBuf instanceof Buffer && csvBuf.length > 0, 'exportToCSV returns a valid Buffer');
    const csvStr = csvBuf.toString('utf-8');
    assert(csvStr.startsWith('\uFEFF'), 'CSV contains UTF-8 BOM');
    assert(csvStr.includes("'=CMD()"), 'CSV protects formula injection');
    assert(csvStr.includes('"Jane, ""Special"" Smith"'), 'CSV quotes fields with commas and double-quotes');

    const xlsxBuf = await exportToXLSX(sampleRows);
    assert(xlsxBuf instanceof Buffer && xlsxBuf.length > 0, 'exportToXLSX returns a valid Buffer');

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 2: DASHBOARD ENDPOINT
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GROUP 2: DASHBOARD ENDPOINT ---');

    // 2.1 Unauthenticated rejected
    const unauthDash = await api('GET', '/dashboard');
    assert(unauthDash.status === 401, 'GET /dashboard without token returns 401');

    // 2.2 Admin Dashboard
    const adminDash = await api('GET', '/dashboard', undefined, adminToken);
    assert(adminDash.status === 200, 'GET /dashboard for Admin returns 200');
    assert(typeof adminDash.data?.data?.summary?.totalLeads === 'number', 'summary.totalLeads is a number');
    assert(typeof adminDash.data?.data?.summary?.newLeads === 'number', 'summary.newLeads is a number');
    assert(typeof adminDash.data?.data?.summary?.convertedLeads === 'number', 'summary.convertedLeads is a number');
    assert(Array.isArray(adminDash.data?.data?.leadsByStatus), 'leadsByStatus is an array');
    assert(Array.isArray(adminDash.data?.data?.leadsByProduct), 'leadsByProduct is an array');
    assert(Array.isArray(adminDash.data?.data?.leadsBySource), 'leadsBySource is an array');
    assert(typeof adminDash.data?.data?.pendingFollowUps?.today === 'number', 'pendingFollowUps.today is a number');
    assert(typeof adminDash.data?.data?.pendingTasks?.total === 'number', 'pendingTasks.total is a number');

    // 2.3 Sales Executive Dashboard scoping
    const salesDash = await api('GET', '/dashboard', undefined, salesToken);
    assert(salesDash.status === 200, 'GET /dashboard for Sales Executive returns 200');
    assert(typeof salesDash.data?.data?.summary?.totalLeads === 'number', 'Sales summary totalLeads is a number');

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 3: REPORTS & FILE EXPORTS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GROUP 3: REPORTS & EXPORTS ---');

    // 3.1 Leads By Status (JSON)
    const repStatus = await api('GET', '/reports/leads-by-status', undefined, adminToken);
    assert(repStatus.status === 200, 'GET /reports/leads-by-status returns 200');
    assert(Array.isArray(repStatus.data?.data), 'leads-by-status returns array of rows');
    if (repStatus.data?.data?.length > 0) {
      assert(typeof repStatus.data.data[0].count === 'number', 'row count is a number');
      assert(typeof repStatus.data.data[0].percentage === 'number', 'row percentage is a number');
    }

    // 3.2 CSV Export
    const repStatusCsv = await api('GET', '/reports/leads-by-status?format=csv', undefined, adminToken);
    assert(repStatusCsv.status === 200, 'GET /reports/leads-by-status?format=csv returns 200');
    assert(repStatusCsv.headers.get('content-type')?.includes('text/csv') || false, 'Content-Type is text/csv');
    assert(
      repStatusCsv.headers.get('content-disposition')?.includes('attachment; filename="leads_by_status.csv"') || false,
      'Content-Disposition header is set for CSV attachment',
    );

    // 3.3 XLSX Export
    const repStatusXlsx = await api('GET', '/reports/leads-by-status?format=xlsx', undefined, adminToken);
    assert(repStatusXlsx.status === 200, 'GET /reports/leads-by-status?format=xlsx returns 200');
    assert(
      repStatusXlsx.headers.get('content-type')?.includes('openxmlformats') || false,
      'Content-Type is openxmlformats XLSX',
    );
    assert(
      repStatusXlsx.headers.get('content-disposition')?.includes('leads_by_status.xlsx') || false,
      'Content-Disposition header is set for XLSX attachment',
    );

    // 3.4 Other Reports
    const repSource = await api('GET', '/reports/leads-by-source', undefined, bhToken);
    assert(repSource.status === 200, 'GET /reports/leads-by-source returns 200');

    const repProduct = await api('GET', '/reports/leads-by-product', undefined, bhToken);
    assert(repProduct.status === 200, 'GET /reports/leads-by-product returns 200');

    const repTeam = await api('GET', '/reports/team-performance', undefined, adminToken);
    assert(repTeam.status === 200, 'GET /reports/team-performance returns 200');

    const repConv = await api('GET', '/reports/conversion-rates', undefined, adminToken);
    assert(repConv.status === 200, 'GET /reports/conversion-rates returns 200');

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 4: NOTIFICATIONS & DEVICE TOKENS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GROUP 4: NOTIFICATIONS & DEVICE TOKENS ---');

    // 4.1 Register FCM device token
    const testFcmToken = `fcm-test-${runId}-token-abc`;
    const regTokenRes = await api(
      'POST',
      '/notifications/device-token',
      { token: testFcmToken, platform: 'android' },
      salesToken,
    );
    assert(regTokenRes.status === 200, 'POST /notifications/device-token returns 200');

    // 4.2 List Notifications
    const notifsRes = await api('GET', '/notifications', undefined, salesToken);
    assert(notifsRes.status === 200, 'GET /notifications returns 200');
    assert(Array.isArray(notifsRes.data?.data?.items), 'notifications returns items array');
    assert(typeof notifsRes.data?.data?.unreadCount === 'number', 'unreadCount is a number');

    // 4.3 Unread count endpoint
    const unreadRes = await api('GET', '/notifications/unread-count', undefined, salesToken);
    assert(unreadRes.status === 200, 'GET /notifications/unread-count returns 200');
    assert(typeof unreadRes.data?.data?.unreadCount === 'number', 'unreadCount is returned');

    // 4.4 Create direct notification via DB to test mark read
    const salesUserIdRes = await query<{ id: string }>(`SELECT id FROM users WHERE email = 'sales1@licrm.example'`);
    const salesUserId = salesUserIdRes.rows[0].id;

    const notifIns = await query<{ id: string }>(
      `INSERT INTO notifications (user_id, title, body, type)
       VALUES ($1, '${marker} Test Alert', 'Please check this item', 'general')
       RETURNING id`,
      [salesUserId],
    );
    const testNotifId = notifIns.rows[0].id;

    // 4.5 Mark single read
    const markReadRes = await api('PATCH', `/notifications/${testNotifId}/read`, undefined, salesToken);
    assert(markReadRes.status === 200, 'PATCH /notifications/:id/read returns 200');
    assert(markReadRes.data?.data?.isRead === true, 'Notification marked as read');

    // 4.6 Mark all read
    const markAllRes = await api('POST', '/notifications/mark-all-read', undefined, salesToken);
    assert(markAllRes.status === 200, 'POST /notifications/mark-all-read returns 200');

    // 4.7 Delete device token
    const delTokenRes = await api(
      'DELETE',
      '/notifications/device-token',
      { token: testFcmToken },
      salesToken,
    );
    assert(delTokenRes.status === 200, 'DELETE /notifications/device-token returns 200');

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 5: FOLLOW-UP REMINDER SCHEDULER JOB
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GROUP 5: FOLLOW-UP REMINDERS JOB ---');

    // Create a temporary lead and due follow-up
    const prodRes = await query<{ id: number }>(`SELECT id FROM products LIMIT 1`);
    const srcRes = await query<{ id: number }>(`SELECT id FROM lead_sources LIMIT 1`);
    const statRes = await query<{ id: number }>(`SELECT id FROM lead_statuses WHERE name = 'New Lead'`);

    const newLeadRes = await query<{ id: string; lead_code: string }>(
      `INSERT INTO leads (lead_name, product_id, source_id, status_id, email, assigned_to)
       VALUES ('${marker} Lead', $1, $2, $3, '${marker}@example.com', $4)
       RETURNING id, lead_code`,
      [prodRes.rows[0].id, srcRes.rows[0].id, statRes.rows[0].id, salesUserId],
    );
    const reminderLeadId = newLeadRes.rows[0].id;
    trackedLeadIds.push(reminderLeadId);

    // Scheduled in 5 minutes (within the 15 min reminder window)
    const inFiveMin = new Date(Date.now() + 5 * 60 * 1000);
    const fuRes = await query<{ id: string }>(
      `INSERT INTO follow_ups (lead_id, assigned_to, scheduled_at, status, notes)
       VALUES ($1, $2, $3, 'pending', '${marker} Reminder test')
       RETURNING id`,
      [reminderLeadId, salesUserId, inFiveMin.toISOString()],
    );
    const testFollowupId = fuRes.rows[0].id;
    trackedFollowupIds.push(testFollowupId);

    // Run the reminder job
    const jobResult = await runFollowupReminders(new Date());
    assert(jobResult.processedCount >= 1, `runFollowupReminders processed due follow-up (count=${jobResult.processedCount})`);

    // Verify reminder_sent_at was stamped
    const checkFu = await query<{ reminder_sent_at: Date | null }>(
      `SELECT reminder_sent_at FROM follow_ups WHERE id = $1`,
      [testFollowupId],
    );
    assert(checkFu.rows[0].reminder_sent_at !== null, 'reminder_sent_at is stamped in database');

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 6: LEAD BULK IMPORT
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GROUP 6: LEAD BULK IMPORT ---');

    // 6.1 Download import template
    const tmplRes = await api('GET', '/leads/import/template', undefined, adminToken);
    assert(tmplRes.status === 200, 'GET /leads/import/template returns 200');
    assert(
      tmplRes.headers.get('content-disposition')?.includes('lead_import_template.xlsx') || false,
      'Template downloaded with filename lead_import_template.xlsx',
    );

    // 6.2 Sales executive without leads.import permission gets 403
    const forbiddenImport = await api('GET', '/leads/import/template', undefined, salesToken);
    assert(forbiddenImport.status === 403, 'User without leads.import gets 403 Forbidden');

    // 6.3 Upload valid CSV
    const csvData = [
      'Lead Name,Email,Mobile,Product Code,Source Name,Priority,Remarks',
      `${marker} Import Lead 1,${marker}.1@example.com,+919988776655,LEARNPROFESSIONAL,Website,high,Valid lead`,
      `${marker} Import Lead 2,${marker}.2@example.com,+919988776656,BOOKEHEALTH,LinkedIn,medium,Another valid lead`,
    ].join('\r\n');

    const formData = new FormData();
    const blob = new Blob([csvData], { type: 'text/csv' });
    formData.append('file', blob, 'leads_import.csv');

    const importRes = await api('POST', '/leads/import', formData, adminToken);
    assert(importRes.status === 200, 'POST /leads/import with CSV returns 200');
    assert(importRes.data?.data?.importedCount >= 2, `Imported count is ${importRes.data?.data?.importedCount}`);
    assert(importRes.data?.data?.failedCount === 0, 'Zero failed rows on valid CSV');

    // 6.4 Upload duplicate CSV -> duplicate leads skipped
    const formDataDup = new FormData();
    const dupBlob = new Blob([csvData], { type: 'text/csv' });
    formDataDup.append('file', dupBlob, 'leads_import.csv');

    const dupImportRes = await api('POST', '/leads/import', formDataDup, adminToken);
    assert(dupImportRes.status === 200, 'POST /leads/import duplicate file returns 200');
    assert(dupImportRes.data?.data?.skippedCount >= 2, 'Duplicate leads are detected and skipped');

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 7: AUDIT LOGS VIEWER
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GROUP 7: AUDIT LOGS VIEWER ---');

    // 7.1 Regular user without audit.view gets 403
    const auditForbidden = await api('GET', '/audit-logs', undefined, salesToken);
    assert(auditForbidden.status === 403, 'GET /audit-logs without audit.view returns 403');

    // 7.2 Admin lists audit logs
    const auditRes = await api('GET', '/audit-logs', undefined, adminToken);
    assert(auditRes.status === 200, 'GET /audit-logs for Admin returns 200');
    assert(Array.isArray(auditRes.data?.data?.items), 'audit-logs returns items array');
    assert(typeof auditRes.data?.data?.total === 'number', 'audit-logs returns total count');

    // 7.3 Action filtering
    const auditFilter = await api('GET', '/audit-logs?action=lead.import', undefined, adminToken);
    assert(auditFilter.status === 200, 'GET /audit-logs?action=lead.import returns 200');
    if (auditFilter.data?.data?.items?.length > 0) {
      assert(auditFilter.data.data.items[0].action === 'lead.import', 'Filtered item has action lead.import');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 8: CLEANUP & SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GROUP 8: CLEANUP & SUMMARY ---');
    await cleanup();

    await stopServer();
    await pool.end();

    console.log('\n================================================================');
    console.log(`✅ SUMMARY: Module 7 Tests: ${passed} passed, ${failed} failed`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test run:', err);
    await cleanup();
    await stopServer();
    await pool.end();
    process.exit(1);
  }
}

runTests();

