/**
 * LI CRM demo data seeder.  DEMO DATA ONLY - clearly marked so it can be removed:
 *   leads:     email ends with @demo.licrm.example
 *   companies: website ends with .demo.example
 *   tasks:     title starts with "[Demo] "
 * Usage (from backend):  npm run seed:demo | npm run seed:demo:clean
 * Flags: --clean  remove demo data   --force  allow running when NODE_ENV=production
 */
import dotenv from 'dotenv';
import path from 'path';
import { Pool, PoolClient } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DOMAIN = 'demo.licrm.example';
const args = process.argv.slice(2);
const CLEAN = args.includes('--clean');
const FORCE = args.includes('--force');

if (process.env.NODE_ENV === 'production' && !FORCE) {
  console.error('Refusing to run in production without --force');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// ---- deterministic random numbers so the demo data is the same every run ----
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261112);
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
function weighted<T>(items: Array<[T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [item, w] of items) { r -= w; if (r <= 0) return item; }
  return items[items.length - 1][0];
}
const NOW = new Date();
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const clampPast = (d: Date) => (d.getTime() > NOW.getTime() - MIN ? ago(MIN) : d);

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Ananya', 'Diya', 'Isha', 'Kabir', 'Meera', 'Neha', 'Rohan', 'Saanvi', 'Tanvi', 'Arjun', 'Priya', 'Karan', 'Pooja', 'Rahul', 'Sneha', 'Vikram', 'Nisha', 'Amit', 'Kavya', 'Manish', 'Ritu'];
const LAST = ['Sharma', 'Patel', 'Mehta', 'Iyer', 'Nair', 'Reddy', 'Gupta', 'Singh', 'Kapoor', 'Joshi', 'Desai', 'Kulkarni', 'Verma', 'Bose', 'Menon'];
const DESIGNATIONS = ['Director', 'Head of Operations', 'Procurement Manager', 'Founder', 'IT Manager', 'Admissions Head', 'Medical Superintendent', 'Business Owner', 'Training Manager', 'Marketing Manager'];
const REMARKS = ['Asked for a callback next week', 'Interested in a demo', 'Comparing with a competitor', 'Budget approval pending', 'Needs a customised proposal', 'Referred by an existing customer', 'Wants pricing for 50 users', 'Requested a brochure by email'];
const LOST_REASONS = ['Budget constraints', 'Chose a competitor', 'No response after repeated follow-ups', 'Requirement postponed'];
const OUTCOMES = ['Spoke to decision maker', 'Left voicemail', 'Meeting confirmed', 'Requested more information', 'Asked to call back later'];
const COMPANIES: Array<[string, string, string, string]> = [
  ['Apex Learning Academy', 'Education', '51-200', 'Mumbai'],
  ['BrightPath Institute', 'Education', '11-50', 'Pune'],
  ['CityCare Hospital', 'Healthcare', '201-500', 'Mumbai'],
  ['Sunrise Clinic', 'Healthcare', '11-50', 'Nashik'],
  ['MedLine Diagnostics', 'Healthcare', '51-200', 'Thane'],
  ['Nova Software Solutions', 'IT', '51-200', 'Bengaluru'],
  ['CloudNest Technologies', 'IT', '201-500', 'Hyderabad'],
  ['FinEdge Capital', 'Finance', '51-200', 'Mumbai'],
  ['UrbanMart Retail', 'Retail', '501-1000', 'Delhi'],
  ['Orbit Logistics', 'Logistics', '201-500', 'Chennai'],
  ['GreenLeaf Foods', 'Manufacturing', '51-200', 'Ahmedabad'],
  ['Skyline Hospitality', 'Hospitality', '11-50', 'Goa'],
];
const usedMobiles = new Set<string>();
function mobile(): string {
  for (; ;) {
    const m = '+91' + int(6, 9) + String(int(0, 999999999)).padStart(9, '0');
    if (!usedMobiles.has(m)) { usedMobiles.add(m); return m; }
  }
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

async function clean(client: PoolClient): Promise<void> {
  await client.query('BEGIN');
  const leads = await client.query(`DELETE FROM leads WHERE email LIKE $1`, [`%@${DOMAIN}`]);
  const tasks = await client.query(`DELETE FROM tasks WHERE title LIKE '[Demo] %'`);
  const companies = await client.query(`DELETE FROM companies WHERE website LIKE '%.demo.example'`);
  await client.query('COMMIT');
  console.log(`Removed demo data: ${leads.rowCount} leads, ${tasks.rowCount} tasks, ${companies.rowCount} companies`);
}

async function seed(client: PoolClient): Promise<void> {
  const existing = await client.query(`SELECT COUNT(*)::int n FROM leads WHERE email LIKE $1`, [`%@${DOMAIN}`]);
  if (existing.rows[0].n >= 100) {
    console.log(`Demo data already present (${existing.rows[0].n} demo leads). Nothing changed.`);
    return;
  }

  const userRows = await client.query(
    `SELECT id, email FROM users WHERE email IN
     ('admin@licrm.example','businesshead@licrm.example','sales1@licrm.example','sales2@licrm.example','marketing@licrm.example')`);
  const uid = (email: string): string => {
    const row = userRows.rows.find((r) => r.email === email);
    if (!row) throw new Error(`Seeded user ${email} not found. Run npm run db:seed first.`);
    return row.id as string;
  };
  const admin = uid('admin@licrm.example'), bh = uid('businesshead@licrm.example');
  const sales1 = uid('sales1@licrm.example'), sales2 = uid('sales2@licrm.example');
  const marketing = uid('marketing@licrm.example');

  const products = (await client.query(`SELECT id, code FROM products WHERE is_active ORDER BY id`)).rows;
  const sources = (await client.query(`SELECT id, is_marketing FROM lead_sources WHERE is_active ORDER BY id`)).rows;
  const statusRows = (await client.query(`SELECT id, sort_order FROM lead_statuses ORDER BY sort_order`)).rows;
  const statusId = (sort: number): number => statusRows.find((r) => r.sort_order === sort)!.id as number;
  const productByCode = (code: string) => products.find((p) => p.code === code)!.id as number;

  await client.query('BEGIN');

  // ---- companies and contacts ----
  const companyIds: Array<{ id: string; name: string; industry: string; website: string }> = [];
  for (const [name, industry, size, location] of COMPANIES) {
    const website = `https://${slug(name)}.demo.example`;
    const c = await client.query(
      `INSERT INTO companies (name, website, industry, size, location, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
      [name, website, industry, size, location, admin]);
    if (c.rowCount === 0) continue; // a real company with this name already exists
    companyIds.push({ id: c.rows[0].id, name, industry, website });
    const contactCount = int(2, 3);
    for (let i = 0; i < contactCount; i++) {
      const first = pick(FIRST), last = pick(LAST);
      await client.query(
        `INSERT INTO contacts (company_id, full_name, designation, email, mobile, is_primary)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [c.rows[0].id, `${first} ${last}`, pick(DESIGNATIONS),
        `${first}.${last}${i}@${slug(name)}.demo.example`.toLowerCase(), mobile(), i === 0]);
    }
  }

  // ---- leads ----
  interface L { id: string; sort: number; assignedTo: string | null; createdBy: string; createdAt: Date }
  const leads: L[] = [];
  const LEAD_COUNT = 120;
  for (let i = 0; i < LEAD_COUNT; i++) {
    const sort = weighted<number>([[1, 25], [2, 20], [3, 15], [4, 10], [5, 8], [6, 7], [7, 9], [8, 6]]);
    const productCode = weighted<string>([['LEARNPROFESSIONAL', 35], ['BOOKEHEALTH', 30], ['LI', 35]]);
    const industry = productCode === 'LEARNPROFESSIONAL' ? 'Education'
      : productCode === 'BOOKEHEALTH' ? 'Healthcare'
        : pick(['IT', 'Finance', 'Retail', 'Logistics', 'Manufacturing', 'Hospitality']);
    const source = pick(sources);
    const ageDays = sort === 1 ? int(0, 25) : sort >= 7 ? int(25, 89) : int(5, 89);
    const createdAt = clampPast(new Date(NOW.getTime() - ageDays * DAY - int(0, 23) * HOUR - int(0, 59) * MIN));
    const changedAt = clampPast(new Date(createdAt.getTime() + int(1, 72) * HOUR));
    const convertedAt = sort === 7 ? clampPast(new Date(changedAt.getTime() + int(1, 20) * DAY)) : null;

    const createdBy = source.is_marketing && rand() < 0.5 ? marketing : pick([sales1, sales2, bh, admin]);
    // Converted leads must have an owner; marketing-created leads are often unassigned
    let assignedTo: string | null = weighted<string | null>([[sales1, 40], [sales2, 40], [bh, 20]]);
    if (sort !== 7 && (createdBy === marketing ? rand() < 0.4 : rand() < 0.12)) assignedTo = null;

    const first = pick(FIRST), last = pick(LAST);
    const matching = companyIds.filter((c) => c.industry === industry);
    const company = rand() < 0.7 ? (matching.length ? pick(matching) : pick(companyIds)) : null;
    const companyName = company ? company.name : `${pick(LAST)} ${pick(['Enterprises', 'Solutions', 'Group', 'Traders', 'Associates'])}`;

    const r = await client.query(
      `INSERT INTO leads (lead_name, company_id, company_name, email, mobile, website, industry,
                          product_id, source_id, assigned_to, priority, status_id, remarks, lost_reason,
                          converted_at, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [`${first} ${last}`, company ? company.id : null, companyName,
      `${first}.${last}.${i}@${DOMAIN}`.toLowerCase(), mobile(),
      company ? company.website : `https://${slug(companyName)}.demo.example`, industry,
      productByCode(productCode), source.id, assignedTo,
      weighted<string>([['high', 25], ['medium', 50], ['low', 25]]), statusId(sort),
      pick(REMARKS), sort === 8 ? pick(LOST_REASONS) : null,
        convertedAt, createdBy, createdAt, sort === 1 ? createdAt : changedAt]);
    const id = r.rows[0].id as string;
    leads.push({ id, sort, assignedTo, createdBy, createdAt });

    await client.query(
      `INSERT INTO activities (lead_id, user_id, type, subject, occurred_at, created_at)
       VALUES ($1,$2,'note','Lead created',$3,$3)`, [id, createdBy, createdAt]);
    if (assignedTo) {
      await client.query(
        `INSERT INTO lead_assignments (lead_id, assigned_from, assigned_to, assigned_by, reason, created_at)
         VALUES ($1,NULL,$2,$3,'Initial assignment',$4)`, [id, assignedTo, rand() < 0.5 ? bh : admin, createdAt]);
    }
    if (sort > 1) {
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, subject, old_status_id, new_status_id, occurred_at, created_at)
         VALUES ($1,$2,'status_change','Status changed',$3,$4,$5,$5)`,
        [id, assignedTo ?? createdBy, statusId(1), statusId(sort), changedAt]);
    }
  }

  // ---- follow-ups ----
  const addFollowUp = async (
    lead: L, scheduledAt: Date, status: 'pending' | 'completed' | 'missed',
  ): Promise<void> => {
    const owner = lead.assignedTo ?? lead.createdBy;
    const completedAt = status === 'completed' ? clampPast(new Date(scheduledAt.getTime() + int(10, 120) * MIN)) : null;
    await client.query(
      `INSERT INTO follow_ups (lead_id, assigned_to, scheduled_at, type, notes, status, outcome,
                               completed_at, reminder_sent_at, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [lead.id, owner, scheduledAt, pick(['call', 'call', 'email', 'meeting', 'whatsapp']),
        'Demo follow-up', status, status === 'pending' ? null : pick(OUTCOMES), completedAt,
      scheduledAt.getTime() <= NOW.getTime() ? scheduledAt : null, owner,
      new Date(Math.min(scheduledAt.getTime(), NOW.getTime()) - DAY)]);
    if (status !== 'pending') {
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, subject, outcome, occurred_at, created_at)
         VALUES ($1,$2,'follow_up',$3,$4,$5,$5)`,
        [lead.id, owner, status === 'completed' ? 'Follow-up completed' : 'Follow-up missed',
          null, completedAt ?? scheduledAt]);
    }
  };

  const openAssigned = leads.filter((l) => l.sort < 7 && l.assignedTo);
  const olderOpen = openAssigned.filter((l) => l.createdAt.getTime() < NOW.getTime() - 3 * DAY);
  const shuffled = <T,>(arr: T[]): T[] => [...arr].sort(() => rand() - 0.5);

  const overdue = shuffled(olderOpen).slice(0, 8);
  for (const l of overdue) {
    const when = new Date(NOW.getTime() - int(1, 9) * DAY);
    await addFollowUp(l, when.getTime() > l.createdAt.getTime() ? when : new Date(l.createdAt.getTime() + HOUR), 'pending');
  }
  const rest = shuffled(openAssigned.filter((l) => !overdue.includes(l)));
  for (const l of rest.slice(0, 8)) {              // due today
    const t = new Date(NOW); t.setHours(int(9, 19), pick([0, 30]), 0, 0);
    await addFollowUp(l, t, 'pending');
  }
  for (const l of rest.slice(8, 22)) {             // upcoming (next 14 days)
    const t = new Date(NOW.getTime() + int(1, 14) * DAY); t.setHours(int(9, 18), pick([0, 30]), 0, 0);
    await addFollowUp(l, t, 'pending');
  }
  const history = shuffled(leads.filter((l) => l.sort >= 2 && l.createdAt.getTime() < NOW.getTime() - 2 * DAY)).slice(0, 22);
  for (const l of history) {                       // completed / missed history on any lead past New Lead
    const from = l.createdAt.getTime() + DAY, to = NOW.getTime() - HOUR;
    if (from >= to) continue;
    await addFollowUp(l, new Date(from + rand() * (to - from)), rand() < 0.75 ? 'completed' : 'missed');
  }
  // keep each open lead's next_follow_up_at equal to its earliest pending follow-up
  await client.query(
    `UPDATE leads l SET next_follow_up_at = f.m
       FROM (SELECT lead_id, MIN(scheduled_at) m FROM follow_ups WHERE status = 'pending' GROUP BY lead_id) f
      WHERE l.id = f.lead_id AND l.email LIKE $1 AND l.status_id NOT IN ($2, $3)`,
    [`%@${DOMAIN}`, statusId(7), statusId(8)]);

  // ---- tasks ----
  const TITLES = ['Send proposal to {c}', 'Prepare demo for {c}', 'Follow up on pricing with {c}', 'Collect requirements from {c}', 'Schedule onboarding call with {c}', 'Share case study with {c}'];
  const assignees = [sales1, sales2, bh];
  for (let i = 0; i < 25; i++) {
    const assignee = pick(assignees);
    const forUser = leads.filter((l) => l.assignedTo === assignee && l.sort < 7);
    const lead = rand() < 0.7 && forUser.length ? pick(forUser) : null;
    const status = weighted<string>([['pending', 35], ['in_progress', 25], ['completed', 30], ['cancelled', 10]]);
    const due = new Date(NOW.getTime() + int(-10, 14) * DAY);
    const createdAt = new Date(Math.min(due.getTime(), NOW.getTime()) - int(1, 10) * DAY);
    await client.query(
      `INSERT INTO tasks (title, description, lead_id, assigned_to, assigned_by, due_date, priority, status, completed_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [`[Demo] ${pick(TITLES).replace('{c}', pick(COMPANIES)[0])}`, 'Demo task', lead ? lead.id : null,
        assignee, assignee === bh ? admin : bh, due, weighted<string>([['high', 25], ['medium', 50], ['low', 25]]), status,
      status === 'completed' ? clampPast(new Date(Math.min(due.getTime(), NOW.getTime()))) : null, createdAt]);
  }

  await client.query('COMMIT');

  const counts = await client.query(`
    SELECT (SELECT COUNT(*) FROM leads WHERE email LIKE $1)::int AS demo_leads,
           (SELECT COUNT(*) FROM companies WHERE website LIKE '%.demo.example')::int AS demo_companies,
           (SELECT COUNT(*) FROM contacts c JOIN companies co ON co.id = c.company_id WHERE co.website LIKE '%.demo.example')::int AS demo_contacts,
           (SELECT COUNT(*) FROM follow_ups f JOIN leads l ON l.id = f.lead_id WHERE l.email LIKE $1)::int AS demo_follow_ups,
           (SELECT COUNT(*) FROM tasks WHERE title LIKE '[Demo] %')::int AS demo_tasks`, [`%@${DOMAIN}`]);
  console.log('Demo data created:'); console.table(counts.rows[0]);
  const byStatus = await client.query(
    `SELECT s.name AS status, COUNT(*)::int AS leads FROM leads l JOIN lead_statuses s ON s.id = l.status_id
      WHERE l.email LIKE $1 GROUP BY s.name, s.sort_order ORDER BY s.sort_order`, [`%@${DOMAIN}`]);
  console.table(byStatus.rows);
}

(async () => {
  const client = await pool.connect();
  try {
    if (CLEAN) await clean(client); else await seed(client);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('Demo seed failed:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();