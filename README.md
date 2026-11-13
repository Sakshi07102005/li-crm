# LI CRM — Enterprise Lead & Customer Management System

A multi-channel, role-governed web and mobile Customer Relationship Management platform engineered for **Logische Innovative** to manage lead acquisition, pipeline tracking, team collaboration, and sales analytics across three major product verticals:
- **LearnProfessional** (EdTech / Certification)
- **BookEHealth** (Digital Healthcare & Appointment Management)
- **Logische Innovative (LI)** (Enterprise Custom Technology Solutions)

---

## 1. Candidate Deliverables Status

| # | Required Deliverable | Location in Repository / Artifact | Status |
|:---|:---|:---|:---|
| 1 | **Complete Web Application Source Code** | [`web/`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/web) (React 18, Vite, TypeScript, Tailwind CSS) | Verified & Production Ready |
| 2 | **Complete Mobile Application Source Code** | [`mobile/`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/mobile) (Flutter / Dart, Material Design) | Verified & Production Ready |
| 3 | **Backend Source Code** | [`backend/`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/backend) (Node.js, Express, TypeScript, PostgreSQL) | Verified & Production Ready |
| 4 | **Database Schema and Scripts** | [`backend/src/database/migrations/`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/backend/src/database/migrations) & [`database/`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/database) | Verified (`npm run db:verify`) |
| 5 | **API Documentation** | [`docs/api/API_DOCUMENTATION.md`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/docs/api/API_DOCUMENTATION.md) & Swagger UI (`/api/docs`) | Complete REST Specification |
| 6 | **GitHub Repository** | Git initialized with full commit history across `main` | Clean working tree |
| 7 | **Web Deployment URL** | Hosted / Preview: `http://localhost:5173` (Local) / Cloud-ready (`npm run build` in `web/`) | Ready for hosting |
| 8 | **Android APK** | [`mobile/build/app/outputs/flutter-apk/app-release.apk`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/mobile/build/app/outputs/flutter-apk/app-release.apk) | 53.8 MB Release APK compiled |
| 9 | **README with Setup Instructions** | [`README.md`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/README.md) (This document) | Complete setup guide |
| 10 | **5–10-Minute Recorded Demonstration Script** | [`docs/demo/DEMO_SCRIPT.md`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/docs/demo/DEMO_SCRIPT.md) | Word-for-word timed script |

---

## 2. Repository Layout

```
li-crm/
├── backend/                        # Node.js + Express + TypeScript REST API
│   ├── src/
│   │   ├── config/                 # Environment validation (Zod) & Swagger OpenAPI definition
│   │   ├── controllers/            # HTTP request/response controllers
│   │   ├── database/               # Migration runner, schema verification, and seeds
│   │   │   └── migrations/         # Idempotent SQL migrations (001_init, 002_ref_data, 003_index)
│   │   ├── jobs/                   # Scheduled cron workers (follow-up reminders)
│   │   ├── middleware/             # Auth, RBAC, error handler, rate limiter, logger, validator
│   │   ├── routes/                 # Express API modular route definitions
│   │   ├── services/               # Core business logic (auth, leads, notifications, email, tasks)
│   │   ├── utils/                  # Exporters, sanitizers, push sender, crypto helpers
│   │   └── validators/             # Zod input schemas
│   ├── scripts/                    # Proof and probing verification scripts
│   └── package.json                # Scripts & dependencies
├── web/                            # React + Vite + Tailwind CSS Web Frontend
│   ├── src/                        # Components, pages, hooks, contexts, API clients
│   └── package.json
├── mobile/                         # Flutter Android Application
│   ├── lib/                        # Screens, widgets, state management, API service
│   ├── android/                    # Native Android wrapper and Gradle build configuration
│   └── build/.../app-release.apk   # Compiled Release Android APK
├── docs/                           # Architecture docs, API specs, and video demonstration script
│   ├── api/                        # API_DOCUMENTATION.md, swagger.json, modules specs
│   └── demo/                       # DEMO_SCRIPT.md (5–10 min timed video script)
└── database/                       # Raw SQL schema backups and reference data
```

---

## 3. Architectural Highlights & Security Decisions

1. **Role-Based Access Control (RBAC) & Scope Isolation:**
   - 4 System Roles: `Admin`, `Business Head`, `Sales Executive`, `Marketing Executive`.
   - Dynamic query scoping (`leadScope`): Admins see organization-wide data (`leads.view_all`), Business Heads see team data (`leads.view_team`), and Executives are strictly restricted to their own records (`leads.view_own`).
2. **Duplicate Detection Engine:**
   - Evaluated at the service layer prior to insert rather than a simple unique DB constraint.
   - Normalizes emails and isolates the last 10 digits of phone numbers.
   - Preserves business territory boundaries: returns full duplicate lead cards for in-scope matches, but returns an anonymized `outOfScopeCount` if a duplicate exists outside the rep's territory.
3. **Single-Use Token Rotation & Reuse Detection:**
   - Short-lived JWT Access Tokens (15 min) + 48-byte cryptographically secure stored Refresh Tokens.
   - Atomic token exchange via `SELECT ... FOR UPDATE`. Presenting an already revoked/rotated token immediately invalidates all active sessions for that user.
