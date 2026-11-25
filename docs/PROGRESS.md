# Progress tracker (updated 2026-11-03)

How to read this: **Code done** = written and passing its own automated tests (fake providers, throwaway databases). It does NOT mean it has been run in a browser or against a real account. **Live-checked** = someone ran it for real. Almost nothing is live-checked yet. Percentages are estimates, not measurements.

| Area | Code done | Live-checked | What is pending |
|---|---|---|---|
| CashFlow: accounting engine, GST, TDS, income tax, month close | ~95% | 0% | 36 items in `docs/accounts-plan-checklist.md` (setup wizard, GSTR files, fixed assets, year-end, audit pack) |
| CashFlow: "My work" (daily/weekly/monthly/quarterly/yearly) | ~100% | 0% | open in browser, real company data |
| AgentOS: Agent Hub, text + voice agents, call history/audio | ~100% | ~10% (ElevenLabs API called for real once) | browser check, real call |
| Voice calling engine (phone, conference, takeover, public, briefing) | ~100% | 0% | needs public https URL, Twilio number, verified test number |
| DealFlow AI (voice moved out, panels, meetings) | ~100% | 0% | browser check |
| Meetings (schedule, guests, live room, AI agents) | ~100% | 0% | real LiveKit test, browser check |
| ViralPulse: sidebar, dashboard, posts, ads, studios, analytics | ~95% | 0% | `npm run build`, browser, UGC wizard steps 3-5 AI buttons, developer-app approvals |
| ViralPulse: real publishing and real Meta ads | ~100% code | 0% | company developer approvals (Meta, YouTube, LinkedIn, X, Google) |
| Playbook AI + ContractFlow rebuild (simple structure, plan: docs/playbook-simple-plan.md) | ~90% (P1-P10 built; P11 and some P10 details pending) | 0% | owner click-through; P11 (stamp upload, bulk send); sealing/placement details |

## Playbook AI + ContractFlow (single agent, one feature at a time)
Plan and decisions: `docs/playbook-audit-and-plan.md` (Build log at the end is updated after every feature).

Track A: Playbook authoring
- A0 setup: DONE
- A1 document model: DONE
- A2 PDF renderer: IN PROGRESS
- A3 DOCX renderer: next
- A4 versions, A5 export routes, A6 editor, A7 brand, A8 variables, A9 templates, A10 numbering and approvals, A11 AI engine and fact guard, A12 create wizard, A13 comments and share links
- A14-A18 template batches (HR, contracts, management/ops/IT, vendor/pre-sale/finance, training/marketing/legal)
- A19 SOP migration, A20 DOCX import (optional)

Track B: ContractFlow and handoff
- B0 reset, B1 clone store and editor, H1 send for signature, H2 status back to Playbook
- B2 request model, B3 OTP (email default, SMS after DLT), B4 signer experience, B5a stamp rulebook, B5b stamp certificate upload, B6 sealing and certificate
- B7 company controls, B8 bulk send, B9 party model, B10 vault, B11 renewals and retention, B12 employee letters in TalentOS portal

Playbook dashboard (new home of Playbook AI): DONE, owner click-through pending
- `/playbook-ai/dashboard` (first item in the sidebar; `/playbook-ai` redirects to it): KPI cards with change against the previous period, created over time, signing funnel, category, department, turnaround, AI use, library vs scratch, top templates, versions, downloads, needs-attention lists, activity, team, brand status, quick actions, date range (7, 30, 90 days, this FY, custom) and CSV export.
- Code: `src/lib/products/playbook-ai/dashboard/` (pure aggregation, ranges, CSV; `fetch.ts` for the scoped reads and a 60 second cache), `components/products/playbook-ai/dashboard/`. Test: `scripts/test-pb-dashboard.ts`.

ContractFlow dashboard (own page): DONE, owner click-through pending
- `/contractflow-ai/dashboard` is the first sidebar item and `/contractflow-ai` redirects to it. Shared kit: `src/components/dashboard-kit/` (charts and blocks used by both dashboards). Code: `src/lib/products/contractflow-ai/dashboard/`. Test: `scripts/test-cf-dashboard.ts`.

