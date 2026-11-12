# Module 3 – Backend Core & Authentication Specification

## Architecture & Decisions
- **Roles & Permissions System**:
  - 4 Supported Roles:
    1. **Admin** (`admin`)
    2. **Business Head** (`business_head`)
    3. **Sales Executive** (`sales_executive`)
    4. **Marketing Executive** (`marketing_executive`)
  - Schema mapping: `users.role_id` points directly to the `roles` table.
  - Public registration (`POST /api/auth/register`) strictly assigns the lowest role (`marketing_executive`).
- **Token Strategy**:
  - Short-lived JWT Access Tokens (HS256 signed with `JWT_ACCESS_SECRET`, expires in `JWT_ACCESS_EXPIRES_IN`, default 15m).
  - Opaque stored Refresh Tokens (crypto random 48-byte hex string). Only `sha256(token)` is stored in `refresh_tokens.token_hash`.
  - Single-transaction rotation with `SELECT ... FOR UPDATE`: marks old row `revoked_at = NOW()`, inserts new token, links `replaced_by_id`.
  - Automatic Reuse Detection: if an already-revoked refresh token is presented, all active sessions for that user are immediately revoked, returning `401 TOKEN_REUSE_DETECTED`.
- **Password Security**: Bcrypt with salt rounds from `BCRYPT_ROUNDS` (default 12).
- **Envelope Standardization**:
  - Success responses return:
    ```json
    { "success": true, "message": "...", "data": { ... } }
    ```
  - Error responses return:
    ```json
    { "success": false, "message": "...", "error": { "code": "ERROR_CODE", "details": null | [ ... ] } }
    ```
- **Error Codes**:
  - `VALIDATION_ERROR` (400)
  - `INVALID_CREDENTIALS` (401)
  - `UNAUTHORIZED` (401)
  - `TOKEN_EXPIRED` (401)
  - `INVALID_TOKEN` (401)
  - `TOKEN_REUSE_DETECTED` (401)
  - `INVALID_REFRESH_TOKEN` (401)
  - `ACCOUNT_DISABLED` (403)
  - `FORBIDDEN` (403)
  - `NOT_FOUND` (404)
  - `EMAIL_ALREADY_EXISTS` (409)
  - `RATE_LIMITED` (429)
  - `CORS_NOT_ALLOWED` (403)
  - `INTERNAL_ERROR` (500)
- **Known-Issues Entry**: Duplicate lead detection is performed in the **API layer (Module 5)**, not via a database unique constraint on email or mobile.

---

## Seeded Test Accounts

| Role | Role Code | Email | Password |
|---|---|---|---|
| **Admin** | `admin` | `admin@licrm.example` | Value of `SEED_ADMIN_PASSWORD` (default `Admin@12345`) |
| **Business Head** | `business_head` | `businesshead@licrm.example` | Value of `SEED_SAMPLE_PASSWORD` (default `Sample@12345`) |
| **Sales Executive** | `sales_executive` | `sales1@licrm.example`, `sales2@licrm.example` | Value of `SEED_SAMPLE_PASSWORD` (default `Sample@12345`) |
| **Marketing Executive** | `marketing_executive` | `marketing@licrm.example` | Value of `SEED_SAMPLE_PASSWORD` (default `Sample@12345`) |

---

## API Endpoints

### 1. Health Check
`GET /api/health` (Public)

Returns service status and tests PostgreSQL connectivity via `SELECT 1`.

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Health check passed",
  "data": {
    "status": "healthy",
    "database": "up",
    "timestamp": "2026-11-07T12:00:00.000Z"
  }
}
```

---

### 2. Register User
`POST /api/auth/register` (Public)

Strict body. Automatically assigns `marketing_executive` role. Rejects any extra fields (such as `role` or `roleId`).

#### Request Body
```json
{
  "email": "newuser@example.com",
  "password": "SecurePassword@123",
  "firstName": "Rahul",
  "lastName": "Sharma",
  "phone": "+91-9876543210"
}
```

#### Response (201 Created)
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "18f9411f-c96f-47cf-891f-0e4fc0a59929",
      "email": "newuser@example.com",
      "firstName": "Rahul",
      "lastName": "Sharma",
      "phone": "+91-9876543210",
      "avatarUrl": null,
      "role": {
        "code": "marketing_executive",
        "name": "Marketing Executive"
      },
      "isActive": true,
      "lastLoginAt": null,
      "createdAt": "2026-11-07T12:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
      "refreshToken": "d8e3b7...48_byte_hex",
      "expiresIn": "15m"
    }
  }
}
```

---

### 3. Login
`POST /api/auth/login` (Public, Rate Limited)

Authenticates user via email and password. Protected by dummy bcrypt comparison to equalize timing for non-existent users.

#### Request Body
```json
{
  "email": "admin@licrm.example",
  "password": "Admin@12345"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "239bcaec-6dc7-4a0b-ae9c-f9e422fba7b1",
      "email": "admin@licrm.example",
      "firstName": "System",
      "lastName": "Admin",
      "phone": "+91-9876543210",
      "avatarUrl": null,
      "role": {
        "code": "admin",
        "name": "Admin"
      },
      "managerId": null,
      "isActive": true,
      "lastLoginAt": "2026-11-07T12:00:00.000Z",
      "createdAt": "2026-11-07T11:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
      "refreshToken": "a7b2c9...48_byte_hex",
      "expiresIn": "15m"
    }
  }
}
```

---

### 4. Refresh Token Flow
`POST /api/auth/refresh` (Public)

Rotates refresh token and issues a new access token.

#### Request Body
```json
{
  "refreshToken": "a7b2c9...48_byte_hex"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
    "refreshToken": "e3f4a1...new_48_byte_hex",
    "expiresIn": "15m"
  }
}
```

