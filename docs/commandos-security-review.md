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

## TalentOS access sweep (2026-11-23, People and access staged conversion)

Found while converting TalentOS; each fixed at once with a test (`npm run test:talentos-access`, fake employee, manager and HR sessions on a throwaway database). Checked by tests only, not with a real sign-in.

| Where | Leak | Fix |
|---|---|---|
| `POST /api/talentos/documents` | Any staff role (a manager included) could upload a document onto ANY employee's record. | Only someone who manages employee documents uploads for others, and only for employees they can reach (reporting line, or everyone). Everybody else uploads to their own record only. Decision in `lib/products/talentos/doc-access.ts` (`uploadTarget`). |
| `GET /api/talentos/documents/[id]` | Any staff role could download ANY employee's document. | Own documents, or (staff) documents of employees they can reach (`mayReadDocument`). |
| `GET /api/talentos/employee-signed/[cloneId]` | HR check had no reach check. | Own, or HR for an employee they can reach (`maySeeSignedDocument`). |
| Employee profile page `/talentos/employees/[id]` | Any staff role could open ANY employee's full profile (personal data, leave, attendance, documents) by typing the address; and the salary tab showed anybody's salary read-only whenever a payroll profile existed. | A typed address outside the person's reach is "not found"; the salary tab shows only to people who manage payroll. |
| Recruitment pages `/talentos/recruitment`, `/talentos/recruitment/[id]` | Any staff role (every manager) saw candidates, offers and offered salaries. | Only people who manage employees (HR) open them (polite locked page otherwise). The micro feature `recruitment.view` now needs that capability. |
| Dashboard `/talentos` (formerly the staff home) | A manager saw company-wide headcount, hiring, attrition and distribution numbers. | Company numbers only with the "all" scope (`dashboard.all`); a manager sees their reporting line's operations numbers. |
| Employee bank-account, salary-profile, salary-revision and login actions | A person given the right still acted on any employee. | Each now also needs reach to that employee (reporting line, or everyone). |
| Leave analytics (earlier in this change) | Company-wide for managers. | Confined to the person's reach. |

Checked, no leak: TalentOS Settings (the page is only a redirect to the Director-only CommandOS product settings; its actions check `canManageSettings` and `canManagePayrollConfig`); payroll pages, runs, exports and the payslip PDF (payroll right; an employee only their own approved payslip); the employee list and export. SprintOS, SpendIQ and CohortAI: their staff roles see every record by design (company-wide staff products) and the owner-or-staff routes (requisition attachments and PDFs, certificates, invoices, project PDFs) allow staff or the record's owner only; no route without a check was found beyond what the guard sweep already enforces. Playbook is reviewed when it is converted.

## SprintOS access sweep (2026-11-23)

| Where | Leak | Fix |
|---|---|---|
| `checkProjectAccess` (every project page, attachment route, timesheet action, Ask AI tool) | Any staff role (a manager) was "allowed" on EVERY project and could manage it; only the project list was scoped. | Only the projects the person manages or belongs to, unless they hold the everyone's scope (`projects.all`). |
| Project server actions (save, status, progress, delete, members, milestones, tasks) | Needed only the manage right, so a manager could change any project by id. | Each also requires access to that project. |
| `GET /api/sprintos/documents/[id]` | Any signed-in SprintOS person (even an employee) could download any project document by id. | Needs `documents.view` and access to that project. |
| `POST/DELETE /api/sprintos/documents` | Upload and delete on any project for any manager. | Needs `documents.manage` and access to that project. |
| `GET /api/sprintos/reports/[projectId]` | Any person with the costing right got the report of any project and the portfolio across all. | A project report needs access to that project; the portfolio needs the everyone's scope. |
| `GET /api/sprintos/projects/[id]/pdf` (invoice, receipt) | Any staff role could print the billing document of any project. | Also needs access to that project. |

Tests: `npm run test:sprintos-access` (fake employee, manager and admin sessions on a throwaway database).

## SpendIQ access sweep (2026-11-23)

| Where | Leak | Fix |
|---|---|---|
| Requisition actions (edit, submit, cancel, delete, attachments) | Any staff role (finance, a department manager) could change ANY person's requisition: the check was "owner or any staff". | A person changes their own requisition (`requisitions.submit`); another person's only with `requisitions.manage` (the procurement right). |
| Expense actions (edit, delete, upload invoice) | Same owner-or-any-staff rule on claims. | Own claim with `expenses.submit`; another person's only with `expenses.manage`. |
| Requisition and expense detail pages | The staff page opened any record for any staff role. | A record opens for its raiser, or for the everyone's scope (`requisitions.all` / `expenses.all`). |
| Requisition attachments route | "Any staff role reads any attachment." | Same record rule (`prmsMayOpen`). |

