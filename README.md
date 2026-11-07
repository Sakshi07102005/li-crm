# LI CRM – Lead & Customer Management System

A web and mobile CRM for Logische Innovative to manage leads, companies, contacts,
follow-ups and sales activities across LearnProfessional, BookEHealth and LI.

> Status: **Module 3 (Backend Core & Authentication)** completed.

## Repository Structure

| Folder | Purpose |
|---|---|
| `backend/` | REST API (Node.js, Express, TypeScript, PostgreSQL, JWT, Swagger) |
| `web/` | Web app (React) |
| `mobile/` | Android app (Flutter) |
| `backend/src/database/` | Verified schema migrations (`001_init_schema.sql`, `002_reference_data.sql`), seed & verification scripts |
| `docs/` | Architecture, API docs (`docs/api/authentication.md`), Swagger spec |
| `tests/` | API collections and end-to-end tests |

## Tech Stack
Node.js · Express · TypeScript · PostgreSQL · JWT · Bcrypt · Swagger · React · Flutter

## Architectural Decisions & Known Issues
- **Roles Architecture**:
  - `roles` table stores the 4 roles: `Admin` (`admin`), `Business Head` (`business_head`), `Sales Executive` (`sales_executive`), `Marketing Executive` (`marketing_executive`).
  - `users.role_id` references `roles(id)`.
  - Public registration (`POST /api/auth/register`) automatically assigns the lowest role (`marketing_executive`).
- **Duplicate Lead Detection**: Performed at the **API layer (Module 5)**, not via a database unique constraint on email or phone. This accommodates lead re-engagement, multi-channel captures, and merge workflows.
- **Token Rotation & Security**: Short-lived access tokens (15m) + refresh tokens (7d) stored in `refresh_tokens` table. Using an already revoked/rotated token triggers instant session revocation across all devices (token reuse detection).

---

## Quick Start (Backend)

Run inside `li-crm/backend`:

```bash
cd li-crm/backend

# 1. Install dependencies
npm install

# 2. Database setup & migrations (schema is verified & final)
npm run db:verify   # verifies 51 schema constraints and tables

# 3. Compile TypeScript
npm run build

# 4. Run automated Auth Integration Tests (15 test suites against real PostgreSQL)
npm run test:auth

# 5. Start development server
npm run dev
```

### Interactive API Docs (Swagger)
Once the server is running, open:
- Swagger UI: `http://localhost:4000/api/docs`
- OpenAPI JSON: `http://localhost:4000/api/docs.json`
- Health check: `http://localhost:4000/api/health`

### Seed Test Accounts (All 4 Roles)

| Role | Role Code | Email | Password |
|---|---|---|---|
| **Admin** | `admin` | `admin@licrm.example` | Value of `SEED_ADMIN_PASSWORD` (default `Admin@12345`) |
| **Business Head** | `business_head` | `businesshead@licrm.example` | Value of `SEED_SAMPLE_PASSWORD` (default `Sample@12345`) |
| **Sales Executive** | `sales_executive` | `sales1@licrm.example`, `sales2@licrm.example` | Value of `SEED_SAMPLE_PASSWORD` (default `Sample@12345`) |
| **Marketing Executive** | `marketing_executive` | `marketing@licrm.example` | Value of `SEED_SAMPLE_PASSWORD` (default `Sample@12345`) |

### Manual Rate Limit Verification
To manually test rate limiting on `POST /api/auth/login`:
1. Start the server with `npm run dev`.
2. Send repeated login requests exceeding `AUTH_RATE_LIMIT_MAX` (default 100 requests per 15 minutes) from the same IP without the test header.
3. The server responds with `429 Too Many Requests`:
   ```json
   {
     "success": false,
     "message": "Too many requests, please try again later",
     "error": {
       "code": "RATE_LIMITED",
       "details": null
     }
   }
   ```