Form popups as pages: DONE (owner click-through pending)
- Send to ContractFlow, Send for signature, Void and Save as version are pages (sidebar "Current task"); previews, details, confirms and editor tools stay popups. Inventory in the Build log of `docs/playbook-simple-plan.md`.

Moving to another Vercel account (platform infra): DONE, needs a real Vercel account to verify
- Domain sync (`src/lib/platform/domains/sync/`: pure engine, real Vercel adapter with 429 backoff, Mongo store, runner), optional release from the old project (Integrations, Previous Vercel project), daily cron runs it, also runs after the Vercel settings change and on the first boot of a different project; Console Domains & SSL has the cards, Sync now with dry run, progress, log, failed list with Retry and CSV. Blob migration (`src/lib/storage/blob-migrate.ts`, `blob-migrate-run.ts`, Integrations, File storage). Runbook: `docs/migrate-vercel-account.md`. Tests: `npm run test:migrate` (fakes only).

Portable deployments (only MONGODB_URI and SAAS_HOSTS): DONE, needs a real Vercel account to verify end to end
- Encryption keyring in the database (`src/lib/platform/keyring/`, wrapped with a KEK from MONGODB_URI + SAAS_HOSTS; versions; `npm run key:rewrap`), all crypto call sites go through it. Staff never overwritten; `/setup` first-run admin. Cron works without CRON_SECRET (`src/lib/cron/auth.ts`, half-interval limit + lease). Vercel project detected from the system variable, team discovered, wildcard detected. Setup status card (Console dashboard, `/console/health`) incl. Blob probe. Blob migration now continues from the `domains` cron (no cron or route of its own). `npm run portability:check` (throwaway DB only: 10 checks pass). Tests: `npm run test:keyring`, `npm run test:migrate`. Runbook `docs/migrate-vercel-account.md` (env audit table, trade-off, minimal steps).

Fully dynamic deployments (env adoption, files in the database, platform hosts, DNS, Hobby build): DONE, needs a real Vercel account to verify
- Env adoption into the database (`src/lib/platform/adopt/`, classification table in `portability/env-classes.ts`, guarded by a test), legacy product keys as keyring versions, overlay of adopted vars into `process.env`. Files in MongoDB GridFS by default with Blob as legacy source and optional backend (`storage/gridfs.ts`, `blob.ts`, `blob-to-gridfs.ts`). Platform hosts derived from SAAS_HOSTS and synced (root redirects to www), DNS authority detection and DNS copy tool. Build is 8 lambdas (was 10; limit 12), `npm run check:functions`. Tests: `npm run test:portability`, `test:gridfs` (throwaway DB), `test:keyring`, `test:migrate`.

Key safety and 2FA resilience (urgent fix after a deployment arrived with the wrong encryption key): DONE, needs the real deployment to verify
- Key verification (verified/unverified, canary, probe over known ciphertext locations + shape scan), never silently activating a key that opens nothing, Encryption key mismatch alert, locked mode never writes; sign-in without false "wrong code" or lock-outs (recovery code, email code, platform break-glass, staff reset), forced re-enrolment; Console Health: add previous key, one-time key backup reveal, recovery passphrase, one-click rotation with lazy re-seal. Tests: `test:keyring` (24), `scripts/test-two-step-recovery.ts` (9, throwaway DB), `portability:check` (15, includes the wrong-key scenario).

Quiet key mismatch handling and multi-method second step: DONE, needs a browser check
- Customer-safe wording everywhere (test: `scripts/test-no-infra-leak.ts`); staff-only alerts; `npm run twofactor:doctor`; any mix of authenticator, email code and recovery codes with "Try another way", Manage methods, one step-up re-authentication (`ReAuthGate`), policy in Console Health. Tests: `scripts/test-second-step.ts` (10), `test-two-step-recovery.ts` (11, throwaway DB), `test-twofactor-doctor.ts` (6), `test-keyring.ts` (25).

