import bcrypt from "bcryptjs";
import pool from "../config/database";
import { env } from "../config/env";

export async function runSeeds() {
  console.log("Seeding database with roles and test accounts for all 4 roles...");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Ensure the 4 roles exist in roles table
    const rolesToSeed = [
      { code: "admin", name: "Admin", description: "Full administrative system access" },
      { code: "business_head", name: "Business Head", description: "Business unit lead access" },
      { code: "sales_executive", name: "Sales Executive", description: "Sales and deal pipeline operations" },
      { code: "marketing_executive", name: "Marketing Executive", description: "Lead generation and marketing campaigns" },
    ];

    const roleMap: Record<string, string> = {};

    for (const r of rolesToSeed) {
      const res = await client.query(
        `INSERT INTO roles (code, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (code)
         DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
         RETURNING id, code, name;`,
        [r.code, r.name, r.description]
      );
      const row = res.rows[0];
      roleMap[row.code] = row.id;
      console.log(`✓ Role ready: ${row.name} (${row.code}) -> ID: ${row.id}`);
    }

    // 2. Hash passwords
    const saltRounds = env.bcrypt.saltRounds;
    const adminHash = await bcrypt.hash(env.seed.adminPassword, saltRounds);
    const sampleHash = await bcrypt.hash(env.seed.samplePassword, saltRounds);

    // 3. Test accounts for the 4 roles
    const testUsers = [
      {
        email: env.seed.adminEmail, // admin@licrm.example
        passwordHash: adminHash,
        firstName: "System",
        lastName: "Administrator",
        phone: "+91-9876543210",
        roleId: roleMap["admin"],
        roleCode: "admin",
      },
      {
        email: "businesshead@licrm.example",
        passwordHash: sampleHash,
        firstName: "Rajesh",
        lastName: "Sharma",
        phone: "+91-9876543211",
        roleId: roleMap["business_head"],
        roleCode: "business_head",
      },
      {
        email: "sales@licrm.example",
        passwordHash: sampleHash,
        firstName: "Pooja",
        lastName: "Verma",
        phone: "+91-9876543212",
        roleId: roleMap["sales_executive"],
        roleCode: "sales_executive",
      },
      {
        email: "marketing@licrm.example",
        passwordHash: sampleHash,
        firstName: "Karan",
        lastName: "Mehta",
        phone: "+91-9876543213",
        roleId: roleMap["marketing_executive"],
        roleCode: "marketing_executive",
      },
    ];

    for (const u of testUsers) {
      await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (email)
         DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            phone = EXCLUDED.phone,
            role_id = EXCLUDED.role_id,
            is_active = true,
            updated_at = NOW();`,
        [u.email, u.passwordHash, u.firstName, u.lastName, u.phone, u.roleId]
      );
      console.log(`✓ Test Account ready: ${u.email} [Role: ${u.roleCode}]`);
    }

    await client.query("COMMIT");
    console.log("\nDatabase seeded successfully with all 4 roles!");
    console.log("--------------------------------------------------");
    console.log(`1. Admin:               ${env.seed.adminEmail} / ${env.seed.adminPassword}`);
    console.log(`2. Business Head:       businesshead@licrm.example / ${env.seed.samplePassword}`);
    console.log(`3. Sales Executive:     sales@licrm.example / ${env.seed.samplePassword}`);
    console.log(`4. Marketing Executive: marketing@licrm.example / ${env.seed.samplePassword}`);
    console.log("--------------------------------------------------\n");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seeding failed:", error);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runSeeds()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
