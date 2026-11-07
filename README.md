# LI CRM – Lead & Customer Management System

A web and mobile CRM for Logische Innovative to manage leads, companies, contacts,
follow-ups and sales activities across LearnProfessional, BookEHealth and LI.

> Status: **Module 3 (Backend Core & Authentication)** completed.

## Repository structure

| Folder | Purpose |
|---|---|
| `backend/` | REST API (Node.js, Express, TypeScript, PostgreSQL, JWT, Swagger) |
| `web/` | Web app (React) |
| `mobile/` | Android app (Flutter) |
| `database/` | Schema migrations (`001_init_schema.sql`, `001_reference_data.sql`), seed scripts |
| `docs/` | Architecture, API docs (`docs/api/authentication.md`), Swagger spec |
| `tests/` | API collections and end-to-end tests |

## Tech stack
Node.js · Express · TypeScript · PostgreSQL · JWT · Bcrypt · Swagger · React · Flutter

## Architectural Decisions & Known Issues
- **Roles Architecture**:
  - `roles` table stores the 4 roles: `Admin`, `Business Head`, `Sales Executive`, `Marketing Executive`.
  - `users.role_id` references `roles(id)`.
  - Public registration (`POST /api/auth/register`) automatically assigns the lowest role (`Marketing Executive`).
- **Duplicate Lead Detection**: Performed at the **API layer (Module 5)**, not via a database unique constraint on email or phone. This accommodates lead re-engagement, multi-channel captures, and merge workflows.
- **Token Rotation & Security**: Short-lived access tokens (15m) + refresh tokens (7d) stored in `refresh_tokens` table. Using an already revoked/rotated token triggers instant session revocation across all devices (token reuse detection).

## Quick Start (Backend)

```bash
cd backend

# 1. Configure environment
cp .env.example .env

# 2. Run database migrations
npm run migrate

# 3. Seed test users and sample data
npm run seed

# 4. Start API server
npm run dev

# 5. Run Auth Test Suite
npm run test:auth
```

### Interactive API Docs (Swagger)
Once the server is running, open:
`http://localhost:4000/api/docs`

### Seed Test Accounts (All 4 Roles)

| Role | Role Code | Email | Password |
|---|---|---|---|
| **Admin** | `admin` | `admin@licrm.example` | `Admin@12345` |
| **Business Head** | `business_head` | `businesshead@licrm.example` | `Sample@12345` |
| **Sales Executive** | `sales_executive` | `sales@licrm.example` | `Sample@12345` |
| **Marketing Executive** | `marketing_executive` | `marketing@licrm.example` | `Sample@12345` |