SMS code and the always-visible method chooser: DONE, real Twilio/DLT and a real sign-in not verified
- `SecondStepScreen` (method input plus a "Try another way" card for every method, screenshots checked with `scripts/shot-second-step.ts` against the dev harness `/dev-editor-harness/second-step`), SMS code method (`security/sms-otp.ts`, Console Integrations fields incl. DLT, policy toggle, Manage methods row with add/change number, preferred per method). Tests: `scripts/test-sms-second-step.ts` (6, throwaway DB), `test-second-step.ts` (13), `test-two-step-recovery.ts`, `test-no-infra-leak.ts`.

Hosts stuck on a disabled old Vercel project: DONE in code, needs the real project to verify
- Domain sync trusts only the live project list and live verification (stale caches ignored), expands customer domains to website + app + www/apex, releases/attaches/records TXT with a plain next step, refreshes "last checked", restarts cleanly; staff note for 402 DEPLOYMENT_DISABLED; staff "Missing settings" checklist with Tests; Blob token paste starts the copier; missing-file audit with CSV; friendly "file not available". Tests: `test-domain-sync` (23), `test-blob-gridfs-copy` (4), `test-host-recovery` (2), `test-portability`.

Automatic moves from the previous Vercel project: DONE in code, real Vercel not verified
- One staff banner (no per-host instructions), previous project listed first and every company/platform host on it moved, real release failure reasons kept for staff, "Connected: <project> (<team>)", "Remove the previous token now", previous project kept automatically on a project change (Console save or boot). Tests: `test-domain-sync` (25), `test-previous-project` (6).

Hardening: Z1 security and tenancy, Z2 performance, Z3 legal and content review

Counting: 2 of about 40 features done = about 5%.

## Things only the owner can do
1. Run `npm run build` once (stop the dev server first).
2. Open each new screen in a browser and report problems.
3. Real accounts: Twilio (public URL, number, verified numbers), ElevenLabs, Gemini, OpenAI keys; Meta/YouTube/LinkedIn/X/Google developer apps and approvals.
4. Legal review of legal templates by a qualified advocate.

## Build memory and CommandOS audit (2026-11-15)
- Build memory: measured, still OOM at 7.5 GB (7407 MB at 643 s) even with shared runtime; options and exact deploy steps in docs/build-memory.md (prebuilt deploy path ready).
- CommandOS restructure P0 audit: DONE, docs/commandos-audit.md plus 5 generated companions; P1 awaits owner decisions D1-D10.

## CommandOS restructure P1: central organization service (2026-11-15)
- `src/lib/platform/organization/` is the only accessor of departments, teams and designations (data stays in the canonical hrms_* collections, so every id keeps working). CRUD only, unique names (departments per company, teams and designations per department), archive instead of delete with "in use" counts, restore, audit events, company scoping via the scoped DB.
- Replaced copies: starter list (32 names) lives only in `organization/defaults.ts`; Playbook's `sop_departments` is now a mirror created/renamed through the service; TalentOS Departments page is read-only with a link to CommandOS Organization; SpendIQ, Huddle and AI entities read through the service; `OrgPicker` used in the 4 SpendIQ forms.
- Migration `scripts/migrate-organization.ts` (dry-run default, --apply, --revert, --id, throwaway DB only). Tests: `npm run test:organization` (16 pure + static, 15 on a throwaway DB).

## CommandOS restructure P2: access model (2026-11-15)
- `src/lib/access/`: 265 features (stable keys, generated from the 20 role files), one `access` map per person with two levels, `can` / `requireAccess`, Director always write, self-service outside the matrix, read model for Preview and locked items, compatibility adapter (matrix to legacy roles and overrides, verified against the legacy functions), legacy-to-map migration (dry-run/apply/revert, throwaway DB only).
- Parity harness: 2,516,970 comparisons, zero differences. Intentional differences listed in `docs/commandos-access-model.md`. No UI changed.
- D7 classified list (65 must guard, 37 intentionally open) added to `docs/commandos-audit.md`.

