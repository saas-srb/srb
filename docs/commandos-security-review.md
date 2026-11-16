# Security review (P8-E), 2026-11-17

Checked by `npm run test:security-review` (static) plus the existing tenancy, guard-sweep and access suites. Nothing was checked against production or with a real sign-in.

| Area | Finding | Status |
|---|---|---|
| Tenancy of new collections | `company_identity`, `config_versions`, `setup_progress`, `setup_progress_snapshots` have fixed ids and are in `KEYED_COLLECTIONS`; `access_templates`, `workspace_connections` use random ids and are company scoped. None is global. | ok, tested |
| Secret masking | Connection views and test results carry the last four characters only; testers scrub values; the title route is `private, no-store` and returns no secret. | ok, tested |
| Rate limits | Added `limitAction` (per company and person): connection test 20/10 min, test email 5/10 min, bulk access 30/10 min, setup marks 60/10 min. | fixed |
| Audit events | Connection saved/removed/mode changed (field count only, never values); template created/updated/deleted; bulk access; setup marks. | fixed |
| IDOR | Person edit, status, marks and bulk access run through `requireWorkspaceAction("company.users")` and company scoped queries; Director only where stated. Delegated managers can only hand out access they hold (create, edit, bulk). | ok, tested |
| Unguarded routes | The "65 unguarded" heuristic was mostly false positives (viewer or `run([...])` wrappers). Replaced by a permanent sweep plus `OPEN_ROUTES` allowlist with reasons. Two real holes fixed: DealFlow contacts route (now `requireLms("VIEW_LEADS")`) and the ViralPulse vcard PDF (draft needs a sign-in). | fixed |
| CSRF / server action origin | Next's same-origin check for server actions is relied on in production; dev-only `allowedOrigins` are not sent to production. | ok, tested |

Not covered: a penetration test, browser-based checks, and a review of every legacy product route beyond the guard sweep.
