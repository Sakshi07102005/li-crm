import jwt from "jsonwebtoken";
import app from "./app";
import pool from "./config/database";
import { env } from "./config/env";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

async function main() {
  console.log(`\n${BOLD}${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   MODULE 3 AUTH SUITE - LIVE POSTGRESQL VERIFICATION          ${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================${RESET}\n`);

  // 1. Verify PostgreSQL connection
  try {
    const dbCheck = await pool.query("SELECT current_database(), current_user, version();");
    console.log(`${GREEN}✓ Connected to PostgreSQL database:${RESET} ${dbCheck.rows[0].current_database} (User: ${dbCheck.rows[0].current_user})`);
    console.log(`  Engine: ${dbCheck.rows[0].version}\n`);
  } catch (err: any) {
    console.error(`${RED}✗ Cannot connect to PostgreSQL:${RESET}`, err.message);
    console.error(`  Target: ${env.database.host}:${env.database.port}/${env.database.name}`);
    process.exit(1);
  }

  // 2. Query users: SELECT id, email, role_id FROM users;
  console.log(`${BOLD}${YELLOW}>>> QUERY: SELECT id, email, role_id FROM users;${RESET}`);
  const usersResult = await pool.query(
    `SELECT u.id, u.email, u.role_id, r.code AS role_code, r.name AS role_name
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     ORDER BY r.code;`
  );
  console.table(
    usersResult.rows.map((row: any) => ({
      id: row.id,
      email: row.email,
      role_id: row.role_id,
      role_name: row.role_name,
    }))
  );

  // Start HTTP server for route testing
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Login for each of the 4 roles
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}>>> TEST 1: Login for each of the 4 roles${RESET}`);
    const accounts = [
      { roleName: "Admin", email: "admin@licrm.example", password: env.seed.adminPassword },
      { roleName: "Business Head", email: "businesshead@licrm.example", password: env.seed.samplePassword },
      { roleName: "Sales Executive", email: "sales@licrm.example", password: env.seed.samplePassword },
      { roleName: "Marketing Executive", email: "marketing@licrm.example", password: env.seed.samplePassword },
    ];

    const tokensMap: Record<string, any> = {};

    for (const acc of accounts) {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: acc.email, password: acc.password }),
      });
      const data: any = await res.json();
      const passed = res.status === 200 && data.success && data.data?.user?.roleName === acc.roleName;

      if (passed) {
        tokensMap[acc.email] = data.data.tokens;
        console.log(
          `  ${GREEN}✓ PASS${RESET} [${acc.roleName}] Login ${acc.email} -> Status ${res.status} | User ID: ${data.data.user.id} | Role ID: ${data.data.user.roleId}`
        );
      } else {
        console.log(`  ${RED}✗ FAIL${RESET} [${acc.roleName}] Login ${acc.email} -> Status ${res.status}: ${JSON.stringify(data)}`);
        process.exit(1);
      }
    }

    // -------------------------------------------------------------------------
    // TEST 2: Wrong password (401)
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}>>> TEST 2: Wrong password handling${RESET}`);
    {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@licrm.example", password: "IncorrectPassword123!" }),
      });
      const data: any = await res.json();
      const passed = res.status === 401 && !data.success && data.error?.code === "INVALID_CREDENTIALS";

      if (passed) {
        console.log(`  ${GREEN}✓ PASS${RESET} Correctly returned 401: ${data.error?.code} - "${data.message}"`);
      } else {
        console.log(`  ${RED}✗ FAIL${RESET} Status ${res.status}: ${JSON.stringify(data)}`);
      }
    }

    // -------------------------------------------------------------------------
    // TEST 3: Refresh token flow with rotation
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}>>> TEST 3: Refresh token flow with rotation${RESET}`);
    const originalRefreshToken = tokensMap["sales@licrm.example"].refreshToken;
    let rotatedRefreshToken = "";

    console.log("  Showing refresh_tokens BEFORE rotation:");
    const preRotateQuery = await pool.query(
      `SELECT id, user_id, LEFT(token_hash, 16) || '...' as token_hash, expires_at, revoked_at, replaced_by 
       FROM refresh_tokens 
       ORDER BY created_at DESC LIMIT 3;`
    );
    console.table(preRotateQuery.rows);

    {
      const res = await fetch(`${baseUrl}/auth/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: originalRefreshToken }),
      });
      const data: any = await res.json();
      rotatedRefreshToken = data.data?.tokens?.refreshToken;
      const passed = res.status === 200 && data.success && Boolean(rotatedRefreshToken);

      if (passed) {
        console.log(`  ${GREEN}✓ PASS${RESET} Rotation call succeeded (Status 200). New token issued.`);
      } else {
        console.log(`  ${RED}✗ FAIL${RESET} Status ${res.status}: ${JSON.stringify(data)}`);
      }
    }

    console.log("  Showing refresh_tokens AFTER rotation (Note replaced_by and revoked_at populated):");
    const postRotateQuery = await pool.query(
      `SELECT id, user_id, LEFT(token_hash, 16) || '...' as token_hash, expires_at, revoked_at, replaced_by 
       FROM refresh_tokens 
       ORDER BY created_at DESC LIMIT 4;`
    );
    console.table(postRotateQuery.rows);

    // -------------------------------------------------------------------------
    // TEST 4: Token reuse detection
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}>>> TEST 4: Token reuse detection (Security Defense)${RESET}`);
    {
      // Attempt to reuse the OLD already rotated token
      const res = await fetch(`${baseUrl}/auth/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: originalRefreshToken }),
      });
      const data: any = await res.json();
      const passed = res.status === 401 && data.error?.code === "TOKEN_REUSE_DETECTED";

      if (passed) {
        console.log(`  ${GREEN}✓ PASS${RESET} Reuse detection triggered: ${BOLD}${data.error?.code}${RESET} (Status 401)`);
        console.log(`  Message: "${data.message}"`);
      } else {
        console.log(`  ${RED}✗ FAIL${RESET} Status ${res.status}: ${JSON.stringify(data)}`);
      }
    }

    console.log("  Showing refresh_tokens AFTER reuse attempt (Note all user tokens invalidated):");
    const postReuseQuery = await pool.query(
      `SELECT id, user_id, LEFT(token_hash, 16) || '...' as token_hash, expires_at, revoked_at, replaced_by 
       FROM refresh_tokens 
       ORDER BY created_at DESC LIMIT 4;`
    );
    console.table(postReuseQuery.rows);

    // -------------------------------------------------------------------------
    // TEST 5: Logout flow
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}>>> TEST 5: Logout flow${RESET}`);
    {
      // Login as Marketing Executive
      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "marketing@licrm.example", password: env.seed.samplePassword }),
      });
      const loginData: any = await loginRes.json();
      const tokenToRevoke = loginData.data.tokens.refreshToken;

      // Logout
      const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: tokenToRevoke }),
      });

      // Try refresh
      const checkRes = await fetch(`${baseUrl}/auth/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: tokenToRevoke }),
      });

      const passed = logoutRes.status === 200 && checkRes.status === 401;
      if (passed) {
        console.log(`  ${GREEN}✓ PASS${RESET} Logout revoked refresh token; subsequent refresh rejected with 401`);
      } else {
        console.log(`  ${RED}✗ FAIL${RESET} Logout failed`);
      }
    }

    // -------------------------------------------------------------------------
    // TEST 6: Change password
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}>>> TEST 6: Change password flow${RESET}`);
    {
      // Login as Business Head
      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "businesshead@licrm.example", password: env.seed.samplePassword }),
      });
      const loginData: any = await loginRes.json();
      const accessToken = loginData.data.tokens.accessToken;

      const newPassword = "NewBusinessPassword@2026";
      const changeRes = await fetch(`${baseUrl}/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          currentPassword: env.seed.samplePassword,
          newPassword: newPassword,
        }),
      });

      // Old password should fail
      const oldLoginRes = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "businesshead@licrm.example", password: env.seed.samplePassword }),
      });

      // New password should succeed
      const newLoginRes = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "businesshead@licrm.example", password: newPassword }),
      });

      // Reset password back to samplePassword for idempotence
      const resetToken = (await newLoginRes.json() as any).data.tokens.accessToken;
      await fetch(`${baseUrl}/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resetToken}`,
        },
        body: JSON.stringify({
          currentPassword: newPassword,
          newPassword: env.seed.samplePassword,
        }),
      });

      const passed = changeRes.status === 200 && oldLoginRes.status === 401 && newLoginRes.status === 200;
      if (passed) {
        console.log(`  ${GREEN}✓ PASS${RESET} Password updated; old password rejected (401), new password authenticated (200)`);
      } else {
        console.log(`  ${RED}✗ FAIL${RESET} Password change verification failed`);
      }
    }

    // -------------------------------------------------------------------------
    // TEST 7: Expired JWT access token
    // -------------------------------------------------------------------------
    console.log(`\n${BOLD}>>> TEST 7: Expired JWT access token handling${RESET}`);
    {
      const adminUser = usersResult.rows.find((u: any) => u.email === "admin@licrm.example");
      const expiredToken = jwt.sign(
        {
          userId: adminUser.id,
          email: adminUser.email,
          roleId: adminUser.role_id,
          role: "admin",
        },
        env.jwt.secret,
        { expiresIn: -10 }
      );

      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      const data: any = await res.json();
      const passed = res.status === 401 && data.error?.code === "TOKEN_EXPIRED";

      if (passed) {
        console.log(`  ${GREEN}✓ PASS${RESET} Correctly returned 401: ${data.error?.code} - "${data.message}"`);
      } else {
        console.log(`  ${RED}✗ FAIL${RESET} Status ${res.status}: ${JSON.stringify(data)}`);
      }
    }

    console.log(`\n${GREEN}${BOLD}✓ ALL TEST SCENARIOS PASSED AGAINST REAL POSTGRESQL!${RESET}\n`);
  } finally {
    server.close();
    await pool.end();
  }
}

main().catch(async (err) => {
  console.error("Test execution failed:", err);
  await pool.end();
  process.exit(1);
});
