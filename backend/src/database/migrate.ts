import fs from "fs";
import path from "path";
import pool from "../config/database";

export async function runMigrations() {
  console.log("Starting database migrations...");
  const client = await pool.connect();

  try {
    // Determine migrations folder path
    const localMigrationsDir = path.join(__dirname, "migrations");
    const rootMigrationsDir = path.join(__dirname, "../../../database/migrations");
    const migrationsDir = fs.existsSync(localMigrationsDir)
      ? localMigrationsDir
      : rootMigrationsDir;

    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at ${migrationsDir}`);
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    console.log(`Found ${migrationFiles.length} migration file(s) in ${migrationsDir}`);

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");
      console.log(`Executing migration: ${file}...`);

      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log(`✓ Migration applied: ${file}`);
    }

    console.log("All migrations executed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

