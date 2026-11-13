# LI CRM — Complete REST API Specification

**Version:** 1.0.0  
**Base URL:** `http://localhost:4000/api` (Development)  
**Authentication:** Bearer Token (JWT Access Token)  
**Interactive Swagger UI:** `http://localhost:4000/api/docs`  
**OpenAPI 3.0 Spec JSON:** `http://localhost:4000/api/docs.json`  

---

## 1. Global Standards & Protocol

### 1.1 Response Envelope Structure

All REST endpoints adhere strictly to a standardized envelope format:

#### Standard Success Envelope (`2xx`)
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... }
}
```

#### Standard Error Envelope (`4xx`, `5xx`)
```json
{
  "success": false,
  "message": "Human-readable explanation of error",
  "error": {
    "code": "ERROR_CODE_STRING",
    "details": null
  }
}
```
*When validation errors occur, `details` is an array of field errors.*

### 1.2 Global Error Codes

| HTTP Status | Error Code | Description |
|:---|:---|:---|
| `400` | `VALIDATION_ERROR` | Request payload fails Zod schema validation |
| `401` | `INVALID_CREDENTIALS` | Invalid email or password provided |
| `401` | `UNAUTHORIZED` | Authentication token missing or invalid |
| `401` | `TOKEN_EXPIRED` | JWT access token has expired (client must refresh) |
| `401` | `INVALID_TOKEN` | Malformed or tampered JWT access token |
| `401` | `TOKEN_REUSE_DETECTED` | Revoked refresh token submitted; all sessions terminated |
| `401` | `INVALID_REFRESH_TOKEN` | Provided refresh token not found or invalid |
| `403` | `FORBIDDEN` | Authenticated user lacks required permission |
| `403` | `ACCOUNT_DISABLED` | User account is set to inactive (`is_active = false`) |
| `403` | `CORS_NOT_ALLOWED` | Origin not allowed by CORS policy |
| `404` | `NOT_FOUND` | Requested entity does not exist or is out of user scope |
| `409` | `EMAIL_ALREADY_EXISTS` | Registered email is already in use |
| `409` | `COMPANY_EXISTS` | Company name already exists (case-insensitive) |
| `422` | `INVALID_FOLLOWUP_STATE` | Attempted invalid follow-up state transition |
| `422` | `LEAD_CLOSED` | Attempted to reassign or modify follow-up on a closed lead |
| `429` | `RATE_LIMITED` | Rate limit exceeded (100 req / 15 min per IP on auth) |
| `500` | `INTERNAL_ERROR` | Unhandled internal exception (sanitized in production) |

---

## 2. Role-Based Access Control (RBAC) Matrix

LI CRM enforces a multi-tier authorization hierarchy across 4 defined roles:

| Role Name | Code | Scope Level | Primary Responsibilities |
|:---|:---|:---|:---|
| **Admin** | `admin` | Organization-Wide | Full system access, user management, audit logs, unrestricted assignment |
| **Business Head** | `business_head` | Team / Department | Team oversight, team leads/tasks/followups, reporting, team assignment |
| **Sales Executive** | `sales_executive` | Own Assigned Records | Personal leads, follow-ups, logging interactions, updating status |
| **Marketing Executive**| `marketing_executive`| Lead Generation | Ingestion of new leads, viewing source/marketing leads |

### Role Scoping Enforcement (`leadScope`)
- **Admin**: Has `leads.view_all` → queries bypass owner filtering (`WHERE deleted_at IS NULL`).
- **Business Head**: Has `leads.view_team` → visible where `assigned_to = user.id OR assigned_to IN (SELECT id FROM users WHERE manager_id = user.id) OR created_by = user.id`.
- **Sales / Marketing**: Has `leads.view_own` → visible strictly where `assigned_to = user.id OR created_by = user.id`.

---

## 3. Authentication & Session Endpoints (`/api/auth`)

### 3.1 Register User
- **Method & Route:** `POST /api/auth/register`
- **Auth Required:** No (Public)
- **Description:** Public registration. Automatically assigns `marketing_executive` role.
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "Password@123",
    "firstName": "John",
    "lastName": "Doe",
    "mobile": "+919876543210"
  }
  ```
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Registration successful",
    "data": {
      "user": {
        "id": "57a68fa8-f85b-4978-b9f7-857ef408d53a",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "role": "marketing_executive"
      },
      "tokens": {
        "accessToken": "eyJhbGciOiJIUzI1Ni...",
        "refreshToken": "7c8e9f2a..."
      }
    }
  }
  ```

### 3.2 Login
- **Method & Route:** `POST /api/auth/login`
- **Auth Required:** No
- **Rate Limit:** 100 requests / 15 minutes per IP
- **Request Body:**
  ```json
  {
    "email": "admin@licrm.example",
    "password": "Admin@12345"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": "57a68fa8-f85b-4978-b9f7-857ef408d53a",
        "email": "admin@licrm.example",
        "role": "admin",
        "permissions": ["users.manage", "leads.view_all", "dashboard.view", "..."]
      },
      "tokens": {
        "accessToken": "eyJhbGciOiJIUzI1Ni...",
        "refreshToken": "48-byte-hex-string"
      }
    }
  }
  ```

### 3.3 Refresh Tokens (Single-Use Token Rotation)
- **Method & Route:** `POST /api/auth/refresh`
- **Auth Required:** No
- **Security:** Atomic rotation in transaction. Presenting a revoked refresh token automatically triggers **instant session invalidation** across all user devices.
- **Request Body:**
  ```json
  {
    "refreshToken": "48-byte-hex-string"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Tokens refreshed",
    "data": {
      "tokens": {
        "accessToken": "eyJhbGci...",
        "refreshToken": "new-48-byte-hex-string"
      }
    }
  }
  ```

### 3.4 Logout
- **Method & Route:** `POST /api/auth/logout`
- **Auth Required:** Yes (`Bearer <accessToken>`)
- **Request Body:**
  ```json
  {
    "refreshToken": "48-byte-hex-string"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

### 3.5 Current User Profile
- **Method & Route:** `GET /api/auth/me`
- **Auth Required:** Yes (`Bearer <accessToken>`)
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "roleCode": "admin",
        "permissions": ["..."]
      }
    }
  }
  ```

---

## 4. User & RBAC Management (`/api/users`, `/api/roles`)

### 4.1 List Users
- **Method & Route:** `GET /api/users?page=1&limit=20&search=john`
- **Permission Required:** `users.manage`

### 4.2 Create User
- **Method & Route:** `POST /api/users`
- **Permission Required:** `users.manage`
- **Request Body:**
  ```json
  {
    "email": "sales3@licrm.example",
    "password": "Password@123",
    "firstName": "Alex",
    "lastName": "Smith",
    "roleId": 3,
    "managerId": "uuid-optional"
  }
  ```

### 4.3 Update User Status
- **Method & Route:** `PATCH /api/users/:id/status`
- **Permission Required:** `users.manage`
- **Payload:** `{ "isActive": false }`
- **Safety Safeguard:** Cannot deactivate the last remaining active Admin.

### 4.4 Change User Role
- **Method & Route:** `PATCH /api/users/:id/role`
- **Permission Required:** `users.manage`
- **Payload:** `{ "roleId": 2 }`
- **Safety Safeguard:** Cannot demote the last remaining active Admin.

---

## 5. Lead Management & Pipeline (`/api/leads`)

### 5.1 Duplicate Check Engine
- **Method & Route:** `POST /api/leads/check-duplicate`
- **Permission Required:** `leads.create` or `leads.view_*`
- **Description:** Checks email or 10-digit mobile against database. Scans entire DB and returns duplicate details for records within caller scope, plus `outOfScopeCount` for privacy preservation.
- **Request Body:**
  ```json
  {
    "email": "contact@targetclient.com",
    "mobile": "9876543210",
    "excludeLeadId": "optional-uuid"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "duplicates": [
        {
          "id": "uuid",
          "leadCode": "LP-202611-0001",
          "leadName": "Target Client",
          "status": "New",
          "assignedTo": "Sarah Connor"
        }
      ],
      "outOfScopeCount": 0
    }
  }
  ```

### 5.2 Lead Lookups
- **Method & Route:** `GET /api/leads/lookups`
- **Description:** Returns products (`LearnProfessional`, `BookEHealth`, `LI`), lead sources, statuses, priorities, industries, and reachable assignable users.

### 5.3 List Leads (Search, Multi-Filter, Pagination)
- **Method & Route:** `GET /api/leads`
- **Permission Required:** `leads.view_own` | `leads.view_team` | `leads.view_all`
- **Query Parameters:**
  - `q`: Free-text search on name, company, email, mobile, lead code
  - `statusId`: Comma-separated status IDs (`1,2,3`)
  - `productId`: Comma-separated product IDs
  - `sourceId`: Comma-separated source IDs
  - `priority`: `high`, `medium`, `low`
  - `assignedTo`: Specific user UUID
  - `unassigned`: `true` | `false`
  - `page`: default 1
  - `limit`: default 20 (max 100)
  - `sortBy`: `createdAt`, `updatedAt`, `nextFollowUpAt`, `leadName`
  - `sortOrder`: `asc` | `desc`

### 5.4 Create Lead
- **Method & Route:** `POST /api/leads`
- **Permission Required:** `leads.create`
- **Hooks Triggered:** DB Insert → Activity Log (`Lead created`) → In-app Push Notification → Email Dispatch hook.
- **Request Body:**
  ```json
  {
    "leadName": "Dr. Ronald Vance",
    "companyName": "Vance Health Group",
    "email": "ronald@vancehealth.example",
    "mobile": "+91 98765 43210",
    "productId": 2,
    "sourceId": 1,
    "priority": "high",
    "industry": "Healthcare",
    "remarks": "Interested in BookEHealth enterprise deployment",
    "nextFollowUpAt": "2026-11-20T10:00:00.000Z",
    "assignedTo": "optional-user-uuid"
  }
  ```

### 5.5 Lead Detail
- **Method & Route:** `GET /api/leads/:id`
- **Description:** Returns full lead record, product metadata, source metadata, company links, and `allowedNextStatuses`.

### 5.6 Change Lead Status
- **Method & Route:** `PATCH /api/leads/:id/status`
- **Permission Required:** `leads.change_status`
- **Description:** Enforces strict pipeline state transitions. Validates mandatory `lostReason` when transitioning to `Lost` (id 8). Auto-timestamps `converted_at` on `Converted` (id 7).
- **Request Body:**
  ```json
  {
    "statusId": 4,
    "remarks": "Client requested proposal presentation",
    "lostReason": null
  }
  ```

### 5.7 Assign Lead
- **Method & Route:** `PATCH /api/leads/:id/assign`
- **Permission Required:** `leads.assign`
- **Description:** Assigns or reassigns lead with `FOR UPDATE` row lock. Rejects reassignment on closed leads. Records assignment history in `lead_assignments`, logs activity, fires push notification, and triggers email alert via `notifyByEmail`.
- **Request Body:**
  ```json
  {
    "assignedTo": "user-uuid",
    "reason": "Territory realignment"
  }
  ```

### 5.8 Lead Assignment History
- **Method & Route:** `GET /api/leads/:id/assignments`
- **Permission Required:** `leads.view_*` (scoped)

---

## 6. Companies & Contacts (`/api/companies`, `/api/contacts`)

### 6.1 Company Endpoints
- `GET /api/companies`: Scoped list with leadCount and contactCount.
- `POST /api/companies`: Create company (rejects case-insensitive duplicates with `409 COMPANY_EXISTS`).
- `GET /api/companies/:id`: Detail view with embedded primary contact.
- `PUT /api/companies/:id`: Update fields.
- `DELETE /api/companies/:id`: Soft delete (`deleted_at = NOW()`).
- `GET /api/companies/:id/contacts`: List company contacts (primary contact listed first).
- `GET /api/companies/:id/leads`: List company leads through caller's scope filter.

### 6.2 Contact Endpoints
- `POST /api/companies/:id/contacts`: Add contact. If first contact, auto-promoted to primary.
- `PUT /api/contacts/:id`: Update contact.
- `DELETE /api/contacts/:id`: Soft delete contact. If primary deleted, oldest remaining contact auto-promoted.
- `PATCH /api/contacts/:id/primary`: Explicitly promotes contact to primary.

---

## 7. Follow-ups & Activities (`/api/followups`, `/api/leads/:id/activities`)

### 7.1 Follow-up Management
- `GET /api/followups?tab=today|overdue|this_week|all`: Scoped follow-up list.
- `POST /api/followups`: Create follow-up. Syncs parent lead's `next_follow_up_at` and creates an activity record.
- `PATCH /api/followups/:id/status`: Update status (`completed`, `missed`, `rescheduled`). If rescheduled, automatically creates the new follow-up and recalculates `next_follow_up_at`.

### 7.2 Activity Timeline
- `GET /api/leads/:id/activities`: Chronological interaction history (calls, emails, meetings, notes, status changes, assignments).
- `POST /api/leads/:id/activities`: Manually log activity (`call`, `meeting`, `email`, `note`). System types (`status_change`, `assignment`) are reserved.

---

## 8. Tasks (`/api/tasks`)

- `GET /api/tasks`: List tasks visible to caller (assigned to, created by, or manager of assignee).
- `POST /api/tasks`: Create task. Triggers in-app notification and email hook.
- `GET /api/tasks/:id`: Get task details.
- `PUT /api/tasks/:id`: Update task.
- `PATCH /api/tasks/:id/status`: Status transition (`pending`, `in_progress`, `completed`, `cancelled`).
- `DELETE /api/tasks/:id`: Hard delete task.

---

## 9. Dashboard, Reports & Analytics (`/api/dashboard`, `/api/reports`)

### 9.1 Dashboard Metrics
- **Route:** `GET /api/dashboard`
- **Permission Required:** `dashboard.view`
- **Output:** Scoped real-time summary:
  ```json
  {
    "totalLeads": 142,
    "newLeads": 18,
    "convertedLeads": 35,
    "lostLeads": 12,
    "leadsByStatus": [ { "status": "New", "count": 18 } ],
    "leadsByProduct": [ { "product": "BookEHealth", "count": 64 } ],
    "leadsBySource": [ { "source": "LinkedIn Inbound", "count": 48 } ],
    "pendingFollowUps": 7,
    "pendingTasks": 4
  }
  ```

### 9.2 Scoped Analytics Reports
All report endpoints accept `?format=json` (default), `?format=csv`, or `?format=xlsx`.
CSV and XLSX exports enforce **Formula Injection Defense** (prefixes dangerous characters `=`, `+`, `-`, `@` with single quote `'`).

