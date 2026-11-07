import { pool } from './db/pool';

async function main() {
  console.log('=== QUERY 1: users + roles ===');
  const q1 = await pool.query(
    'SELECT u.id, u.email, r.code FROM users u JOIN roles r ON r.id = u.role_id ORDER BY r.id',
  );
  console.table(q1.rows);

  console.log('\n=== QUERY 2: refresh_tokens (recent 8) ===');
  const q2 = await pool.query(
    'SELECT user_id, revoked_at IS NOT NULL AS revoked, replaced_by_id IS NOT NULL AS replaced, created_at FROM refresh_tokens ORDER BY created_at DESC LIMIT 8',
  );
  console.table(q2.rows);

  console.log('\n=== QUERY 3: audit_logs (recent 10) ===');
  const q3 = await pool.query(
    'SELECT action, user_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10',
  );
  console.table(q3.rows);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

