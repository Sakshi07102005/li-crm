# LI CRM — 5 to 10-Minute Video Demonstration Script

**Target Duration:** 7:30 – 8:30 minutes  
**Presenter:** Candidate  
**Software Setup Checklist Before Recording:**
1. **VS Code:** Open `CRM/li-crm` workspace. Keep key files ready in tabs:
   - `backend/src/services/lead.service.ts`
   - `backend/src/services/notification.service.ts`
   - `backend/src/services/email.service.ts`
   - `backend/src/middleware/authenticate.ts`
   - `backend/src/database/migrations/001_init_schema.sql`
2. **Terminal 1 (Backend):** `cd li-crm/backend` (Ready to run `npm run dev` or tests).
3. **Browser Tab 1 (Swagger):** `http://localhost:4000/api/docs`
4. **Browser Tab 2 (Web App):** `http://localhost:5173` (React frontend).
5. **Mobile Emulator or Screen Mirroring:** Flutter Android APK running or Vysor/scrcpy showing `li_crm_mobile`.

---

## Time-Coded Demonstration Guide

```
+-----------------------------------------------------------------------------------------+
| Time   | Screen View                     | Spoken Theme                                 |
+--------+---------------------------------+----------------------------------------------+
| 0:00   | Title Slide / Web Dashboard     | Introduction, Business Context & Architecture|
| 1:00   | VS Code & PostgreSQL Schema     | Database Modeling, Constraints & Migrations  |
| 2:15   | VS Code / Postman / Swagger     | Auth, Token Rotation & Safeguards            |
| 3:30   | Web App & VS Code               | Leads, RBAC Scoping & Duplicate Prevention   |
| 4:45   | Web App                         | Sales Pipeline, Follow-ups, Activities & Mail|
| 6:00   | Web App & Terminal              | Reports, CSV/XLSX Security & Bulk Import     |
| 7:00   | Android Emulator / Mobile APK   | Mobile App Cross-Platform Demonstration      |
| 7:50   | Terminal                        | Automated Test Suites & Proof Script         |
| 8:20   | Web Dashboard                   | Conclusion & Submission Summary              |
+-----------------------------------------------------------------------------------------+
```

---

## Detailed Section-by-Section Script

---

### ACT 1: Introduction & Architecture Overview (0:00 – 1:00)

**🖥️ Visual Cue on Screen:**
- Display the React Web Application Login page or Dashboard (`http://localhost:5173`), with the title *Logische Innovative CRM*.

**🎙️ What You Speak:**
> *"Hello everyone. Welcome to the comprehensive demonstration of the **LI CRM** platform, developed for Logische Innovative.
>
> LI CRM is a unified, multi-channel customer relationship management system engineered to streamline lead capture, pipeline tracking, and team productivity across three major enterprise product lines: **LearnProfessional**, **BookEHealth**, and **Logische Innovative core solutions**.
>
> The architecture consists of:
> 1. A robust **Node.js, Express, and TypeScript** backend designed with strict Layered Architecture principles.
> 2. A normalized **PostgreSQL** relational database with transactional integrity and strict row locking.
> 3. A responsive **React single-page application** powered by Vite and Tailwind CSS.
> 4. And a cross-platform **Flutter Android mobile application** for field sales executives.
>
> Today, I will walk you through the architectural decisions, security safeguards, core business logic, and live demonstrations across both web and mobile platforms."*

---

### ACT 2: Database Integrity & PostgreSQL Modeling (1:00 – 2:15)

**🖥️ Visual Cue on Screen:**
- Switch to VS Code.
- Open `backend/src/database/migrations/001_init_schema.sql` and highlight tables: `leads`, `users`, `roles`, `follow_ups`, `refresh_tokens`, `audit_logs`.
- In terminal, show `npm run db:verify`.

**🎙️ What You Speak:**
> *"Let us begin with our database foundation. All database migrations are declared idempotently and verified via our verification engine.
>
> Taking a look at `001_init_schema.sql`:
> - We utilize **UUID primary keys** generated via PostgreSQL's `gen_random_uuid()` to prevent enumeration attacks.
> - The system features a clean **4-role hierarchy**: `Admin`, `Business Head`, `Sales Executive`, and `Marketing Executive`. The schema maps `users.role_id` directly to our `roles` reference table.
> - Lead codes are generated deterministically per product vertical using a thread-safe sequence pattern, for example: `LP-202611-0001` for LearnProfessional or `BE-202611-0001` for BookEHealth.
> - In our `leads` table, we enforce foreign keys for product, source, status, assigned representative, and company, accompanied by automatic timestamp triggers (`set_updated_at`).
> - Furthermore, we maintain specialized audit logs and soft-deletion columns (`deleted_at`) to ensure historical traceability.
>
> When we run `npm run db:verify` in the terminal, you can see all 51 schema constraints, tables, and indices verified with 100% compliance."*