- `GET /api/reports/leads-by-status`: Status breakdown with counts and conversion ratios.
- `GET /api/reports/leads-by-source`: Acquisition channel effectiveness.
- `GET /api/reports/leads-by-product`: Product interest distributions.
- `GET /api/reports/team-performance`: Rep breakdown (leads created, assigned, converted, follow-ups done).
- `GET /api/reports/conversion-rates`: Lead-to-deal conversion percentages per source and product.

---

## 10. Bulk Import (`/api/leads/import`)

### 10.1 Download Import Template
- **Route:** `GET /api/leads/import/template`
- **Permission Required:** `leads.import`
- **Returns:** Formatted Excel XLSX spreadsheet (`lead_import_template.xlsx`) with sample rows and valid dropdown codes.

### 10.2 Execute Bulk Import
- **Route:** `POST /api/leads/import`
- **Permission Required:** `leads.import`
- **Content-Type:** `multipart/form-data` (file field `file`, up to 5MB, `.csv` or `.xlsx`)
- **Processing Engine:**
  - Validates required fields row-by-row.
  - Normalizes email, mobile, and URLs.
  - Duplicate check skips existing leads cleanly.
  - Generates audit log with total processed, imported, and failed counts.
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Import completed",
    "data": {
      "totalRows": 50,
      "importedCount": 47,
      "skippedDuplicates": 3,
      "errors": []
    }
  }
  ```

---

## 11. Notifications & Email Dispatch (`/api/notifications`)

- `GET /api/notifications`: Paginated in-app alerts (`?unreadOnly=true`).
- `GET /api/notifications/unread-count`: Returns `{ "unreadCount": 5 }`.
- `PATCH /api/notifications/:id/read`: Marks single notification read.
- `POST /api/notifications/mark-all-read`: Marks all unread alerts read.
- `POST /api/notifications/device-token`: Registers FCM push token (`android`, `ios`, `web`).
- `DELETE /api/notifications/device-token`: Removes FCM device token upon logout.
- `POST /api/notifications/test-email`:
  - **Permission Required:** `users.manage`
  - Sends a verified test email using the configured SMTP transport.
  - Returns `{ "sent": true }`.

---

## 12. System Audit Logs (`/api/audit-logs`)

- **Route:** `GET /api/audit-logs`
- **Permission Required:** `audit.view`
- **Query Parameters:** `page`, `limit`, `action`, `entityType`, `startDate`, `endDate`, `userId`
- **Security:** Redacts sensitive credentials, passwords, and tokens from `oldValues` and `newValues`.

