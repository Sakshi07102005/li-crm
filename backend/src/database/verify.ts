import { Client } from 'pg';
import { withClient } from './tasks';

const EXPECTED_TABLES = [
  'roles', 'permissions', 'role_permissions', 'users', 'refresh_tokens',
  'products', 'lead_sources', 'lead_statuses', 'lead_status_transitions',
  'companies', 'contacts', 'leads', 'lead_assignments',
  'follow_ups', 'tasks', 'activities',
  'notifications', 'device_tokens', 'audit_logs',
];

let passed = 0;
let failed = 0;

function check(ok: boolean, label: string, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ' -> ' + detail : ''}`);
  }
}

/** Runs fn inside a transaction that is ALWAYS rolled back, expecting a specific PG error code. */
async function expectError(
  client: Client,
  label: string,
  expectedCode: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  await client.query('BEGIN');
  try {
    await fn();
    check(false, label, 'statement succeeded but should have failed');
  } catch (err) {
    const code = (err as { code?: string }).code;
    check(code === expectedCode, `${label} (error ${code})`, `expected ${expectedCode}`);
  } finally {
    await client.query('ROLLBACK');
  }
}

async function main(): Promise<void> {
  await withClient(async (db) => {
    console.log('\n1. Tables');
    const tables = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`);
    const names = new Set(tables.rows.map((r) => r.table_name as string));
    for (const t of EXPECTED_TABLES) check(names.has(t), `table ${t} exists`);
    check(names.has('schema_migrations'), 'table schema_migrations exists');

    console.log('\n2. Seed data');
    const count = async (sql: string): Promise<number> => Number((await db.query(sql)).rows[0].n);
    check((await count('SELECT COUNT(*) n FROM roles')) === 4, '4 roles');
    check((await count('SELECT COUNT(*) n FROM products')) === 3, '3 products');
    check((await count('SELECT COUNT(*) n FROM lead_statuses')) === 8, '8 lead statuses');
    check((await count('SELECT COUNT(*) n FROM lead_sources')) >= 5, 'lead sources present');
    check((await count('SELECT COUNT(*) n FROM permissions')) > 0, 'permissions present');
    check((await count('SELECT COUNT(*) n FROM role_permissions')) > 0, 'role_permissions present');
    const order = await db.query('SELECT name FROM lead_statuses ORDER BY sort_order');
    check(
      order.rows.map((r) => r.name).join('|') ===
        'New Lead|Contacted|Interested|Meeting Scheduled|Proposal Sent|Negotiation|Converted|Lost',
      'lead statuses are in the assignment order',
    );
    const perRole = await db.query(
      `SELECT r.code, COUNT(u.id)::int n FROM roles r LEFT JOIN users u ON u.role_id = r.id GROUP BY r.code`);
    for (const row of perRole.rows) check(row.n >= 1, `at least one user with role ${row.code}`);
    const hashes = await db.query(`SELECT COUNT(*)::int n FROM users WHERE password_hash !~ '^\\$2[aby]\\$'`);
    check(hashes.rows[0].n === 0, 'every password_hash is a bcrypt hash');

    console.log('\n3. Status workflow');
    const tr = async (a: string, b: string): Promise<boolean> =>
      (await db.query(
        `SELECT 1 FROM lead_status_transitions t
         JOIN lead_statuses f ON f.id = t.from_status_id
         JOIN lead_statuses s ON s.id = t.to_status_id
         WHERE f.name = $1 AND s.name = $2`, [a, b])).rowCount === 1;
    check(await tr('New Lead', 'Contacted'), 'New Lead -> Contacted allowed');
    check(await tr('Negotiation', 'Converted'), 'Negotiation -> Converted allowed');
    check(await tr('Contacted', 'Lost'), 'Contacted -> Lost allowed');
    check(!(await tr('New Lead', 'Converted')), 'New Lead -> Converted NOT allowed');
    check(!(await tr('Converted', 'New Lead')), 'Converted -> New Lead NOT allowed');
    check(!(await tr('Converted', 'Lost')), 'Converted -> Lost NOT allowed');

    // Fixtures for the constraint proofs
    const admin = (await db.query(
      `SELECT u.id, u.email FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'admin' LIMIT 1`)).rows[0];
    const productId = (await db.query('SELECT id FROM products LIMIT 1')).rows[0].id;
    const sourceId = (await db.query('SELECT id FROM lead_sources LIMIT 1')).rows[0].id;
    const statusId = (await db.query(`SELECT id FROM lead_statuses WHERE name = 'New Lead'`)).rows[0].id;
    const insertLead = (over: Record<string, unknown> = {}) => {
      const v = { name: 'Test Lead', email: 'proof@example.com', mobile: null, product: productId,
                  source: sourceId, status: statusId, priority: 'medium', ...over };
      return db.query(
        `INSERT INTO leads (lead_name, email, mobile, product_id, source_id, status_id, priority)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING lead_code`,
        [v.name, v.email, v.mobile, v.product, v.source, v.status, v.priority]);
    };

    console.log('\n4. Constraint proofs (every attempt is rolled back)');
    await expectError(db, 'duplicate user email (case-insensitive) rejected', '23505', () =>
      db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role_id)
         VALUES ($1, 'x', 'A', 'B', (SELECT id FROM roles LIMIT 1))`, [admin.email.toUpperCase()]));
    await expectError(db, 'lead with non-existent product rejected', '23503', () =>
      insertLead({ product: 32000 }));
    await expectError(db, 'lead with non-existent status rejected', '23503', () =>
      insertLead({ status: 32000 }));
    await expectError(db, 'lead with invalid priority rejected', '23514', () =>
      insertLead({ priority: 'urgent' }));
    await expectError(db, 'lead with neither email nor mobile rejected', '23514', () =>
      insertLead({ email: null, mobile: null }));
    await expectError(db, 'lead with malformed email rejected', '23514', () =>
      insertLead({ email: 'not-an-email' }));
    await expectError(db, 'follow-up with invalid status rejected', '23514', async () => {
      const lead = await insertLead();
      const id = (await db.query('SELECT id FROM leads WHERE lead_code = $1', [lead.rows[0].lead_code])).rows[0].id;
      await db.query(`INSERT INTO follow_ups (lead_id, scheduled_at, status) VALUES ($1, NOW(), 'maybe')`, [id]);
    });
    await expectError(db, 'two primary contacts for one company rejected', '23505', async () => {
      const c = await db.query(`INSERT INTO companies (name) VALUES ('Proof Co') RETURNING id`);
      await db.query(`INSERT INTO contacts (company_id, full_name, is_primary) VALUES ($1,'A',TRUE)`, [c.rows[0].id]);
      await db.query(`INSERT INTO contacts (company_id, full_name, is_primary) VALUES ($1,'B',TRUE)`, [c.rows[0].id]);
    });
    await expectError(db, 'duplicate company name (case-insensitive) rejected', '23505', async () => {
      await db.query(`INSERT INTO companies (name) VALUES ('Proof Co')`);
      await db.query(`INSERT INTO companies (name) VALUES ('PROOF CO')`);
    });

    console.log('\n5. Behaviour proofs (rolled back)');
    await db.query('BEGIN');
    try {
      const a = await insertLead({ email: 'dup@example.com' });
      const b = await insertLead({ email: 'DUP@example.com' });
      check(/^LI-LEAD-\d{6}$/.test(a.rows[0].lead_code), `lead code auto-generated (${a.rows[0].lead_code})`);
      check(a.rows[0].lead_code !== b.rows[0].lead_code, 'second lead gets a different code');
      const dupes = await db.query(`SELECT COUNT(*)::int n FROM leads WHERE LOWER(email) = 'dup@example.com'`);
      check(dupes.rows[0].n === 2, 'DB allows duplicate emails (API will warn instead)');
      const before = (await db.query('SELECT updated_at FROM users WHERE id = $1', [admin.id])).rows[0].updated_at;
      await db.query('SELECT pg_sleep(0.05)');
      await db.query('UPDATE users SET phone = phone WHERE id = $1', [admin.id]);
      const after = (await db.query('SELECT updated_at FROM users WHERE id = $1', [admin.id])).rows[0].updated_at;
      check(after > before, 'updated_at trigger fires on UPDATE');
    } finally {
      await db.query('ROLLBACK');
    }
  });

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Verification crashed:', err.message);
  process.exit(1);
});
