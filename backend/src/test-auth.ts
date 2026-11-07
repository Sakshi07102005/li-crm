process.env.NODE_ENV = 'test';

import { Server } from 'http';
import { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import app from './app';
import { env } from './config/env';
import { pool, query } from './db/pool';
import { sha256 } from './utils/crypto';

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  httpStatus?: number;
  expectedStatus?: number;
  detail?: string;
}

const results: TestResult[] = [];

function record(
  num: number,
  name: string,
  passed: boolean,
  httpStatus?: number,
  expectedStatus?: number,
  detail?: string,
) {
  results.push({ num, name, passed, httpStatus, expectedStatus, detail });
  const statusStr = httpStatus ? ` (HTTP ${httpStatus})` : '';
  if (passed) {
    console.log(`  PASS [${num}] ${name}${statusStr}`);
  } else {
    console.log(
      `  FAIL [${num}] ${name}${statusStr}${detail ? ' -> ' + detail : ''}`,
    );
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('       MODULE 3 AUTH SUITE - REAL POSTGRESQL & HTTP FETCH       ');
  console.log('================================================================\n');

  // Verify DB connectivity
  try {
    const dbCheck = await query('SELECT current_database() AS db, NOW() AS ts');
    console.log(` Connected to live database: ${dbCheck.rows[0].db} (${dbCheck.rows[0].ts.toISOString()})`);
  } catch (err: any) {
    console.error(` CRITICAL: Unable to reach PostgreSQL: ${err.message}`);
    process.exit(1);
  }

  // Start real Express app on ephemeral port
  const server: Server = app.listen(0);
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  console.log(` Test server running on ${baseUrl}\n`);

  const apiFetch = async (
    url: string,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers || {});
    headers.set('x-test-suite', 'true');
    return fetch(url, {
      ...init,
      headers,
    });
  };

  const throwawayEmails: string[] = [];

  try {
    // -------------------------------------------------------------
    // Test 1: Health check
    // -------------------------------------------------------------
    {
      const res = await apiFetch(`${baseUrl}/health`);
      const body = (await res.json()) as any;
      const ok =
        res.status === 200 &&
        body.success === true &&
        body.data?.database === 'up' &&
        body.data?.status === 'healthy';
      record(
        1,
        'health shows database up and healthy',
        ok,
        res.status,
        200,
        JSON.stringify(body),
      );
    }

    // -------------------------------------------------------------
    // Test 2: Login success for all 4 seeded roles (check roleCode in /me)
    // -------------------------------------------------------------
    {
      const rolesToTest = [
        {
          code: 'admin',
          email: env.seed.adminEmail,
          password: env.seed.adminPassword,
        },
        {
          code: 'business_head',
          email: 'businesshead@licrm.example',
          password: env.seed.samplePassword,
        },
        {
          code: 'sales_executive',
          email: 'sales1@licrm.example',
          password: env.seed.samplePassword,
        },
        {
          code: 'marketing_executive',
          email: 'marketing@licrm.example',
          password: env.seed.samplePassword,
        },
      ];

      let allRolesPassed = true;
      let lastStatus = 200;

      for (const r of rolesToTest) {
        const loginRes = await apiFetch(`${baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: r.email, password: r.password }),
        });
        lastStatus = loginRes.status;
        const loginBody = (await loginRes.json()) as any;

        if (loginRes.status !== 200 || !loginBody.data?.tokens?.accessToken) {
          allRolesPassed = false;
          console.log(`    Failed login for ${r.code}: ${JSON.stringify(loginBody)}`);
          break;
        }

        const meRes = await apiFetch(`${baseUrl}/auth/me`, {
          headers: {
            Authorization: `Bearer ${loginBody.data.tokens.accessToken}`,
          },
        });
        const meBody = (await meRes.json()) as any;

        if (meRes.status !== 200 || meBody.data?.role?.code !== r.code) {
          allRolesPassed = false;
          console.log(
            `    /me role mismatch for ${r.code}: expected ${r.code}, got ${meBody.data?.role?.code}`,
          );
          break;
        }
      }

      record(
        2,
        'login success for all 4 seeded roles & /me role verification',
        allRolesPassed,
        lastStatus,
        200,
      );
    }

    // -------------------------------------------------------------
    // Test 3: Wrong password 401; unknown email returns identical message
    // -------------------------------------------------------------
    {
      const wrongPwRes = await apiFetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: env.seed.adminEmail,
          password: 'CompletelyWrongPassword!999',
        }),
      });
      const wrongPwBody = (await wrongPwRes.json()) as any;

      const unknownEmailRes = await apiFetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent-random-user-999@licrm.example',
          password: 'CompletelyWrongPassword!999',
        }),
      });
      const unknownEmailBody = (await unknownEmailRes.json()) as any;

      const ok =
        wrongPwRes.status === 401 &&
        unknownEmailRes.status === 401 &&
        wrongPwBody.error?.code === 'INVALID_CREDENTIALS' &&
        unknownEmailBody.error?.code === 'INVALID_CREDENTIALS' &&
        wrongPwBody.message === unknownEmailBody.message;

      record(
        3,
        'wrong password 401 & unknown email returns identical message',
        ok,
        wrongPwRes.status,
        401,
        `wrongPw=${wrongPwBody.message}, unknown=${unknownEmailBody.message}`,
      );
    }

    // -------------------------------------------------------------
    // Test 4: Validation errors on login and register (400 with details)
    // -------------------------------------------------------------
    {
      const badLoginRes = await apiFetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });
      const badLoginBody = (await badLoginRes.json()) as any;

      const badRegisterRes = await apiFetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'valid@example.com', password: 'short' }),
      });
      const badRegisterBody = (await badRegisterRes.json()) as any;

      const ok =
        badLoginRes.status === 400 &&
        badLoginBody.error?.code === 'VALIDATION_ERROR' &&
        Array.isArray(badLoginBody.error?.details) &&
        badRegisterRes.status === 400 &&
        badRegisterBody.error?.code === 'VALIDATION_ERROR' &&
        Array.isArray(badRegisterBody.error?.details);

      record(
        4,
        'validation errors on login and register (400 with field details)',
        ok,
        badLoginRes.status,
        400,
      );
    }

    // -------------------------------------------------------------
    // Test 5: Register creates marketing_executive; extra role rejected 400; duplicate 409
    // -------------------------------------------------------------
    const regEmail = `throwaway-reg-${Date.now()}@example.com`;
    throwawayEmails.push(regEmail);
    let regAccessToken = '';
    let regRefreshToken = '';

    {
      // 5a. Extra role field rejected 400
      const extraRoleRes = await apiFetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail,
          password: 'Password@123',
          firstName: 'Test',
          lastName: 'User',
          role: 'admin',
        }),
      });
      const extraRoleBody = (await extraRoleRes.json()) as any;

      // 5b. Valid register
      const validRegRes = await apiFetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail,
          password: 'Password@123',
          firstName: 'Test',
          lastName: 'User',
          phone: '+91-9876543210',
        }),
      });
      const validRegBody = (await validRegRes.json()) as any;
      regAccessToken = validRegBody.data?.tokens?.accessToken;
      regRefreshToken = validRegBody.data?.tokens?.refreshToken;

      // 5c. Duplicate email (case-insensitive) -> 409
      const dupRes = await apiFetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail.toUpperCase(),
          password: 'Password@123',
          firstName: 'Test',
          lastName: 'User',
        }),
      });
      const dupBody = (await dupRes.json()) as any;

      const ok =
        extraRoleRes.status === 400 &&
        extraRoleBody.error?.code === 'VALIDATION_ERROR' &&
        validRegRes.status === 201 &&
        validRegBody.data?.user?.role?.code === 'marketing_executive' &&
        dupRes.status === 409 &&
        dupBody.error?.code === 'EMAIL_ALREADY_EXISTS';

      record(
        5,
        'register creates marketing_executive; extra field rejected 400; duplicate 409',
        ok,
        validRegRes.status,
        201,
      );
    }

    // -------------------------------------------------------------
    // Test 6: /me without token 401; with token 200; permissions present, no password_hash
    // -------------------------------------------------------------
    {
      const noTokenRes = await apiFetch(`${baseUrl}/auth/me`);
      const noTokenBody = (await noTokenRes.json()) as any;

      const withTokenRes = await apiFetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${regAccessToken}` },
      });
      const withTokenBody = (await withTokenRes.json()) as any;

      const ok =
        noTokenRes.status === 401 &&
        noTokenBody.error?.code === 'UNAUTHORIZED' &&
        withTokenRes.status === 200 &&
        Array.isArray(withTokenBody.data?.permissions) &&
        withTokenBody.data?.permissions.length > 0 &&
        !('password_hash' in withTokenBody.data) &&
        !('password' in withTokenBody.data);

      record(
        6,
        '/me without token 401; with token 200 (includes permissions, no password_hash)',
        ok,
        withTokenRes.status,
        200,
      );
    }

    // -------------------------------------------------------------
    // Test 7: PUT /me updates allowed fields; attempt to send role/email is rejected
    // -------------------------------------------------------------
    {
      const tryRoleRes = await apiFetch(`${baseUrl}/auth/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regAccessToken}`,
        },
        body: JSON.stringify({ role: 'admin' }),
      });

      const tryEmailRes = await apiFetch(`${baseUrl}/auth/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regAccessToken}`,
        },
        body: JSON.stringify({ email: 'newemail@example.com' }),
      });

      const validUpdateRes = await apiFetch(`${baseUrl}/auth/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regAccessToken}`,
        },
        body: JSON.stringify({
          firstName: 'UpdatedFirst',
          lastName: 'UpdatedLast',
          phone: '+91-1122334455',
        }),
      });
      const validUpdateBody = (await validUpdateRes.json()) as any;

      const ok =
        tryRoleRes.status === 400 &&
        tryEmailRes.status === 400 &&
        validUpdateRes.status === 200 &&
        validUpdateBody.data?.firstName === 'UpdatedFirst' &&
        validUpdateBody.data?.lastName === 'UpdatedLast' &&
        validUpdateBody.data?.phone === '+91-1122334455';

      record(
        7,
        'PUT /me updates allowed fields; attempt to send role/email is rejected',
        ok,
        validUpdateRes.status,
        200,
      );
    }

    // -------------------------------------------------------------
    // Test 8: Refresh rotation: new token works, old token marked revoked & replaced_by_id set
    // -------------------------------------------------------------
    let rotatedRefreshToken = '';
    {
      const oldTokenHash = sha256(regRefreshToken);

      const rotateRes = await apiFetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: regRefreshToken }),
      });
      const rotateBody = (await rotateRes.json()) as any;
      rotatedRefreshToken = rotateBody.data?.refreshToken;
      const newAccessToken = rotateBody.data?.accessToken;

      // Query DB for old token record
      const dbOldToken = await query(
        'SELECT revoked_at, replaced_by_id FROM refresh_tokens WHERE token_hash = $1',
        [oldTokenHash],
      );

      // Verify new access token works
      const meCheckRes = await apiFetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${newAccessToken}` },
      });

      const ok =
        rotateRes.status === 200 &&
        Boolean(rotatedRefreshToken) &&
        dbOldToken.rows.length === 1 &&
        dbOldToken.rows[0].revoked_at !== null &&
        dbOldToken.rows[0].replaced_by_id !== null &&
        meCheckRes.status === 200;

      record(
        8,
        'refresh rotation: new token works, old marked revoked and replaced_by_id set',
        ok,
        rotateRes.status,
        200,
      );
    }

    // -------------------------------------------------------------
    // Test 9: Reuse detection: reusing old token -> TOKEN_REUSE_DETECTED & new token stops working
    // -------------------------------------------------------------
    {
      // Attempt to reuse regRefreshToken (which was already rotated)
      const reuseRes = await apiFetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: regRefreshToken }),
      });
      const reuseBody = (await reuseRes.json()) as any;

      // Now verify that the new token was ALSO revoked in DB
      const newTokenHash = sha256(rotatedRefreshToken);
      const dbNewToken = await query(
        'SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1',
        [newTokenHash],
      );

      // Refreshing with the new token should now also fail
      const tryNewTokenRes = await apiFetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rotatedRefreshToken }),
      });

      const ok =
        reuseRes.status === 401 &&
        reuseBody.error?.code === 'TOKEN_REUSE_DETECTED' &&
        dbNewToken.rows.length === 1 &&
        dbNewToken.rows[0].revoked_at !== null &&
        tryNewTokenRes.status === 401;

      record(
        9,
        'reuse detection: reusing old token -> TOKEN_REUSE_DETECTED & all tokens revoked',
        ok,
        reuseRes.status,
        401,
      );
    }

    // -------------------------------------------------------------
    // Test 10: Logout revokes token, refresh afterwards fails, logout twice still 200
    // -------------------------------------------------------------
    {
      // Login to get a fresh refresh token
      const loginRes = await apiFetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: env.seed.adminEmail,
          password: env.seed.adminPassword,
        }),
      });
      const loginBody = (await loginRes.json()) as any;
      const logoutToken = loginBody.data?.tokens?.refreshToken;

      // Logout 1
      const logout1Res = await apiFetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: logoutToken }),
      });

      // Refresh with revoked token should fail
      const refreshAttempt = await apiFetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: logoutToken }),
      });

      // Logout 2 (idempotent)
      const logout2Res = await apiFetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: logoutToken }),
      });

      const ok =
        logout1Res.status === 200 &&
        refreshAttempt.status === 401 &&
        logout2Res.status === 200;

      record(
        10,
        'logout revokes token, refresh afterwards fails, logout twice still 200',
        ok,
        logout1Res.status,
        200,
      );
    }

    // -------------------------------------------------------------
    // Test 11: Change password: old password fails, new works, all earlier refresh tokens revoked
    // -------------------------------------------------------------
    {
      const pwdEmail = `throwaway-pwd-${Date.now()}@example.com`;
      throwawayEmails.push(pwdEmail);

      // Register throwaway user
      const regRes = await apiFetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pwdEmail,
          password: 'OldPassword@123',
          firstName: 'Pwd',
          lastName: 'Test',
        }),
      });
      const regBody = (await regRes.json()) as any;
      const token = regBody.data?.tokens?.accessToken;
      const oldRefresh = regBody.data?.tokens?.refreshToken;

      // Wrong current password -> 401
      const wrongCurrentRes = await apiFetch(`${baseUrl}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: 'WrongOldPassword@123',
          newPassword: 'BrandNewPassword@123',
        }),
      });

      // Correct current password -> 200
      const correctChangeRes = await apiFetch(`${baseUrl}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: 'OldPassword@123',
          newPassword: 'BrandNewPassword@123',
        }),
      });

      // Verify old refresh token is now revoked
      const oldRefreshDb = await query(
        'SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1',
        [sha256(oldRefresh)],
      );

      // Try login with old password -> 401
      const oldLoginRes = await apiFetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pwdEmail,
          password: 'OldPassword@123',
        }),
      });

      // Try login with new password -> 200
      const newLoginRes = await apiFetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pwdEmail,
          password: 'BrandNewPassword@123',
        }),
      });

      const ok =
        wrongCurrentRes.status === 401 &&
        correctChangeRes.status === 200 &&
        oldRefreshDb.rows[0]?.revoked_at !== null &&
        oldLoginRes.status === 401 &&
        newLoginRes.status === 200;

      record(
        11,
        'change password: old password fails, new works, earlier refresh tokens revoked',
        ok,
        correctChangeRes.status,
        200,
      );
    }

    // -------------------------------------------------------------
    // Test 12: Expired access token -> TOKEN_EXPIRED
    // -------------------------------------------------------------
    {
      const expiredToken = jwt.sign(
        { sub: '00000000-0000-0000-0000-000000000000', role: 'admin' },
        env.jwt.accessSecret,
        { expiresIn: -10 }, // expired 10s ago
      );

      const res = await apiFetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      const body = (await res.json()) as any;

      const ok = res.status === 401 && body.error?.code === 'TOKEN_EXPIRED';
      record(
        12,
        'expired access token returns 401 TOKEN_EXPIRED',
        ok,
        res.status,
        401,
      );
    }

    // -------------------------------------------------------------
    // Test 13: Tampered token -> INVALID_TOKEN
    // -------------------------------------------------------------
    {
      const validToken = jwt.sign(
        { sub: '00000000-0000-0000-0000-000000000000', role: 'admin' },
        env.jwt.accessSecret,
        { expiresIn: '1h' },
      );
      const tamperedToken = validToken.slice(0, -6) + 'abcdef';

      const res = await apiFetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      const body = (await res.json()) as any;

      const ok = res.status === 401 && body.error?.code === 'INVALID_TOKEN';
      record(
        13,
        'tampered token returns 401 INVALID_TOKEN',
        ok,
        res.status,
        401,
      );
    }

    // -------------------------------------------------------------
    // Test 14: Inactive user: set is_active=false -> login 403 ACCOUNT_DISABLED, token rejected
    // -------------------------------------------------------------
    {
      const inactiveEmail = `throwaway-inactive-${Date.now()}@example.com`;
      throwawayEmails.push(inactiveEmail);

      const regRes = await apiFetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inactiveEmail,
          password: 'Password@123',
          firstName: 'Inactive',
          lastName: 'Test',
        }),
      });
      const regBody = (await regRes.json()) as any;
      const userToken = regBody.data?.tokens?.accessToken;
      const userId = regBody.data?.user?.id;

      // Set user inactive in DB
      await query('UPDATE users SET is_active = false WHERE id = $1', [userId]);

      // Login attempt -> 403 ACCOUNT_DISABLED
      const loginRes = await apiFetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inactiveEmail,
          password: 'Password@123',
        }),
      });
      const loginBody = (await loginRes.json()) as any;

      // Existing access token used on /me -> 403 ACCOUNT_DISABLED
      const meRes = await apiFetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      const meBody = (await meRes.json()) as any;

      const ok =
        loginRes.status === 403 &&
        loginBody.error?.code === 'ACCOUNT_DISABLED' &&
        meRes.status === 403 &&
        meBody.error?.code === 'ACCOUNT_DISABLED';

      record(
        14,
        'inactive user: login 403 ACCOUNT_DISABLED & existing token stops working on /me',
        ok,
        loginRes.status,
        403,
      );
    }

    // -------------------------------------------------------------
    // Test 15: audit_logs contains rows for register, login, logout, password_changed
    // -------------------------------------------------------------
    {
      const auditRes = await query(`
        SELECT action, COUNT(*)::int AS count
        FROM audit_logs
        WHERE action IN ('auth.register', 'auth.login', 'auth.logout', 'auth.password_changed')
        GROUP BY action
      `);

      const actionsFound = new Set(auditRes.rows.map((r) => r.action));
      const requiredActions = [
        'auth.register',
        'auth.login',
        'auth.logout',
        'auth.password_changed',
      ];
      const allFound = requiredActions.every((a) => actionsFound.has(a));

      record(
        15,
        'audit_logs contains rows for register, login, logout, password_changed',
        allFound,
        200,
        200,
        `actions found: ${Array.from(actionsFound).join(', ')}`,
      );
    }
  } finally {
    // Clean up only throwaway test users created in this session
    if (throwawayEmails.length > 0) {
      await query('DELETE FROM users WHERE email = ANY($1)', [throwawayEmails]);
      console.log(`\n Cleaned up ${throwawayEmails.length} throwaway test user(s).`);
    }

    server.close();
    await pool.end();
  }

  // Summary
  console.log('\n----------------------------------------------------------------');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(` SUMMARY: ${passedCount} passed, ${failedCount} failed out of ${results.length} test suites.`);
  console.log('----------------------------------------------------------------\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('\n Test runner crashed:', err);
  process.exit(1);
});