## CommandOS restructure: leftovers from P1/P2 and P3 People & Access (2026-11-15)
- Leftovers: `OrgPicker` / `OrgMultiPicker` now in TalentOS EmployeeForm, employee/attendance/payout/dashboard filters, SpendIQ filters, Huddle announcement composer, onboarding wizard, CommandOS team/designation sheets and the Playbook item wizard (department and designation, ids kept beside the names). Free-text department fields converted: CashFlow cash accounts and transactions (`departmentId` beside `department`), Playbook item meta. Designation actions no longer create a role per designation (D6); the 653-template role seeding is no longer run from the Users page.
- Playbook tests fixed: the documents-page test was stale (the page is now the shared My items page and the service enforces VIEW); `advocate_notes` is a real draft-only key and was missing from the allowed list (code fixed, test list updated); the JD golden was stale (updated); the catalogue added duplicate section titles (a second Declaration, Details) and put merge tokens inside plain text nodes in the shared review sentence (both fixed in code). test:playbook still stops at `test-pbdoc-pdf` (image embedding), not touched by this work.
- P3: `/commandos/users` (list: search, filters by department/team/designation/status, KPI row, `...` menu), `/commandos/users/new` and `/commandos/users/[id]/edit` (3 steps), person side panel without role language. Saving writes the `access` map and the derived older roles and overrides; maps older roles would widen are refused; an email invitation carries the map. The old role editor, custom role picker, access matrix, overrides sheet and create sheet are deleted. Tests: `npm run test:people` (19), `test:access`, `test:organization`. Screenshots from the dev harness (`/dev-editor-harness/people`, `scripts/shot-people.ts`).

## CommandOS P4: unified employee experience (2026-11-15)
- Logo fix: with the company details block off, the logo prints alone at the top of page 1 (PDF, DOCX, editor); never a running header. `test:playbook` now runs green to the end: stale tests updated (DOCX signature lines, text-order parity, own-content watermark rule, logo placement), catalogue content fixed (duplicate titles, merge tokens in text, reimbursement wording).
- Nav: `resolveNav` returns the Director's list for everyone with each item open or locked; only items that do not exist for the company are hidden. `requireWorkspaceAccess` sends a locked item to `/commandos/locked` (same shell). One cached computation per request.
- Locked page with Directors listed and "Request access" (rate limited, bell + email), request list and "Review and give access" under People & Access.
- Sidebars of 7 products show every item locked or open; employee/student-only menus removed; staff layouts show the locked page. Dashboard and analytics show locked cards. 26 pages and 26 files converted from role checks. `npm run test:shell` (22), dev harness `/dev-editor-harness/shell`, `scripts/shot-shell.ts`.

## CommandOS P5: sidebar regroup, Integrations and Product settings panels (2026-11-15)
- Sidebar is exactly the owner's target (Dashboard; Organization Setup; Users & Access; Billing & plan; Branding & domains; System default; Security & Logs; Engagement; AI Chatbot (Dashboard only); Insight), same for everybody with locked items (P4). "Add a person" and "Sender email" left the sidebar; Voice and chatbot detail screens left it too. Every old address redirects (`lib/products/commandos/moved-urls.ts`).
- Integrations: cards by plain category with SRB/own status badge, Configure opens a right-hand panel (`SidePanel`, address driven). Per-connection "Use SRB (recommended)" or "Use my own account" saved in `workspace_connections.mode` (default SRB; own keys kept; connections saved earlier count as own). AI Chatbot and Voice cards open tabbed panels that render the existing screens.
- Product settings: card per product with Ready / Needs setup and Configure opening the existing settings screen in the same panel.
- Custom domains has the "Send emails from your own address" section with three steps; `/commandos/settings/email` redirects there.
- Analytics has one AI & Voice view; the Voice Dashboard address redirects to it.
- Fixed: pages asked for navigation keys that did not exist (`company.automations`, `company.branding`, `company.roles`, `company.profile`), which would have locked Directors out since P4; a test now checks every guard key exists.
- Tests: `npm run test:restructure` (27), `test:shell`, `test:access`, `test:people`, `test:organization`. Dev harness `/dev-editor-harness/restructure`, `scripts/shot-restructure.ts`.


