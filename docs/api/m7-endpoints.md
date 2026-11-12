# Module 7 API Endpoints (Dashboard, Reports, Notifications, Bulk Import, Audit Logs)

| Method | Path | Permission Required | Notes |
|---|---|---|---|
| GET | `/api/dashboard` | `dashboard.view` | Summary metrics: totalLeads, newLeads, convertedLeads, lostLeads, leadsByStatus, leadsByProduct, leadsBySource, pendingFollowUps, pendingTasks. Scoped strictly by role. |
| GET | `/api/reports/leads-by-status` | `reports.view_*` | Aggregates leads by status with counts and percentages. Accepts `?format=json\|csv\|xlsx`. |
| GET | `/api/reports/leads-by-source` | `reports.view_*` | Aggregates leads by source vertical. Accepts `?format=json\|csv\|xlsx`. |
| GET | `/api/reports/leads-by-product` | `reports.view_*` | Aggregates leads by product code/name. Accepts `?format=json\|csv\|xlsx`. |
| GET | `/api/reports/team-performance` | `reports.view_*` | Employee breakdown: leads created, assigned, converted, and follow-ups completed. Accepts `?format=json\|csv\|xlsx`. |
| GET | `/api/reports/conversion-rates` | `reports.view_*` | Conversion rate percentage per product and source. Accepts `?format=json\|csv\|xlsx`. |
| GET | `/api/leads/import/template` | `leads.import` | Downloads Excel XLSX template (`lead_import_template.xlsx`) with sample data. |
| POST | `/api/leads/import` | `leads.import` | Multipart file upload (`file`, up to 5MB, .csv or .xlsx). Validates rows, checks duplicates, inserts leads, logs audit. |
| GET | `/api/notifications` | Authenticated | Paginated notifications list for current user. Supports `?unreadOnly=true`. |
| GET | `/api/notifications/unread-count` | Authenticated | Returns `{ unreadCount: number }`. |
| PATCH | `/api/notifications/:id/read` | Authenticated | Marks a specific notification as read. |
| POST | `/api/notifications/mark-all-read` | Authenticated | Marks all unread notifications for current user as read. |
| POST | `/api/notifications/device-token` | Authenticated | Registers/updates FCM device token with platform (`android`, `ios`, `web`). |
| DELETE | `/api/notifications/device-token` | Authenticated | Removes an FCM device token. |
| GET | `/api/audit-logs` | `audit.view` | Paginated system audit log viewer with action/entity/date filters and sensitive field redaction. |