Tests: `npm run test:spendiq-access`. Staff roles still see every requisition by design (procurement, finance and department managers all need the queue); that is the `*.all` scope and is now a visible, removable feature.

## CohortAI access sweep (2026-11-23)

| Where | Finding | Fix |
|---|---|---|
| Certificate PDF, invoice and report routes | "Owner or any staff role" (a mentor reads every student's certificate and fee invoice); reports needed only the training right. | The student's own certificate or invoice, or anyone's with the everyone's scope of that module (`certificates.all` / `payments.all`); reports need `reports.export`. Staff roles keep seeing everything by design, now as a visible feature. |
| Detail pages (student, payment, certificate, assignment, class, batch, program, project) | Protected only by the staff-only layout; the layout is gone. | Each detail page needs the module's everyone's scope. |
| Student actions (submit assignment, edit profile, update a milestone) | Student identity checks only. | Each also needs its own feature (`assignments.submit`, `students.edit`, `projects.update`). |

Tests: `npm run test:cohortai-access`.

## Playbook access sweep (2026-11-23)

Every page, route and server action of Playbook was mapped (`coverage/playbook.ts`). The design is that pages and actions pass the person to the data layer, which re-checks the capability and the object scope (`access.ts`, `seesAllDocuments`, the document, template, brand and export libraries). Findings:

| Where | Finding | Fix |
|---|---|---|
| Ask AI tools "tick checklist item" and "send feedback" | Gated by the read-level view permission, so a Read only person could run them. | They are write features now (`sops.acknowledge`, `sops.feedback`). |
| Playbook home (the SOP dashboard) | The page had no explicit capability check (only the data layer scoped it). | Needs `dashboard.view`; the polite locked page otherwise. |
| Documents, KPIs, SOPs, assigned and my pages | Their lists were guarded only inside the shared list components. | Each section has a layout guard (`documents.view`, `sops.view`) as well. |
| Starter-library details and stamp-duty guidance actions | Open to any signed-in person given Playbook. | Kept open on purpose: shared reference content with no company data (listed in the coverage map with the reason). |

No route without a check was found: cron needs the cron secret, the export, dashboard export, files and download routes go through `exportDocument`, `loadDashboard`, `canEditSop` and `canDownloadSop`. The public signing flow lives in ContractFlow and its allowlist is unchanged.

Tests: `npm run test:playbook-access` and the `test:playbook` chain.

Not covered: a penetration test, browser-based checks, and a review of every legacy product route beyond the guard sweep.

## Workspace and DataBrain sweep (2026-11-23)
- Product tiles and analytics entries in the Workspace, the company-wide KPI/search areas and DataBrain's data catalogue were decided by old role names in several places; they now come from the person's micro features (`access/holds.ts`), so a person who lost a feature loses the tile, the numbers and the data in one step. Typed-URL access still lands on the polite locked page.
- DataBrain: the layout, chat route, delete action and Ask-AI tools all check `databrain-ai.ask.use`; Read only is not enough (asking saves a conversation). Answers still use only data the person may see in the other products (the catalogue areas above).
- Playbook: `feedback` submission is its own write feature (it was behind the read-level view); the `sop` Ask-AI tools for the checklist and feedback are write-gated. Payroll banking settings in the Workspace use the payroll features instead of the old role functions.
- Names with titles in the audit log, SOP details/versions/feedback/assignments and the approval-needed notice (never a product role).
- Known test noise, unrelated to access: `test-pb-numbering` (6 people issuing one document at once expects the winner to hold number 21) fails about 2 runs in 3 on this machine, a timing race in the number counter's give-back, not an access change; `test-search-notifications` "usage was metered" counts 2 where 1 is expected, and `test-intelligence-chat` / `test-intelligence-planner` still expect old /pms paths and the pre-move databrain folder (not in any chain).

## White-label and sweep (2026-11-24)
- The customer-facing leak was brand, not access: product names, shared-service wording, the default email sender name and file metadata named the platform. Fixed and guarded by `test:white-label`. The platform's name remains only on the marketing site, the Console, platform mail and the platform owner's own workspace, through one rule (`isPlatformBrandVisible`).
- `test:access-sweep`: no feature of one product opens another product, Director holds everything, nobody without access holds anything, Read only never writes, and a closed Workspace item never resolves open.
- Metering check: the AI token meter records each model call once (4 calls x 50 tokens = 200 in the assistant test); the earlier "2 rows" was the separate email meter. No double billing.