## CommandOS P6 (rest) and P7: connections tested for real, one company identity, no duplicate configuration (2026-11-16)
- Leftovers closed: `test-workspace-access` is green (57; stale paths, labels and counts updated, and a real bug fixed: the old `/settings`, `/onboarding`, `/upgrade` and `/workspace/...` redirects in `next.config.ts` led to `/workspace/...`, which no longer exists; they now go to `/commandos/...`, with a `/workspace` catch-all). DealFlow tile follows the access matrix (migration `scripts/migrate-dealflow-access.ts`, tested). The three filter pages (Requisitions, Employees, Payouts) match git HEAD except for the OrgPicker department filter. OrgPicker in the SpendIQ budget scope. Real throwaway-database tests for CashFlow `departmentId` and the Playbook item wizard ids (`npm run test:leftovers`, 9).
- P6: one tester interface (`src/lib/platform/connections/testers.ts`): OpenAI, Gemini, ElevenLabs, Twilio (SMS and WhatsApp), WhatsApp Cloud, Resend, SendGrid, SMTP, Razorpay, PageSpeed, Google service account, LiveKit, push keys, Meta, Google/YouTube, LinkedIn and X apps, file storage (write, read back, remove), webhooks (signed `connection.test` ping), and "Send me a test email" (to the signed-in person only). The staff Missing-settings checklist runs the same testers. Results are plain and every credential is scrubbed out of them.
- Status badges come from real state (`connections/platform-services.ts`): "Using SRB" only when the platform really has the service (email needs a real provider, not the console printer; a half-set Twilio is not ready); otherwise "Not available from SRB, add your own". The staff checklist and the cards use the same function.
- "Used by" is computed from the Product Registry (each product row now has `connections`); the hand-written map is gone. Product settings cards show the connections they use and "changes apply to all".
- P7: ONE company identity (`company_identity`, accessor `getCompanyIdentity()`), managed only in Company setup (the wizard step and Settings, Organization profile now carry address, GSTIN, PAN, CIN, financial year and language). TalentOS (payslips, PDFs, billing invoices), SpendIQ, Cohort AI, EvalIQ, SiteCraft, payroll year and time zone read it; their forms show a read-only summary with "Manage in CommandOS". Migration `scripts/migrate-company-identity.ts` (dry-run, apply, revert, conflicts reported).
- Provider keys once: OpenAI (AgentOS, ViralPulse), Google and PageSpeed (RankMax) now show a read-only `ConnectionSummary` with "Manage in CommandOS" and "also used by ... changes apply to all"; no product held a key field. Product code may not read provider environment variables (guard test).
- Settings schema (`src/lib/platform/settings-schema.ts`) with a static check: a new or duplicated settings field fails `npm run test:shared-config` (25).
- "Configuration changed" event (`config-events.ts`) with a shared counter: connections and the identity publish it; a connection change is seen at once in the same process and by other instances within 2 seconds.
- D8: SiteCraft's chatbot copy (actions, loaders, delete buttons, layout) deleted; the nine old addresses redirect straight to the CommandOS panel. D9: in-product settings addresses only redirect.
- Tests this run: `test:connections` 37, `test:shared-config` 25, `test:leftovers` 9, `test:restructure` 27, `test-workspace-access` 57, `test:shell` 22, `test:people` 19, `test:organization` 15, `test:access` 7.
- Not verified: no browser with a real sign-in; no real provider key (every outside call is a stub); the migrations only ran on throwaway data; the OAuth/social "status" probes follow each provider's documented token endpoint but were not run against the real services.
- Left for P8 or the owner: see `docs/commandos-restructure-plan.md` section 9.