---

### 5. Logout
`POST /api/auth/logout` (Public, Idempotent)

Revokes the given refresh token. Always returns 200.

#### Request Body
```json
{
  "refreshToken": "e3f4a1...new_48_byte_hex"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": null
}
```

---

### 6. Get Current Profile
`GET /api/auth/me` (Bearer JWT Required)

Retrieves profile and active role permissions. Never exposes `password_hash`.

#### Response (200 OK)
```json
{
  "success": true,
  "message": "User profile retrieved successfully",
  "data": {
    "id": "239bcaec-6dc7-4a0b-ae9c-f9e422fba7b1",
    "email": "admin@licrm.example",
    "firstName": "System",
    "lastName": "Admin",
    "phone": "+91-9876543210",
    "avatarUrl": null,
    "role": {
      "code": "admin",
      "name": "Admin"
    },
    "managerId": null,
    "isActive": true,
    "lastLoginAt": "2026-11-07T12:00:00.000Z",
    "createdAt": "2026-11-07T11:00:00.000Z",
    "permissions": [
      "activities.create",
      "audit.view",
      "companies.manage",
      "companies.view",
      "contacts.manage",
      "dashboard.view",
      "followups.manage",
      "leads.assign",
      "leads.create",
      "leads.delete",
      "leads.import",
      "leads.update",
      "leads.view_all",
      "leads.view_marketing",
      "leads.view_own",
      "leads.view_team",
      "reports.export",
      "reports.view_all",
      "reports.view_marketing",
      "reports.view_own",
      "reports.view_team",
      "tasks.assign",
      "tasks.manage",
      "users.manage",
      "users.view_team"
    ]
  }
}
```

---

### 7. Update Current Profile
`PUT /api/auth/me` (Bearer JWT Required)

Allows updating `firstName`, `lastName`, `phone`, and `avatarUrl`. Cannot change `email`, `role`, or `isActive`.

#### Request Body
```json
{
  "firstName": "System Administrator",
  "phone": "+91-9988776655"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "239bcaec-6dc7-4a0b-ae9c-f9e422fba7b1",
    "email": "admin@licrm.example",
    "firstName": "System Administrator",
    "lastName": "Admin",
    "phone": "+91-9988776655",
    "avatarUrl": null,
    "role": {
      "code": "admin",
      "name": "Admin"
    },
    "managerId": null,
    "isActive": true,
    "lastLoginAt": "2026-11-07T12:00:00.000Z",
    "createdAt": "2026-11-07T11:00:00.000Z",
    "permissions": [...]
  }
}
```

---

### 8. Change Password
`POST /api/auth/change-password` (Bearer JWT Required)

Updates password and revokes all active refresh tokens for the authenticated user.

#### Request Body
```json
{
  "currentPassword": "OldPassword@123",
  "newPassword": "NewPassword@123"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Password changed successfully",
  "data": null
}
```

---

# Module 4 – Role-Based Access Control (RBAC) & User Management

## Authorization Model
- Permissions are DB-driven (`role_permissions` join `permissions`). No hardcoded role-permission mappings.
- `req.user.permissions`: string[] is populated during JWT authentication.
- Scoping rules:
  - `admin`: All users, all leads (`leads.view_all`).
  - `business_head`: Self + direct reports (`users.view_team`), leads assigned to self/reports (`leads.view_team`).
  - `sales_executive`: Self only (`leads.view_own`).
  - `marketing_executive`: Marketing source leads or created by self (`leads.view_marketing`).
- Any access violation writes an audit log with action `authz.denied`.

## User Management Endpoints

### 9. Get Roles
`GET /api/roles` (Authenticated)
Returns all system roles for dropdowns and role assignment.

### 10. Get RBAC Permissions & Scope
`GET /api/rbac/permissions` (Authenticated)
Returns current user role, granted permission codes, and data visibility scope.

### 11. List Users
`GET /api/users` (Requires `users.manage` OR `users.view_team`)
Query Parameters: `page`, `limit` (max 100), `search`, `roleCode`, `isActive`, `sort`.
Admins see all users; Business Heads see only self and direct reports.

### 12. Get User Details
`GET /api/users/:id` (Requires `users.manage` OR `users.view_team`)
Returns safe user profile. If target is outside the caller's scope, returns `404 NOT_FOUND` (never leaks existence with 403).

### 13. Create User
`POST /api/users` (Requires `users.manage`)
Creates user with assigned role, optional manager ID, and password policy validation. Writes audit log `user.create`.

### 14. Update User Profile
`PUT /api/users/:id` (Requires `users.manage`)
Updates `firstName`, `lastName`, `phone`, or `managerId`. Rejects modifications to `role` or `email` (`400 VALIDATION_ERROR`). Writes audit log `user.updated`.

### 15. Change User Role
`PATCH /api/users/:id/role` (Requires `users.manage`)
Safeguards:
- Admins cannot change their own role (`403 FORBIDDEN`).
- Cannot demote the last active admin (`403 FORBIDDEN`).
Writes audit log `user.role_changed`.

### 16. Change User Status (Activate/Deactivate)
`PATCH /api/users/:id/status` (Requires `users.manage`)
Safeguards:
- Admins cannot deactivate their own account (`403 FORBIDDEN`).
- Cannot deactivate the last active admin (`403 FORBIDDEN`).
- Deactivating a user immediately revokes all their active refresh tokens.
Writes audit log `user.status_changed`.

### 17. Reset User Password
`POST /api/users/:id/reset-password` (Requires `users.manage`)
Admin reset of user password. Revokes all active refresh tokens for the target user. Writes audit log `user.password_reset`.