---

### ACT 3: Authentication, Token Rotation & Security Core (2:15 – 3:30)

**🖥️ Visual Cue on Screen:**
- Switch to VS Code: open `backend/src/middleware/authenticate.ts` and `backend/src/services/auth.service.ts`.
- Open Swagger UI (`http://localhost:4000/api/docs`) or make a sample login call.

**🎙️ What You Speak:**
> *"Security in LI CRM is built from the ground up to follow defense-in-depth:
>
> 1. **Password Hashing:** We use **Bcrypt** with configurable salt rounds (defaulting to 12).
> 2. **Token Strategy:** We implement short-lived **JWT access tokens** (15-minute lifespan) paired with cryptographically random 48-byte stored **refresh tokens**.
> 3. **Single-Use Token Rotation:** Here in `auth.service.ts`, when a user refreshes their token, we execute a transaction with `SELECT ... FOR UPDATE`. The old token is immediately stamped with `revoked_at = NOW()`, linked to `replaced_by_id`, and a fresh token is issued.
> 4. **Automatic Token Reuse Detection:** If an adversary attempts to replay an already-revoked refresh token, our security engine detects the anomaly immediately and **revokes all active sessions** across all devices for that user account.
> 5. **Rate Limiting:** Authentication routes are shielded by IP-based rate limiting allowing at most 100 requests per 15 minutes to defeat brute-force attempts.
> 6. All endpoints pass through our centralized error envelope, masking internal database stack traces in production while returning standardized error codes like `TOKEN_REUSE_DETECTED` or `VALIDATION_ERROR`."*

---

### ACT 4: Leads, RBAC Scoping & Duplicate Prevention (3:30 – 4:45)

**🖥️ Visual Cue on Screen:**
- Open the React Web Application (`http://localhost:5173`).
- Log in as **Admin** (`admin@licrm.example`), show full leads list.
- Log in as **Sales Executive** (`sales1@licrm.example`) in an incognito window, show restricted leads list.
- Switch to VS Code: open `backend/src/services/scope.service.ts` (`leadScope`) and `backend/src/services/lead.service.ts` (`checkDuplicate`).

**🎙️ What You Speak:**
> *"Now let's explore **Lead Management and Dynamic Scoping**.
>
> In our CRM, multi-tenant team isolation is enforced at the database query layer through `leadScope`:
> - An **Admin** possesses `leads.view_all`, giving visibility to all organization leads.
> - A **Business Head** has `leads.view_team`, automatically scoping queries to self and direct reporting subordinates.
> - A **Sales Executive** has `leads.view_own`, allowing access only to leads assigned to them or created by them.
>
> Notice what happens on screen: When logged in as Sales Executive `sales1`, only their assigned leads appear in the table. Even if they attempt to craft an API request for another rep's lead UUID, the system responds with a strict `404 Not Found`.
>
> Next, let's examine our **Duplicate Detection Engine** in `lead.service.ts`:
> Before creating a lead, the system normalizes emails and extracts the trailing 10 digits of phone numbers. When a check is run, the engine checks the entire database. If a match exists inside the rep's territory, full duplicate details are returned; if it exists outside their territory, an `outOfScopeCount` is returned to protect business privacy while preventing redundant outreach."*

---

### ACT 5: Pipeline Lifecycle, Follow-ups, Tasks & Email Hooks (4:45 – 6:00)

**🖥️ Visual Cue on Screen:**
- On the Web App:
  1. Open a Lead details page.
  2. Change status from `New` to `In Progress` and then to `Converted`.
  3. Reassign the lead to another sales representative.
  4. Schedule a Follow-up and complete a Task.
- Switch to VS Code: show `notification.service.ts` and `email.service.ts`.