## Settings cards: one design (2026-11-16)
- `SettingsCard`, `SettingsGrid` (filters, headings with counts, skeleton), `model.ts` (statuses, filter rules) and `adapters.ts` in `src/components/settings/`; Integrations and Product settings render only these. `IntegrationsView` and `ProductCardsView` deleted. DealFlow sync became the "Lead sources" card (panel). Copy in `connections/card-copy.ts` and `product-groups.tsx`. Test: `npm run test:settings-cards`.

## Setup progress (2026-11-16)
- One setup percentage: `src/lib/platform/setup-progress/` (registry of 60+ steps from real data, weighted scoring, per-product and per-area progress, "Not applicable" for optional steps and "Reviewed" for steps that cannot be derived, both audited). Replaces the old five-step strip count. Shown in the sidebar (first item, with a % badge), a dashboard card, a slim strip, `/commandos/setup`, and a Setup % column plus "Setup stuck" filter in the Platform Console.
- Reminders: daily job `setup-reminders`, in-app after 3 stuck days then a weekly email, both switchable in the Notification center.
- Tests: `npm run test:setup-progress` (26 pure + 14 on a throwaway DB). Docs: `docs/setup-progress.md`.
- Also fixed: a connection change is now announced before the save returns, so the cache never serves a stale value after a save.
- Not verified: real sign-in, real companies, real email delivery.

