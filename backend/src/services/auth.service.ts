import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/database";
import { env } from "../config/env";
import {
  AuthSuccessResponse,
  RoleCode,
  RoleName,
  TokenPair,
  UserProfileResponse,
} from "../types/auth.types";
import { AppError } from "../utils/AppError";
import {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from "../validators/auth.validator";

interface DbUserWithRole {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role_id: string;
  role_code: RoleCode;
  role_name: RoleName;
  avatar_url: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export class AuthService {
  /**
   * Hashes a raw refresh token using SHA-256 for secure DB lookup.
   */
  public static hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Generates a short-lived access token (15m) and a refresh token (7d).
   */
  public static generateTokenPair(user: {
    id: string;
    email: string;
    roleId: string;
    role: RoleCode;
  }): TokenPair {
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        roleId: user.roleId,
        role: user.role,
      },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn as any }
    );

    const refreshToken = jwt.sign(
      {
        userId: user.id,
        jti: crypto.randomUUID(),
      },
      env.jwt.refreshSecret,
      { expiresIn: env.jwt.refreshExpiresIn as any }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: env.jwt.expiresIn,
      tokenType: "Bearer",
    };
  }

  /**
   * Maps a database user row joined with roles to a sanitized UserProfileResponse.
   */
  public static mapToProfile(row: DbUserWithRole): UserProfileResponse {
    return {
      id: row.id,
      email: row.email,
      roleId: row.role_id,
      role: row.role_code,
      roleName: row.role_name,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      avatarUrl: row.avatar_url,
      isActive: row.is_active,
      lastLogin: row.last_login ? new Date(row.last_login).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * Gets the lowest role ID (Marketing Executive) for public registration.
   */
  public static async getLowestRoleId(): Promise<{ id: string; code: RoleCode; name: RoleName }> {
    const res = await pool.query(
      `SELECT id, code, name 
       FROM roles 
       WHERE code = 'marketing_executive' 
          OR code = 'marketing' 
          OR name ILIKE '%Marketing Executive%'
       LIMIT 1`
    );

    if (res.rowCount && res.rowCount > 0) {
      return {
        id: res.rows[0].id,
        code: (res.rows[0].code || "marketing_executive") as RoleCode,
        name: (res.rows[0].name || "Marketing Executive") as RoleName,
      };
    }

    // Fallback: fetch role with lowest permissions or last created
    const fallback = await pool.query(
      `SELECT id, code, name FROM roles ORDER BY id DESC LIMIT 1`
    );

    if (fallback.rowCount && fallback.rowCount > 0) {
      return {
        id: fallback.rows[0].id,
        code: (fallback.rows[0].code || "marketing_executive") as RoleCode,
        name: (fallback.rows[0].name || "Marketing Executive") as RoleName,
      };
    }

    throw new AppError("System roles are not configured in the database.", 500, "ROLES_NOT_CONFIGURED");
  }

  /**
   * Public Register - Always assigns the lowest role (Marketing Executive).
   */
  public static async register(input: RegisterInput): Promise<AuthSuccessResponse> {
    const email = input.email.toLowerCase().trim();

    // Check if email already registered
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw AppError.conflict("An account with this email address already exists.", "EMAIL_ALREADY_EXISTS");
    }

    // Force lowest role for public registration
    const lowestRole = await this.getLowestRoleId();
    const passwordHash = await bcrypt.hash(input.password, env.bcrypt.saltRounds);

    const insertResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, email, password_hash, first_name, last_name, phone, role_id, avatar_url, is_active, last_login, created_at, updated_at;`,
      [
        email,
        passwordHash,
        input.firstName.trim(),
        input.lastName.trim(),
        input.phone || null,
        lowestRole.id,
      ]
    );

    const userRow = insertResult.rows[0];
    const userWithRole: DbUserWithRole = {
      ...userRow,
      role_code: lowestRole.code,
      role_name: lowestRole.name,
    };

    const tokens = this.generateTokenPair({
      id: userWithRole.id,
      email: userWithRole.email,
      roleId: userWithRole.role_id,
      role: userWithRole.role_code,
    });

    // Store refresh token
    const tokenHash = this.hashToken(tokens.refreshToken);
    const decodedRefresh: any = jwt.decode(tokens.refreshToken);
    const expiresAt = new Date(decodedRefresh.exp * 1000);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3);`,
      [userWithRole.id, tokenHash, expiresAt]
    );

    return {
      user: this.mapToProfile(userWithRole),
      tokens,
    };
  }

  /**
   * Login user with credentials.
   */
  public static async login(input: LoginInput): Promise<AuthSuccessResponse> {
    const email = input.email.toLowerCase().trim();

    const userResult = await pool.query<DbUserWithRole>(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.phone,
              u.role_id, r.code AS role_code, r.name AS role_name,
              u.avatar_url, u.is_active, u.last_login, u.created_at, u.updated_at
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.email = $1`,
      [email]
    );

    if (userResult.rowCount === 0) {
      throw AppError.unauthorized("Invalid email or password.", "INVALID_CREDENTIALS");
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      throw AppError.forbidden("Your account has been deactivated. Contact an administrator.", "ACCOUNT_DEACTIVATED");
    }

    const isMatch = await bcrypt.compare(input.password, user.password_hash);
    if (!isMatch) {
      throw AppError.unauthorized("Invalid email or password.", "INVALID_CREDENTIALS");
    }

    // Update last_login
    await pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);
    user.last_login = new Date().toISOString();

    const tokens = this.generateTokenPair({
      id: user.id,
      email: user.email,
      roleId: user.role_id,
      role: user.role_code,
    });

    // Store refresh token
    const tokenHash = this.hashToken(tokens.refreshToken);
    const decodedRefresh: any = jwt.decode(tokens.refreshToken);
    const expiresAt = new Date(decodedRefresh.exp * 1000);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3);`,
      [user.id, tokenHash, expiresAt]
    );

    return {
      user: this.mapToProfile(user),
      tokens,
    };
  }

  /**
   * Refresh access token with rotation and reuse detection.
   */
  public static async refreshToken(tokenStr: string): Promise<{ tokens: TokenPair; user: UserProfileResponse }> {
    let decoded: any;
    try {
      decoded = jwt.verify(tokenStr, env.jwt.refreshSecret);
    } catch (err: any) {
      if (err.name === "TokenExpiredError") {
        throw AppError.unauthorized("Refresh token has expired. Please log in again.", "REFRESH_TOKEN_EXPIRED");
      }
      throw AppError.unauthorized("Invalid refresh token.", "INVALID_REFRESH_TOKEN");
    }

    const tokenHash = this.hashToken(tokenStr);

    const tokenResult = await pool.query(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) {
      throw AppError.unauthorized("Refresh token not found or unrecognized.", "INVALID_REFRESH_TOKEN");
    }

    const storedToken = tokenResult.rows[0];

    // Reuse detection: If token was already revoked, someone may be attacking!
    if (storedToken.revoked_at !== null) {
      // Invalidate ALL refresh tokens for this user for immediate compromise defense
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [storedToken.user_id]
      );
      throw AppError.unauthorized(
        "Compromised refresh token detected. All active sessions have been invalidated. Please log in again.",
        "TOKEN_REUSE_DETECTED"
      );
    }

    // Expiry check
    if (new Date(storedToken.expires_at) < new Date()) {
      await pool.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1", [storedToken.id]);
      throw AppError.unauthorized("Refresh token has expired. Please log in again.", "REFRESH_TOKEN_EXPIRED");
    }

    // Get user with role
    const userResult = await pool.query<DbUserWithRole>(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.phone,
              u.role_id, r.code AS role_code, r.name AS role_name,
              u.avatar_url, u.is_active, u.last_login, u.created_at, u.updated_at
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [storedToken.user_id]
    );

    if (userResult.rowCount === 0 || !userResult.rows[0].is_active) {
      throw AppError.unauthorized("User account not found or deactivated.", "USER_INACTIVE");
    }

    const user = userResult.rows[0];

    // Generate new token pair (Rotation)
    const newTokens = this.generateTokenPair({
      id: user.id,
      email: user.email,
      roleId: user.role_id,
      role: user.role_code,
    });

    const newTokenHash = this.hashToken(newTokens.refreshToken);
    const decodedNew: any = jwt.decode(newTokens.refreshToken);
    const newExpiresAt = new Date(decodedNew.exp * 1000);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertRes = await client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id;`,
        [user.id, newTokenHash, newExpiresAt]
      );
      const newId = insertRes.rows[0].id;

      await client.query(
        `UPDATE refresh_tokens 
         SET revoked_at = NOW(), replaced_by = $1 
         WHERE id = $2;`,
        [newId, storedToken.id]
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    return {
      tokens: newTokens,
      user: this.mapToProfile(user),
    };
  }

  /**
   * Revoke a refresh token (Logout).
   */
  public static async logout(tokenStr: string): Promise<void> {
    const tokenHash = this.hashToken(tokenStr);
    await pool.query(
      `UPDATE refresh_tokens 
       SET revoked_at = NOW() 
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );
  }

  /**
   * Get user profile by user ID.
   */
  public static async getProfile(userId: string): Promise<UserProfileResponse> {
    const userResult = await pool.query<DbUserWithRole>(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.phone,
              u.role_id, r.code AS role_code, r.name AS role_name,
              u.avatar_url, u.is_active, u.last_login, u.created_at, u.updated_at
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rowCount === 0) {
      throw AppError.notFound("User not found.", "USER_NOT_FOUND");
    }

    return this.mapToProfile(userResult.rows[0]);
  }

  /**
   * Update profile fields.
   */
  public static async updateProfile(
    userId: string,
    input: UpdateProfileInput
  ): Promise<UserProfileResponse> {
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (input.firstName !== undefined) {
      updates.push(`first_name = $${idx++}`);
      values.push(input.firstName.trim());
    }
    if (input.lastName !== undefined) {
      updates.push(`last_name = $${idx++}`);
      values.push(input.lastName.trim());
    }
    if (input.phone !== undefined) {
      updates.push(`phone = $${idx++}`);
      values.push(input.phone);
    }
    if (input.avatarUrl !== undefined) {
      updates.push(`avatar_url = $${idx++}`);
      values.push(input.avatarUrl);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(userId);

      await pool.query(
        `UPDATE users 
         SET ${updates.join(", ")} 
         WHERE id = $${idx}`,
        values
      );
    }

    return this.getProfile(userId);
  }

  /**
   * Change user password and revoke all existing active refresh tokens.
   */
  public static async changePassword(
    userId: string,
    input: ChangePasswordInput
  ): Promise<void> {
    const userResult = await pool.query(
      "SELECT id, password_hash FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rowCount === 0) {
      throw AppError.notFound("User not found.", "USER_NOT_FOUND");
    }

    const user = userResult.rows[0];

    const isMatch = await bcrypt.compare(input.currentPassword, user.password_hash);
    if (!isMatch) {
      throw AppError.badRequest("Current password entered is incorrect.", "INCORRECT_PASSWORD");
    }

    const newHash = await bcrypt.hash(input.newPassword, env.bcrypt.saltRounds);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        [newHash, userId]
      );

      // Invalidate all active refresh tokens for this user
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
        [userId]
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