**🎙️ What You Speak:**
> *"Here on the Lead Details view, we have our full pipeline management:
>
> - **State Machine Transitions:** Status changes follow strict rules. Marking a lead `Converted` automatically timestamps `converted_at`. Transitioning to `Lost` requires a mandatory `lostReason`.
> - **Lead Reassignment:** Notice that when I reassign this lead, the backend wraps the update in a transaction using `FOR UPDATE` row locking. It records an immutable entry into `lead_assignments`, logs an activity, and dispatches real-time push and email alerts.
> - **Email & Notification Engine:** In `email.service.ts` and `notification.service.ts`, we implemented modular email templates for:
>   1. `leadAssignedEmail`
>   2. `taskAssignedEmail`
>   3. `followUpDueDigestEmail`
>   Emails feature full HTML escaping to prevent injection attacks and lazy transport initialization with safe error trapping.
> - **Follow-up Reminders:** Scheduling a follow-up automatically updates the lead's `next_follow_up_at` field, and our background cron job scans for due reminders, locks candidate rows, and alerts assignees."*

---

### ACT 6: Analytics, Formula Injection Defense & Bulk Import (6:00 – 7:00)

**🖥️ Visual Cue on Screen:**
- On the Web App: Navigate to **Reports / Analytics** page.
- Show the charts (Leads by Status, Leads by Source, Team Performance).
- Click **Export CSV** or **Export XLSX**.
- Navigate to **Bulk Import** page: show template download and CSV upload.
- In VS Code: briefly show `backend/src/utils/exporters.ts` (`protectFormula`).

**🎙️ What You Speak:**
> *"Let's move to **Analytics and Data Operations**:
>
> - Our Dashboard and Reports aggregate data dynamically based on the caller's role scope. Admins view enterprise metrics, while team leads view their department performance.
> - When exporting to CSV or Excel, we defend against **CSV Formula Injection (CWE-1236)**. As seen in `protectFormula`, any cell beginning with `=`, `+`, `-`, or `@` is automatically prefixed with a single quote to prevent remote code execution in spreadsheet software.
> - Our **Bulk Lead Import** engine supports `.csv` and `.xlsx` files up to 5MB. It validates required columns, checks for duplicates, and creates audit records summarizing total imported vs skipped rows."*

---

### ACT 7: Cross-Platform Android Mobile Application (7:00 – 7:50)

**🖥️ Visual Cue on Screen:**
- Switch to the **Flutter Android Mobile App** (running on emulator or physical phone).
- Demonstrate Login, viewing the Leads List, searching for a lead, viewing Lead Details, and toggling dark/light theme.

**🎙️ What You Speak:**
> *"Now let's observe the **Flutter Android Mobile Application**, compiled to a release APK.
>
> The mobile client is designed specifically for field sales representatives on the go:
> - It connects to the same REST API with secure JWT storage and auto-refresh interceptors.
> - Reps can view their assigned leads, check pipeline stages, search by company or name, and log calls or interactions directly from their mobile device.
> - All mutations sync instantly with the central PostgreSQL database and reflect on the web dashboard in real time."*

---

### ACT 8: Automated Verification & Conclusion (7:50 – 8:30)

**🖥️ Visual Cue on Screen:**
- Switch to the Terminal window.
- Execute:
  1. `npm run typecheck`
  2. `npm run test:bonus`
  3. `npm run proof`
- Conclude on the clean Web Dashboard.

**🎙️ What You Speak:**
> *"Finally, let's verify our codebase reliability in the terminal:
> - Running `npm run typecheck`: TypeScript compiles across all models, controllers, and services with **0 errors**.
> - Running `npm run test:bonus`: Our bonus test suite executes 6 end-to-end email and notification scenarios, all passing cleanly.
> - Running `npm run proof`: The proof engine connects to live PostgreSQL, querying user roles, refresh token states, and audit logs.
>
> In summary, LI CRM delivers an enterprise-grade solution spanning complete backend, web frontend, mobile Android APK, robust PostgreSQL schema, and comprehensive documentation.
>
> Thank you for your time."*

---

## Tips for Delivering the Video

1. **Pacing:** Speak at a steady, conversational pace (~130–140 words per minute).
2. **Audio Quality:** Use a decent microphone or headset in a quiet room.
3. **Screen Resolution:** Record at 1080p (1920x1080) with 125% or 150% UI scaling for readable code.
4. **Mouse Pointer:** Use smooth mouse movements to highlight relevant sections as you speak about them.