4. **Transactional Row Locking on Pipeline Mutations:**
   - Critical updates (e.g. Lead Reassignment, Status Changes, Follow-up Rescheduling) use PostgreSQL `FOR UPDATE` row locks to prevent race conditions.
5. **CSV / XLSX Formula Injection Defense (CWE-1236):**
   - All exported tabular data sanitizes cells starting with `=`, `+`, `-`, or `@` by prefixing a single quote `'`.
6. **Multi-Channel Notification & Email Engine:**
   - Modular email dispatch with safety HTML escaping (`esc`) and responsive templates (`leadAssignedEmail`, `taskAssignedEmail`, `followUpDueDigestEmail`).

---

## 4. Quick Start: Backend API Setup

### Prerequisites
- Node.js 18+ (tested on Node.js 20 & 22)
- PostgreSQL 14+ running locally or remotely

### Installation & Configuration
```powershell
cd li-crm/backend

# 1. Install dependencies
npm install

# 2. Configure environment
# Copy .env.example to .env and configure DB credentials
Copy-Item .env.example .env
```

### Database Setup & Verification
```powershell
# Create database, run migrations, and seed initial reference data
npm run db:create
npm run db:migrate
npm run db:seed

# Verify all 51 schema constraints, tables, and indices
npm run db:verify
```

### Run the Server
```powershell
# Development server with live reload (port 4000)
npm run dev

# Or build and start production bundle
npm run build
npm start
```

- **Health Check:** `http://localhost:4000/api/health`
- **Interactive Swagger UI:** `http://localhost:4000/api/docs`
- **OpenAPI 3.0 JSON:** `http://localhost:4000/api/docs.json`

---

## 5. Automated Test Suites & Quality Verification

Run each command from `li-crm/backend`:

```powershell
# 1. TypeScript Strict Type-Check (0 errors)
npm run typecheck

# 2. Bonus Email & Notification Test Suite (6 scenarios)
npm run test:bonus

# 3. Core Database & Identity Proof Script
npm run proof

# 4. Domain-specific integration test suites
npm run test:auth    # Auth, JWT, refresh token rotation & reuse detection
npm run test:rbac    # RBAC permissions, role assignment safeguards
npm run test:leads   # Lead CRUD, duplicate checks, status transitions
npm run test:m6      # Companies, contacts, follow-ups, tasks, activities
npm run test:m7      # Dashboard, reports, bulk import, audit viewer
```

---

## 6. Web Application Setup (React + Vite)

```powershell
cd li-crm/web

# Install dependencies
npm install

# Start local development server (port 5173)
npm run dev

# Build production bundle to /dist
npm run build
```
Access the application at `http://localhost:5173`.

---

## 7. Mobile Application Setup (Flutter / Android)

### Pre-Compiled APK
A compiled release APK is ready for installation on Android devices:
- **Path:** [`mobile/build/app/outputs/flutter-apk/app-release.apk`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/mobile/build/app/outputs/flutter-apk/app-release.apk)
- **Install via ADB:**
  ```powershell
  adb install "mobile/build/app/outputs/flutter-apk/app-release.apk"
  ```

### Building from Source (Flutter)
```powershell
cd li-crm/mobile

# Get Flutter dependencies
flutter pub get

# Run on connected device or emulator
flutter run

# Build standalone release APK
flutter build apk --release
```

---

## 8. Seed Demo Accounts & Roles

All accounts are pre-seeded with test data across all product verticals:

| Role | Role Code | Email | Password | Scope Level |
|:---|:---|:---|:---|:---|
| **Admin** | `admin` | `admin@licrm.example` | `Admin@12345` | Global / Organization-Wide |
| **Business Head** | `business_head` | `businesshead@licrm.example` | `Sample@12345` | Department / Team Scoped |
| **Sales Executive 1** | `sales_executive` | `sales1@licrm.example` | `Sample@12345` | Assigned Records Only |
| **Sales Executive 2** | `sales_executive` | `sales2@licrm.example` | `Sample@12345` | Assigned Records Only |
| **Marketing Executive** | `marketing_executive` | `marketing@licrm.example` | `Sample@12345` | Lead Ingestion & Sources |

---

## 9. Documentation Index

- **Comprehensive API Documentation:** [`docs/api/API_DOCUMENTATION.md`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/docs/api/API_DOCUMENTATION.md)
- **5–10-Minute Video Demonstration Script:** [`docs/demo/DEMO_SCRIPT.md`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/docs/demo/DEMO_SCRIPT.md)
- **Interactive Swagger Documentation:** Launch backend and visit `http://localhost:4000/api/docs`
- **Module 3 Auth Specification:** [`docs/api/authentication.md`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/docs/api/authentication.md)
- **Module 6 Endpoints Reference:** [`docs/api/m6-endpoints.md`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/docs/api/m6-endpoints.md)
- **Module 7 Endpoints Reference:** [`docs/api/m7-endpoints.md`](file:///c:/Users/Sakshi%20Sonkul/OneDrive/Desktop/CRM/li-crm/docs/api/m7-endpoints.md)