- 2026-11-17: People & access v2 (A: one `displayTitle`; hide-not-lock in nav; scope helper; bulk access/copy/templates; delegation rule), P8 small items, guard sweep, security review. Remaining: micro-level catalogue, removal of Me sections, P8-B/C/D. See docs/people-access-v2-ledger.md.
- 2026-11-17: micro-level framework plus CyberVault complete (28 features, server-side enforcement, coverage test). Next: TalentOS. See docs/people-access-v2-ledger.md.
- 2026-11-17: RankMax complete (42 micro features, test:rankmax-access). TalentOS needs its own run (staff tier + reporting-line scope + Me tree).
- 2026-11-17: AgentOS complete (17 micro features, Read only truly read only, test:agentos-access). SiteCraft needs its own run (shared LMS gates).
- 2026-11-22: EvalIQ complete (micro features, own/all scope pages, P8-C EvalIQ Read only). Next: ViralPulse.
- 2026-11-22: ViralPulse complete (26 micro features, every page checked). Next: ContractFlow.
- 2026-11-22: ContractFlow complete. Next: SiteCraft with DealFlow (shared Offers/Wallet/Push/Chatbot).
- 2026-11-22: ViralPulse wp0/wp2 tests explained and fixed (stale tests; keyring rotation proven). SiteCraft+DealFlow design hazards written to the ledger.
- 2026-11-22: SiteCraft + DealFlow complete (shared growth tools checked once, one-sided people tested). Next: SprintOS.
- 2026-11-22: remaining products grouped (staff/Me group with TalentOS; CashFlow and Huddle clean). See ledger.
- 2026-11-22: Ask AI enforcement gap closed for the eight finished panels (test:agent-access). Next: CashFlow.
- 2026-11-22: CashFlow complete (micro features per module, subject on the user, layouts/actions/AI gates converted, test:cashflow-access). Next: Huddle, then the TalentOS group (staged).
- 2026-11-23: Huddle complete (20 micro features, test:huddle-access, messenger in FINISHED_PANELS).
- 2026-11-23: wide regression re-run of every npm suite: all green except test:settings-visual (needs playwright-core, not installed) and test:gridfs (needs GRIDFS_TEST_URI). Fixed stale fixtures (voice, meetings: missing subject), test-legal (removed pages), env-classes NEXT_PHASE, ContractFlow event append retry, test-pb-identity-block exit. New npm scripts test:guard-sweep, test:pb-cf-nav, test:huddle-access, test:cashflow-access.
- 2026-11-23: TalentOS staged: shared pieces + Leave module converted (test:talentos-access, test:people-scope).
- 2026-11-23: TalentOS staged: Leave, Attendance, Requests, Holidays converted (4 of 10 modules); Dashboard, Employees+Documents, Payroll, Recruitment, Settings pending.
- 2026-11-23: TalentOS COMPLETE (all 10 modules, hrms in FINISHED_PANELS); security patches listed in docs/commandos-security-review.md.
- 2026-11-23: SprintOS COMPLETE (23 micro features, pms panel in FINISHED_PANELS, test:sprintos-access, leaks fixed).
- 2026-11-23: SpendIQ COMPLETE (44 micro features, prms panel in FINISHED_PANELS, test:spendiq-access).
- 2026-11-23: CohortAI COMPLETE (tms panel in FINISHED_PANELS, test:cohortai-access).
- 2026-11-23: Playbook COMPLETE (34 micro features, sop panel in FINISHED_PANELS, test:playbook-access).
- 2026-11-23: Workspace + DataBrain pass COMPLETE. The Workspace menus (product tiles, analytics entries, chatbot/push rules), the company-wide data areas (KPIs, search, DataBrain catalogue) and DataBrain itself read micro features through `src/lib/access/holds.ts` (`holdsProduct`, `holdsLegacy`); DataBrain is the 16th micro product (`databrain-ai.ask.use`), `intelligence` joined FINISHED_PANELS (every panel with a role list is now finished; workspace/platform/support/portal keep their own permission catalogue), `test:databrain-access` and `test:no-legacy-role-checks` added. Names next to titles: Playbook SOP details, versions, feedback, assignments, the Workspace audit log and the "Approval needed" notice (`nameWithTitle`). FAQ evidence, nav.generated and docs-routes carry no old /me or (staff) paths.
- 2026-11-24: WHITE LABEL (owner rule: no SRB/SelfRun anywhere in a customer app). Product names are plain; "Using SRB" wording became "Included default"; default email sender shows the company name; Playbook/ViralPulse file metadata neutral; addresses page, domains and setup step tell the Director to use their own domain. `test:white-label` (static scan + fake tenant Acme Pvt Ltd) guards it; see docs/white-label.md. Also this run: Playbook numbering race proven not real (uniqueness and no-hole guaranteed; test expectation fixed, 50-run stress on throwaway DBs all passed), stale scripts fixed and wired (`test:search-notifications`, `test:intelligence-chat`, `test:intelligence-planner`; AI metering verified: no double billing), `test:access-sweep` (P8-D), names with titles in Huddle, TalentOS leave, SpendIQ requisitions, invitation email, leave-cancelled notice.
- 2026-11-25: Platform defaults requirement received. Done: audit, ledger and plan (docs/platform-defaults.md), `lib/platform/defaults/integration-map.ts` and `test:platform-defaults`. NOT built: the two Console sections, product default layer, migrations. Owner decisions needed on Razorpay/social-app defaults.
- 2026-11-25: Platform defaults step 1 BUILT: Console Integrations as cards and drawer with impact counts, read-only tests, audit; `test:platform-defaults` (static + two-company runtime) and `test:platform-integrations` wired. Steps 2-5 (SMTP/SendGrid platform accounts, product default store and resolver, Console Product settings) not built.
- 2026-11-25: platform SMTP/SendGrid accounts, one-query impact counts, WhatsApp Cloud company-only reason, Console screenshots read; fixed the drawer close button hidden under sticky headers (all drawers). Product settings defaults not built.
- 2026-11-25: WhatsApp sender compliance DONE: company-written WhatsApp needs the company's own sender; skipped sends are shown neutrally and recorded; `test:whatsapp-sender` (7).
- 2026-11-25: platform email fallback DONE (one retry on the next platform account, never for a company's own); `test:email-fallback` (7).
- 2026-11-25: product settings defaults DONE (store, resolver, Console Product settings, company "Defaults" block, migration with dry-run/apply/revert, static scan) for TalentOS, CashFlow, SpendIQ, SprintOS, Cohort AI, Playbook, AgentOS, EvalIQ, ViralPulse, RankMax, CyberVault; Workspace, ContractFlow, SiteCraft, Huddle, DataBrain have nothing to default. `test:product-defaults` (31). Two-company tests added for push, Resend, domains, storage. Not verified in a signed-in browser; migration not applied to real data.
