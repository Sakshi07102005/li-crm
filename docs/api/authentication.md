# Module 3 – Backend Core & Authentication Specification

## Architecture & Decisions
- **Roles & Permissions System**:
  - 4 Supported Roles:
    1. **Admin** (`admin`)
    2. **Business Head** (`business_head`)
    3. **Sales Executive** (`sales_executive`)
    4. **Marketing Executive** (`marketing_executive`)
  - Schema mapping: `users.role_id` points directly to the `roles` table.
  - Public registration (`POST /api/auth/register`) strictly assigns the lowest role (`Marketing Executive`).
- **Token Strategy**: Short-lived JWT Access Tokens (15m) + Stored Refresh Tokens (7d) in `refresh_tokens` table with rotation and automatic reuse detection.
- **Password Security**: Bcrypt with salt rounds from `BCRYPT_SALT_ROUNDS=12`.
- **Envelope Standardization**:
  - Success responses return `{ success: true, message: string, data: ... }`
  - Error responses return `{ success: false, message: string, error: { code: string, details: ... } }`
- **Known-Issues Entry**: Duplicate lead detection is performed in the **API layer (Module 5)**, not via a database unique constraint on email or mobile.

---

## Test Accounts & Seed Credentials

| Role | Role Code | Email | Password |
|---|---|---|---|
| **Admin** | `admin` | `admin@licrm.example` | `Admin@12345` |
| **Business Head** | `business_head` | `businesshead@licrm.example` | `Sample@12345` |
| **Sales Executive** | `sales_executive` | `sales@licrm.example` | `Sample@12345` |
| **Marketing Executive** | `marketing_executive` | `marketing@licrm.example` | `Sample@12345` |

---

## Endpoints

### 1. Register User (Public)
`POST /api/auth/register`

Creates a new CRM user and automatically assigns the lowest role (`Marketing Executive`). Immediately returns access/refresh token pair.

#### Request Body
```json
{
  "email": "sneha.patil@licrm.example",
  "password": "SecurePassword@123",
  "firstName": "Sneha",
  "lastName": "Patil",
  "phone": "+91-9876543299"
}
```

#### Response (201 Created)
```json
{
  "success": true,
  "message": "Account registered successfully",
  "data": {
    "user": {
      "id": "c1f7b8a2-3d4e-4f5a-9b1c-7d8e9f0a1b2c",
      "email": "sneha.patil@licrm.example",
      "roleId": "r-me",
      "role": "marketing_executive",
      "roleName": "Marketing Executive",
      "firstName": "Sneha",
      "lastName": "Patil",
      "phone": "+91-9876543299",
      "avatarUrl": null,
      "isActive": true,
      "lastLogin": null,
      "createdAt": "2026-11-07T00:00:00.000Z",
      "updatedAt": "2026-11-07T00:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": "15m",
      "tokenType": "Bearer"
    }
  }
}
```

---

### 2. Login
`POST /api/auth/login`

Validates credentials for any of the 4 roles, updates `last_login`, and issues a new access/refresh token pair.

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
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "email": "admin@licrm.example",
      "roleId": "r-admin",
      "role": "admin",
      "roleName": "Admin",
      "firstName": "System",
      "lastName": "Administrator",
      "phone": "+91-9876543210",
      "avatarUrl": null,
      "isActive": true,
      "lastLogin": "2026-11-07T00:15:30.000Z",
      "createdAt": "2026-11-06T18:00:00.000Z",
      "updatedAt": "2026-11-06T18:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": "15m",
      "tokenType": "Bearer"
    }
  }
}
```

---

### 3. Refresh Token Flow (with Rotation & Revocation)
`POST /api/auth/refresh-token`

Rotates the refresh token (invalidates the previous one and marks `replaced_by`), returning a newly minted token pair. If a revoked token is presented, all active sessions for the user are immediately revoked (reuse attack defense).

#### Request Body
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": "15m",
      "tokenType": "Bearer"
    },
    "user": {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "email": "admin@licrm.example",
      "roleId": "r-admin",
      "role": "admin",
      "roleName": "Admin",
      "firstName": "System",
      "lastName": "Administrator"
    }
  }
}
```

---

### 4. Logout
`POST /api/auth/logout`

Revokes the supplied refresh token in PostgreSQL.

#### Request Body
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
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

### 5. Get Authenticated User Profile
`GET /api/auth/me`

**Headers**: `Authorization: Bearer <access-token>`

#### Response (200 OK)
```json
{
  "success": true,
  "message": "User profile retrieved successfully",
  "data": {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "email": "admin@licrm.example",
    "roleId": "r-admin",
    "role": "admin",
    "roleName": "Admin",
    "firstName": "System",
    "lastName": "Administrator",
    "phone": "+91-9876543210",
    "avatarUrl": null,
    "isActive": true,
    "lastLogin": "2026-11-07T00:15:30.000Z",
    "createdAt": "2026-11-06T18:00:00.000Z",
    "updatedAt": "2026-11-06T18:00:00.000Z"
  }
}
```

---

### 6. Update Profile
`PUT /api/auth/me`

**Headers**: `Authorization: Bearer <access-token>`

#### Request Body
```json
{
  "firstName": "System",
  "lastName": "Super Admin",
  "phone": "+91-9876500000",
  "avatarUrl": "https://storage.licrm.example/avatars/admin.png"
}
```

---

### 7. Change Password
`POST /api/auth/change-password`

**Headers**: `Authorization: Bearer <access-token>`

Verifies `currentPassword`, hashes `newPassword`, updates `password_hash`, and revokes all active refresh tokens for the user to force re-authentication across all devices.

#### Request Body
```json
{
  "currentPassword": "Admin@12345",
  "newPassword": "NewAdminPassword@2026"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Password changed successfully. Existing sessions have been revoked.",
  "data": null
}
```
