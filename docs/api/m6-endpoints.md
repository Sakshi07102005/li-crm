# Module 6 API Endpoints

| Method | Path | Permission Required | Notes |
|---|---|---|---|
| GET | `/api/companies` | `companies.view` | List companies with query filters (name/website/location search, industry, size), sort, pagination. Returns scoped `leadCount` and `contactCount`. |
| POST | `/api/companies` | `companies.manage` | Create company. Trimmed name unique case-insensitively; returns `409 COMPANY_EXISTS` on duplicate. |
| GET | `/api/companies/:id` | `companies.view` | Company detail with embedded primary contact and scoped `leadCount`. |
| PUT | `/api/companies/:id` | `companies.manage` | Update company fields. Duplicate check on renamed name. No-op returns 200 without audit. |
| DELETE | `/api/companies/:id` | `leads.delete` | Soft-deletes company (`deleted_at` set). Requires `leads.delete` permission. |
| GET | `/api/companies/:id/contacts` | `companies.view` | List all non-deleted contacts for company. Primary contact first, then createdAt ASC. |
| POST | `/api/companies/:id/contacts` | `contacts.manage` | Add contact to company. First contact auto-primary. Explicit `isPrimary: true` clears existing primary. |
| GET | `/api/companies/:id/leads` | `companies.view` | List leads belonging to company filtered strictly through caller's lead scope. Reuses lead list pipeline. |
| PUT | `/api/contacts/:id` | `contacts.manage` | Update contact fields. If `isPrimary: true`, unsets previous primary. No-op returns 200. |
| DELETE | `/api/contacts/:id` | `contacts.manage` | Soft-deletes contact. If deleted contact was primary, oldest remaining contact auto-promoted to primary. |
| PATCH | `/api/contacts/:id/primary` | `contacts.manage` | Promote contact to primary in transaction, demoting previous primary. |
| GET | `/api/followups` | `leads.view_*` | List follow-ups scoped through parent lead visibility. Supports `tab=overdue\|today\|this_week\|all`, status, leadId filters. |
| POST | `/api/followups` | `followups.manage` | Create follow-up for lead. Lead must be in scope and not closed (Converted/Lost -> 422). Syncs `next_follow_up_at` and creates activity. |
| GET | `/api/followups/:id` | `leads.view_*` | Get follow-up detail. Returns 404 if parent lead is out of scope. |
| PUT | `/api/followups/:id` | `followups.manage` | Update follow-up notes/scheduledAt/assignedTo. Allowed only while status is `pending` (else 422 `INVALID_FOLLOWUP_STATE`). |
| PATCH | `/api/followups/:id/status` | `followups.manage` | Complete, mark missed, or reschedule. Row-locked (`FOR UPDATE`). Reschedule creates new pending follow-up. Syncs `next_follow_up_at`. |
| GET | `/api/tasks` | Authenticated | List tasks visible to caller (assigned to, created by, or manager of assignee). |
| POST | `/api/tasks` | `tasks.manage` | Create task. If `leadId` supplied, validates lead exists and caller has view access to it. Assignee reach validated. |
| GET | `/api/tasks/:id` | Authenticated | Task detail. Returns 404 if caller cannot see task. |
| PUT | `/api/tasks/:id` | `tasks.manage` | Update task fields. Requires `tasks.manage` and visibility to task. |
| PATCH | `/api/tasks/:id/status` | Authenticated | Change task status (`pending`, `in_progress`, `completed`, `cancelled`). Assignee, creator, or manager can change status. If `completed` and has `leadId`, writes activity. |
| DELETE | `/api/tasks/:id` | `tasks.manage` | Hard deletes task from database. |
| GET | `/api/leads/:id/activities` | `leads.view_*` | List activities on a lead ordered newest-first with pagination. Scoped through lead access. |
| POST | `/api/leads/:id/activities` | `activities.create` | Log manual activity on lead (`call`, `email`, `meeting`, `note`). System types (`status_change`, `assignment`, `task`) rejected with 400. Allowed even if lead is closed. |

