# CommandOS restructure: Phase P0 audit

Date: 2026-11-15. Scope: P0 only (no product code changed). Everything below is read from the code; production was never touched. Requirements R1-R43 are from `docs/commandos-restructure-plan.md`.

Generated companions (re-run with `npx tsx scripts/audit-<name>.ts --write`, read-only):

| File | Content |
| --- | --- |
| `docs/commandos-audit-catalogue.md` | Section (a) in full: 265 capabilities, 92 roles, per capability the override key, meaning, proposed R/W level, default holders, call-site count |
| `docs/commandos-audit-guards.md` | Where access is enforced (per product pages/routes/actions guarded), unguarded routes/actions, files where role changes UI (R9) |
| `docs/commandos-audit-config.md` | Section (c): 107 settings/config/integration pages, libs, collections and keys each touches |
| `docs/commandos-audit-nav.md` | Section (e): 101 nav items grouped as today |
| `docs/commandos-audit-sidebars.md` | 161 items across 10 product sidebars plus feature areas per product folder |

## Key numbers

- 16 products plus the Workspace (CommandOS). 20 role files, 92 roles, 265 capabilities: 78 read, 155 write, 32 "split" (cannot be cleanly read or write), 21 with no call site found.
- 825 pages, 275 API routes, 296 server-action files; guarded: 413 pages, 225 routes, 244 action files (text scan, see limits).
- 82 files change UI by role (51 in CommandOS itself).
- 101 nav items (7 sections, 3 of them hidden from the sidebar).
- Department/team/designation copies: 1 canonical set (`hrms_*`) plus at least 6 other stores/definitions (section b).
- Company identity (name, GSTIN, address, logo, contact) stored in about 8 places (section c).
- Chatbot / voice / ElevenLabs configuration exists twice (CommandOS and SiteCraft) plus AgentOS voice connection.

## (a) Feature catalogue

Full table: `docs/commandos-audit-catalogue.md`. Method: every `src/lib/*-roles.ts` is imported and every capability is evaluated for every role, so the "roles holding it by default" column is computed, not guessed. The role files come in two styles: (1) a permission enum plus `xCan(user, perm)` (hrms, pms, sop, fms, prms, tms, messenger...), (2) predicate functions that call `resolvePermission(ctx, key, fallback)` (aibots, cms, dlms, seo, smms...). Both are covered.

Per product, the rule for the new model is: feature = one catalogue capability (or a group of closely related ones sharing a page area), Read = open and view, Write = create/edit/delete/approve/send/run.

| Product | Roles | Capabilities | read | write | split | no call site |
| --- | --- | --- | --- | --- | --- | --- |
| CommandOS | 1+3 | 1+4 | 3 | 1 | 1 | 4 |
| AgentOS | 4 | 16 | 4 | 10 | 2 | 0 |
| SiteCraft AI | 4 | 19 | 3 | 15 | 1 | 0 |
| CyberVault | 4 | 15 | 4 | 8 | 3 | 1 |
| CashFlow AI | 10 | 18 | 3 | 11 | 4 | 1 |
| TalentOS | 4 | 14 | 2 | 11 | 1 | 2 |
| DataBrain AI | 3 | 2 | 2 | 0 | 0 | 0 |
| DealFlow AI | 4 | 20 | 8 | 10 | 2 | 5 |
| ContractFlow AI | 5 | 20 | 5 | 12 | 3 | 1 |
| Huddle AI | 5 | 6 | 3 | 2 | 1 | 1 |
| EvalIQ | 6 | 31 | 10 | 15 | 6 | 0 |
| Playbook AI (new + legacy) | 5+5 | 18+15 | 12 | 18 | 3 | 1 |
| SprintOS | 4 | 10 | 4 | 4 | 2 | 2 |
| SpendIQ | 6 | 10 | 4 | 5 | 1 | 1 |
| RankMax AI | 5 | 20 | 4 | 15 | 1 | 0 |
| ViralPulse AI | 5 | 16 | 4 | 12 | 0 | 0 |
| CohortAI | 5 | 10 | 3 | 6 | 1 | 2 |
| Total | 92 | 265 | 78 | 155 | 32 | 21 |

(ClientOS, ResolveIQ and Playbook-legacy share roles/portal files; see the catalogue for the exact split.)

### Permissions not expressible as Read/Write (the 32 "split")

Patterns and proposed handling (the exact keys are marked `split` in the catalogue):

1. **Actions with side effects outside the data** (voice call, call takeover, send email/WhatsApp, publish to a social network, publish website, run a bot). Proposal: part of Write of the owning feature, but the destructive/external ones become a distinct feature row ("Place calls", "Publish") so the Director can give Read & Write on drafts without giving the power to publish. Two levels stay; the catalogue gets finer features, not more levels.
2. **Approval powers** (approve expense, approve leave, approve payroll, sign contract). Proposal: separate feature ("Approvals") with Read = see the queue, Write = approve/reject. Segregation of duties (cannot approve own item) stays as a business rule in the product, not a permission.
3. **Own-data vs all-data scope** (my tasks vs everyone's, my payslip vs payroll). Today expressed as roles (employee vs manager). Proposal: the baseline "self-service" features (My tasks, My leave, My payslips, My chats) are granted to everyone as Read & Write on own records, cannot be removed (R9: same sidebar), and the "all" feature is a separate row. This is the single biggest semantic change and needs an owner decision (decision D3).
4. **Restore/rollback** (restore page version, restore backup). Proposal: Write of the feature.
5. **Export / download of sensitive data** (CyberVault reveal secret, payroll export). Proposal: its own feature, since read of the list does not imply read of the secret.
6. **Director-only structural powers** (`hasAdminAccess`, manage billing, manage users, domains, security). Proposal: stay a fixed "Workspace administration" product with features Billing, Users & access, Company setup, Domains, Security, each Read/Write; the Director always holds all at Write and cannot be reduced (plan decision 3).
7. **Public/portal roles** (ClientOS client, EvalIQ candidate, CohortAI learner). These are external users in `external_users`, not staff; they are NOT part of the matrix and keep their own sessions.

### 21 capabilities with no call site found

Heuristic scan (regex on imports/calls), so some are false negatives. In P2 each is either wired to an enforcement point or dropped from the matrix. They are listed per product in the catalogue (column "Call sites" = 0).

### Where access is enforced today

`docs/commandos-audit-guards.md`. Unguarded by the scan: 275 routes minus 225 guarded = about 50 routes and 52 action files, concentrated in viralpulse-ai (24), (platform/shared) (20), sitecraft-ai (12), agentos (9), dealflow-ai (7), playbook-ai (7), talentos (7). Many of these are public/webhook/cron routes with their own secret or signature check (legitimate), but each needs a human decision in P8; the file lists are in the guards doc. R11 requires server-side enforcement per feature; today enforcement is per route group and per product role, not per feature.

## (b) Department / team / designation inventory

Canonical today: `hrms_departments`, `hrms_designations`, `hrms_teams` (TalentOS service `src/lib/products/talentos/departments.ts`, `src/lib/platform/designations.ts`); the CommandOS pages `/commandos/settings/organization/{departments,teams,designations}` already edit these.

| # | Where | What | Kind | Unification |
| --- | --- | --- | --- | --- |
| 1 | `hrms_departments`, `hrms_designations`, `hrms_teams` collections | Canonical rows | store | Keep as THE store; rename logically to `org_*` later via a service, not a collection rename in P1 (zero data risk) |
| 2 | `src/lib/products/talentos/departments.ts` | CRUD (createDepartment, listDepartments...) | service | Move into `src/lib/platform/org/` (already started, untracked folder) and re-export from here |
| 3 | `sop_departments` collection (Playbook `taxonomy.ts`) | Own department rows with `hrmsDepartmentId` link and `syncFromHrms` | COPY | Make Playbook read org departments; keep `sop_departments` as a view keyed by `hrmsDepartmentId`; rows with no link are mapped by name (table below) |
| 4 | `DEFAULT_DEPARTMENTS` in `playbook-ai/constants.ts` | 32 hard-coded department names seeded into `sop_departments` | constant | Becomes the offer list in onboarding templates only, never seeded into a store |
| 5 | `src/lib/platform/designations.ts` | 653 designation templates, 62 role bundles; designation doubles as a role bundle | catalogue | Templates stay as an offer list; role bundle semantic is dropped when the matrix lands (designation = label only, R4 "no permissions") |
| 6 | `src/lib/platform/onboarding/catalog.ts` and `state.ts` (`applyStructure`) | Department templates for onboarding, creates in hrms by name | catalogue + writer | Keep; route writes through the org service |
| 7 | `playbook-ai/templates.ts`, `item-library/*`, `catalogue/templates/t1-hr/*` | Department names as strings in templates/KPIs | constants | Strings stay (content), but pickers must resolve against org departments |
| 8 | `components/products/talentos/HrmsTopbar.tsx` | Hard-coded department names | constant | Replace with org service list |
| 9 | `lib/products/commandos/nav.ts` | "Human Resources" product label, not an org department | label | Not a copy, ignore |
| 10 | Huddle (`app/(products)/huddle-ai/settings`, announcements, user directory) | Reads `hrms_departments/designations/employees` | reader | OK already; keep reading via service |
| 11 | SpendIQ (10 files), CashFlow (9 files), EvalIQ (8), SiteCraft (3) | department used as free-text or picker field on records (expense, budget, test, content) | field | Store `departmentId` referencing org, keep `departmentName` snapshot for reports; pickers use one shared component |
| 12 | AI agent entities `src/lib/ai/agent/entities/{hrms,sop,...}.ts` (7 files) | Entity definitions listing departments for the AI assistant | AI | Point at the org service so AI sees the same list |
| 13 | `contractflow-ai/entity-discovery.ts` | Department-like text detection | parser | Resolve against org list |
| 14 | Teams: `hrms_teams`; Huddle channels/teams (24 occurrences of `teams"`); SprintOS project teams | Teams as org units vs project/chat groups | MIXED | Org team = `hrms_teams`. Huddle channel groups and SprintOS squads are functional groups, not org teams; owner decision D5 (merge or keep) |
| 15 | `admin_users.designationId`, `hrms_employees` | Person references | reference | Stay; the 3-step create writes both |
| 16 | Dev harness pages (`app/dev-editor-harness`) | Hard-coded names | test only | Ignore |

### Mapping table (for the P1 migration)

| Source | Match rule | Target | On conflict |
| --- | --- | --- | --- |
| `sop_departments` with `hrmsDepartmentId` | by id | `hrms_departments._id` | none |
| `sop_departments` without link | case-insensitive trimmed name, then slug | existing `hrms_departments` row | if no match, CREATE org department and set link (additive) |
| Free-text `department` on spendiq/cashflow/evaliq/sitecraft records | same name rule | add `departmentId`, keep text | unmatched rows listed in the dry-run report, left as text |
| Playbook templates/KPIs | n/a (content) | no migration | n/a |
| Designation templates | n/a | offer list only | n/a |

## (c) Configuration / integration inventory

Full page-level table: `docs/commandos-audit-config.md` (107 pages). Summary of what exists and where it is stored:

| Area | Page(s) | Saved in | Read by | Default today |
| --- | --- | --- | --- | --- |
| Third-party connections | `/commandos/settings/integrations` (ConnectionsHub), `/console/integrations` | `workspace_connections` (company), `platform_settings` (SRB) | every product through `platform/connections/resolve.ts` | Company first, SRB fallback (R43 already true in code; no explicit toggle in UI) |
| Sender email | `/commandos/settings/email` | `platform/email/sender.ts` store | all notifications | SRB sender unless company configured |
| Payments (Razorpay etc.) | `/commandos/settings/payments`, per product `/spendiq/payments`, `/cohort-ai/payments`, `/cashflow-ai/payments`, `/commandos/prms/payments`, `/commandos/tms/payments`, `/clientos/payments` | company payment config; plus 5 product payment wrappers | CashFlow, SpendIQ, CohortAI, ClientOS | DUPLICATE entry points; one config |
| Storage | Console integrations (Blob) | `platform_settings` | uploads everywhere | SRB |
| AI keys (OpenAI, Gemini...) | connections catalog; ViralPulse settings resolves `connection:gemini/openai` | connections | AI features | SRB, company override |
| ElevenLabs / voice | `/commandos/chatbot/voice/config`, `/commandos/settings/products/agentos/phone`, `/sitecraft-ai/chatbot/voice/config` | connection `elevenlabs` + `chatbot-config` | AgentOS, chatbot | DUPLICATE (3 pages) |
| AI Chatbot (dashboard, conversations, KB, config) | `/commandos/chatbot/*` (9 pages) and `/sitecraft-ai/chatbot/*` (9 pages) | `chatbot-config.ts`, `voice-conversations.ts`, `chat_sessions` | website widget | DUPLICATE: two page trees over one lib |
| Push notifications | `/commandos/push`, `/commandos/notifications/settings`, `/clientos/notifications/settings`, `/sitecraft-ai/push` | `webpush/store`, `push/store`, VAPID env | all | DUPLICATE (4 pages, 2 stores) |
| Notification center | `/commandos/settings/notifications`, `/schedules` | `notify/center/*` | all | single |
| PWA / apps | `/commandos/settings/app`, `/apps` | `pwa/settings`, branding | all | two pages, one theme |
| Branding & company identity | `/commandos/settings` (company), `/branding`, `/apps`, billing details, legal profile, `/console/settings` | `platform/branding`, `billing-details`, `legal-profile`, `kb-website`, `company_*`, product settings (talentos company, cashflow tax-config GSTIN, cohort settings, spendiq settings, sitecraft site settings) | invoices, payslips, PDFs, website | DUPLICATE in about 8 stores (the "entered twice" case in R33) |
| Domains | `/commandos/settings/domains`, `/console/domains` | `company_domains` | all | single plus Console view |
| Per-product settings | 12 pages `/commandos/settings/products/*` plus 14 in-product `/xxx/settings` pages (cashflow has 9 sub-pages, viralpulse 3, agentos 3) | per-product `settings.ts` stores | own product | DUPLICATE: each product has two entry points (CommandOS and its own) |
| Social connections | `/viralpulse-ai/settings/accounts`, `/agentos/settings` | `smms` accounts, connections | ViralPulse, AgentOS | single-ish |
| SEO / website keys | `/commandos/settings/products/rankmax-ai` (Google service account), `/commandos/settings/products/sitecraft-ai` | product settings, connection `google-service-account` | RankMax, SiteCraft | keys inside product settings rather than connections |
| SMS / WhatsApp | DealFlow `/dealflow-ai/emails`, `/whatsapp`, `/integrations`, connections twilio/whatsapp-cloud | connections | DealFlow | feature pages hold connection forms |
| Security / OTP / VirusTotal | `/commandos/settings/security` | `email_otps`, env | sign-in | env key (VIRUSTOTAL) should be a connection |
| Documents/PDF, backups, import, audit, usage, prompts, automations | `/commandos/settings/*` | own stores | all | single |

### Duplicates found (count: 9 groups)

1. Per-product settings (CommandOS page plus in-product page) for 12 products.
2. AI Chatbot page tree in CommandOS and SiteCraft.
3. Voice / ElevenLabs config in 3 places.
4. Push settings in 4 places and 2 stores.
5. Payments entry points in 7 places.
6. Company identity in about 8 stores.
7. Branding/PWA split over 3 pages.
8. Provider keys held inside product settings (RankMax, ViralPulse) rather than the connections catalog.
9. Connection forms embedded in DealFlow feature pages.

SRB-default vs own: `resolve.ts` already does company-first with SRB fallback, so R42/R43 hold in the backend. Missing is one visible per-connection control "Use SRB (default) / Use my own" and a status chip; providers configured only through product settings (group 8, 9) bypass it.

## (d) R1-R43 gap table

Status: OK = already satisfied, PART = partly, GAP = not done. Phase from the plan.

| Req | Current | Status | Phase |
| --- | --- | --- | --- |
| R1 Company Setup in Organization | nav item exists under Company/Organization | OK | P5 (regroup only) |
| R2 Departments one CRUD | CRUD page exists; copies in sop_departments and consts | PART | P1 |
| R3 Teams one CRUD | page exists; Huddle/SprintOS groups separate | PART | P1 (D5) |
| R4 Designations one CRUD | page exists; designations still bundle roles | PART | P1/P2 |
| R5 People & Access simple | 2,807-line users area, roles+overrides+tiers | GAP | P3 |
| R6 3-step add | stepper exists but different steps | GAP | P3 |
| R7 Access matrix two levels, no "Add Product Roles" | product roles and tiers | GAP | P2/P3 |
| R8 Preview of all details and permissions | access preview exists, not as step 3 | PART | P3 |
| R9 Same UI as Director | 82 files branch on role; 10 sidebars filter by role; talentos staff layout differs | GAP | P4 |
| R10 Only access differs | sidebars hide items | GAP | P4 |
| R11 Server enforcement per feature | per product role guards; about 50 routes and 52 actions unrecognised | PART | P2/P8 |
| R12-R14 Billing, Invoices, Usage | pages exist in Company section | OK | P5 |
| R15 Apps & Downloads | `/settings/app` and `/apps` | PART | P5 |
| R16 Default Domain, R17 Custom Domains | `/settings/domains` | PART | P5 |
| R18 Notification Center | exists | OK | P5 |
| R19 AI Prompts, R20 Scheduled Jobs, R21 Documents, R22 Backups, R23 Import, R24 Audit, R25 Security | all exist | OK | P5 |
| R26 Push Notifications | 4 pages, hidden section | GAP | P5/P7 |
| R27 Analytics | in sidebar:false Analytics section | PART | P5 |
| R28 Connections list (Sender Email, Integrations, Product Settings, Engagement, Push, AI Chatbot, Conversation AI) | spread over `company`, `manage`, `engagement`, `ai` sections | GAP | P5/P7 |
| R29 Restructure, simple | see c | GAP | P5-P7 |
| R30 All integrations one place | ConnectionsHub plus connection forms inside products | PART | P6 |
| R31 All product config one place | 12 CommandOS pages plus 14 in-product settings | PART | P7 |
| R32 No duplicate config | 9 duplicate groups | GAP | P7 |
| R33 Never collect twice | company identity in 8 stores | GAP | P7 |
| R34 User friendly | n/a until built | GAP | P5-P7 |
| R35 Works across all products | partial | PART | P7 |
| R36 No product-own config | each product has its own | GAP | P7 |
| R37 Managed only via CommandOS | in-product settings pages remain | GAP | P7 |
| R38 Auto available to every product | company-first resolver exists for connections only | PART | P7 |
| R39 No duplicates across products | see c | GAP | P7 |
| R40 One structure | per-product `settings.ts` shapes differ | GAP | P7 |
| R41 Simple for all industries | n/a | GAP | P7 |
| R42 SRB default | backend yes, UI toggle missing | PART | P6 |
| R43 Own connection option | backend yes | PART | P6 |

## (e) Navigation map

Detail in `docs/commandos-audit-nav.md`. Today (Director view, 101 items):

| Section | Items | In sidebar |
| --- | --- | --- |
| Dashboard | 1 | yes |
| Products | 19 | NO |
| Analytics | 17 | NO |
| Management | 27 | NO |
| Company | 24 | yes |
| Account | 4 | NO |
| Platform | 1 | yes |
| Engagement | 1 | yes |
| AI tools | 7 | yes |

Brief's six groups and where today's items go:

| Brief group | Today's items |
| --- | --- |
| Organization | setup, departments, teams, designations, users (Company) |
| Billing & Plan | billing, invoices, usage (Company) |
| Branding & Domains | app/apps, addresses (default domain), domains (Company); email moves out |
| System Default | notifications, schedules, pdfs, prompts, backups, import, audit, security (Company) |
| Engagement | push, analytics (today: Engagement section with 1 item and Analytics hidden section) |
| Connections & Automation | integrations, sender email (Company email), product settings (`products`), automations, payments, AI Chatbot (4 pages, AI tools section), Conversation AI (voice dashboard/conversations/ElevenLabs config, AI tools section) |

The three `sidebar:false` sections (Management 27, Analytics 17, Products 19) are product dashboards and per-product management pages reached from the Products panel. Under R9 these stay reachable from the single Director-style shell; the plan shows them locked, not hidden.

## (f) Person-experience audit (R9)

Places where a person's role changes sidebar, layout or UI (detail in guards doc, section "Files where a person's ROLE changes what the UI shows"): 82 files.

- CommandOS 51 files: users area, nav `allow()` rules (101 items filtered by 20 role files), settings pages.
- SpendIQ 10, SprintOS 5, CohortAI 5, TalentOS 4, CashFlow 2, platform 3, DealFlow 1, SiteCraft 1.
- Per-product sidebars (10 files, 161 items): HrmsSidebar, PmsSidebar, TmsSidebar, FmsSidebar, PrmsSidebar, DlmsSidebar, OtsSidebar, MessengerSidebar, SeoSidebar, CmsSidebar filter items with role predicates (`hrmsCan`, `pmsCan`, ...). Item-by-item in `docs/commandos-audit-sidebars.md`.
- TalentOS has a separate `(staff)` layout for non-admin employees (self-service) distinct from the admin layout; this is the clearest R9 violation (employee gets a different shell).
- Top bars and dashboards (HrmsTopbar, product dashboards) show manager vs employee widgets.
- Sessions: each product has its own session collection (`hrms_sessions`, `pms_sessions`, `fms_sessions`, `tms_sessions`, `prms_sessions`, `messenger_sessions`, `hub_sessions`...). R9 does not require merging them, but the shell must be one.

Approach for P4: one shell component driven by the Director's nav; items render locked when `can()` is false; self-service features are always granted (see D3).

## (g) Risks and data-migration plan

### Risks

1. Parity: 20 role files with two styles; any adapter bug silently grants or removes access. Mitigation: P2 test computes, for every role of every product, legacy result vs adapter result over all 265 capabilities.
2. 21 capabilities with no found call site: might be enforced indirectly; do not drop until confirmed.
3. About 50 unguarded routes and 52 action files: some legitimately public; need classification before R11 can be claimed.
4. Self-service vs "all" scope (D3) changes what employees see.
5. Free-text department fields in cashflow/spendiq/evaliq/sitecraft records; matching by name can mis-merge (e.g. "HR" vs "Human Resources"). Mitigation: dry-run report plus manual alias table.
6. Designations as role bundles (653 templates, 62 roles): removing the bundle changes the access people get at creation. Existing people keep their stored roles until converted.
7. Duplicated config removal needs data merge (company identity in 8 stores): conflicts when stores disagree.
8. Real UI behaviour unverified until clicked in a browser per product.
9. Build memory: more routes make the Vercel build heavier (see `docs/build-memory.md`); new pages should reuse dynamic routes.

### Additive, reversible migration plan (departments and roles)

Principles: never delete or rewrite source rows; every step has a dry-run report, an apply with a migration id stamped on touched documents (`_migration: {id, at}`), and a revert that removes only what that id created or unsets only what it set.

1. Departments/teams/designations (P1)
   1. Dry run: for each company count `hrms_*` and `sop_departments`, list unlinked `sop_departments` and their proposed match (mapping table above), list free-text department values per product with counts.
   2. Apply: create missing org rows (stamped), set `hrmsDepartmentId` on `sop_departments`, add `departmentId` beside existing text fields. Nothing removed.
   3. Switch readers to the org service behind a code path (no data change).
   4. Revert: delete rows stamped with the migration id, unset the added fields.
   5. Only after owner confirmation (plan decision 5): retire `sop_departments` writes.
2. Roles to matrix (P2/P3)
   1. Dry run: for each `admin_users` row evaluate legacy capabilities (roles + overrides + customRoleIds) and produce the matrix rows; report any capability that does not map (the 32 split and 21 unenforced).
   2. Apply: write a new `access` field next to the old data, flagged `source: "migrated"`. Legacy fields untouched; adapter derives legacy checks from `access` only for people with the flag, others keep legacy until migrated.
   3. Revert: unset `access`.
   4. Verification: the parity test above must pass for every person before the flag is switched per company.
3. Configuration (P7)
   1. Dry run: list, per company, each shared field (company name, GSTIN, address, logo, currency, timezone, email) with the value in each of the 8 stores and whether they agree.
   2. Apply: write the agreed value into the company config; for conflicts keep the Director's choice made in the dry-run report; stores keep their copy until readers are switched.
   3. Revert: remove the company config document.

## Decisions needed from the owner

- D1. Locked items shown greyed (plan assumption 1) versus a short "no access" page: confirm greyed and visible.
- D2. Confirm the matrix is the only way to grant access and custom roles/"Add Product Roles" are hidden after migration (plan assumption 2).
- D3. Self-service features (my tasks, my leave, my payslips, my chats, my expenses): always on for everybody, outside the matrix? This is needed for R9 to work for plain employees.
- D4. Finer features for risky actions (publish, place calls, approve, reveal secret): accept more feature rows while keeping exactly two levels.
- D5. Teams: are Huddle channel groups and SprintOS squads separate from organization Teams (recommended), or must they merge into org teams?
- D6. Designations stop carrying role bundles (R4 says CRUD only): confirm.
- D7. Which of the roughly 50 unguarded routes are intentionally public (list in guards doc) so P8 can lock the rest.
- D8. Chatbot and voice: keep only the CommandOS pages and remove the SiteCraft copies (recommended), or redirect SiteCraft to CommandOS?
- D9. In-product settings pages: remove (R37) or leave as read-only links to the CommandOS page?
- D10. Staging data for the migrations: a copy of production restored to a throwaway DB, so dry-runs show real counts without touching production.

## Limits of this audit

- Text scans (call sites, guards, role-branching UI) are heuristics: expect some false positives and negatives, flagged where relevant.
- Production data counts quoted in the plan (4 companies, 11 HR departments, 105 SOP departments) are from the earlier read-only inspection, not re-read.
- Nothing was clicked in a browser.

## Unguarded routes and actions: classified list (owner decision D7)

Source: the generated scan in `docs/commandos-audit-guards.md` (102 files with no recognised access check). Classification is by path and name, so it is a first pass: P8 confirms each line by reading the file before it is guarded or left open.

- **Intentionally open (public, webhook, cron-with-secret, assets): 37.** Left as they are; P8 checks that each one verifies its own secret/signature or exposes nothing private.
- **Must be guarded (an action or route inside a product that touches company data): 65.** P8 guards each with `requireAccess` for the feature it belongs to (R11).

### Must be guarded (fixing phase: P8)

| Product | File | Kind |
| --- | --- | --- |
| (platform and shared) | `(platform)/saas/actions.ts` | server action |
| (platform and shared) | `sign/[token]/document/route.ts` | route |
| agentos | `(products)/agentos/(protected)/chat-call-actions.ts` | server action |
| agentos | `(products)/agentos/(protected)/preview-actions.ts` | server action |
| agentos | `(products)/agentos/(protected)/voice-actions.ts` | server action |
| agentos | `(products)/api/agentos/calls/[callId]/audio/route.ts` | route |
| agentos | `(products)/api/agentos/twilio/status/route.ts` | route |
| agentos | `(products)/api/agentos/twilio/transcription/route.ts` | route |
| agentos | `(products)/api/agentos/twilio/voice/route.ts` | route |
| clientos | `(products)/clientos/forgot-password/actions.ts` | server action |
| clientos | `(products)/clientos/join/actions.ts` | server action |
| clientos | `(products)/clientos/register/actions.ts` | server action |
| commandos | `(products)/commandos/forgot-password/actions.ts` | server action |
| commandos | `(products)/commandos/invite/actions.ts` | server action |
| commandos | `(products)/commandos/reset-password/actions.ts` | server action |
| contractflow-ai | `(products)/contractflow-ai/(protected)/clones/[id]/actions.ts` | server action |
| contractflow-ai | `(products)/contractflow-ai/(protected)/clones/list-actions.ts` | server action |
| dealflow-ai | `(products)/api/dealflow-ai/ai/generate-draft/route.ts` | route |
| dealflow-ai | `(products)/api/dealflow-ai/contacts/route.ts` | route |
| dealflow-ai | `(products)/api/dealflow-ai/leads/[id]/messages/stream/route.ts` | route |
| dealflow-ai | `(products)/dealflow-ai/(protected)/careers/applicants/repair-actions.ts` | server action |
| dealflow-ai | `(products)/dealflow-ai/(protected)/leads/impersonate-actions.ts` | server action |
| dealflow-ai | `(products)/dealflow-ai/(protected)/voice-calls/actions.ts` | server action |
| evaliq | `(products)/evaliq/take/actions.ts` | server action |
| playbook-ai | `(products)/playbook-ai/(protected)/documents/[id]/actions.ts` | server action |
| playbook-ai | `(products)/playbook-ai/(protected)/documents/[id]/send-actions.ts` | server action |
| playbook-ai | `(products)/playbook-ai/(protected)/documents/export-actions.ts` | server action |
| playbook-ai | `(products)/playbook-ai/(protected)/documents/new/actions.ts` | server action |
| playbook-ai | `(products)/playbook-ai/(protected)/items-actions.ts` | server action |
| playbook-ai | `(products)/playbook-ai/(protected)/my-templates/actions.ts` | server action |
| resolveiq | `(products)/resolveiq/actions.ts` | server action |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/ai-website/actions.ts` | server action |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/collections/actions.ts` | server action |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/footer/actions.ts` | server action |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/media/actions.ts` | server action |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/navigation/actions.ts` | server action |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/offers/subscribers/export/route.ts` | route |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/pages/[id]/actions.ts` | server action |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/pages/actions.ts` | server action |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/settings/actions.ts` | server action |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/site-identity/actions.ts` | server action |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/theme/actions.ts` | server action |
| sprintos | `(products)/sprintos/(protected)/me/timesheet/actions.ts` | server action |
| talentos | `(products)/talentos/(protected)/me/attendance/actions.ts` | server action |
| talentos | `(products)/talentos/(protected)/me/documents/actions.ts` | server action |
| talentos | `(products)/talentos/(protected)/me/leave/actions.ts` | server action |
| talentos | `(products)/talentos/(protected)/me/profile/actions.ts` | server action |
| talentos | `(products)/talentos/(protected)/me/requests/actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/(protected)/ai-field-actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/(protected)/analytics/actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/(protected)/asset-actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/(protected)/brochures/actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/(protected)/campaigns/ads-actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/(protected)/image-studio/actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/(protected)/posts/wizard-actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/(protected)/settings/accounts/actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/(protected)/settings/publishing/actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/(protected)/ugc/actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/(protected)/vcards/actions.ts` | server action |
| viralpulse-ai | `(products)/viralpulse-ai/ai/route.ts` | route |
| viralpulse-ai | `(products)/viralpulse-ai/media/route.ts` | route |
| viralpulse-ai | `api/viralpulse-ai/brochure/event/route.ts` | route |
| viralpulse-ai | `api/viralpulse-ai/brochure/lead/route.ts` | route |
| viralpulse-ai | `api/viralpulse-ai/vcard/[id]/pdf/route.ts` | route |
| viralpulse-ai | `api/viralpulse-ai/vcard/event/route.ts` | route |

### Intentionally open (documented, left as is)

| Product | File | Why it is open |
| --- | --- | --- |
| (platform and shared) | `(platform)/api/platform/billing/subscriptions/cron/route.ts` | scheduled job; must check the cron bearer secret |
| (platform and shared) | `(platform)/api/platform/billing/trials/cron/route.ts` | scheduled job; must check the cron bearer secret |
| (platform and shared) | `(platform)/api/platform/domains/cron/route.ts` | scheduled job; must check the cron bearer secret |
| (platform and shared) | `(platform)/saas/og/route.tsx` | static or public asset / well-known file |
| (platform and shared) | `(platform)/signup/actions.ts` | sign-in / sign-up flow before there is a session |
| (platform and shared) | `(products)/agentos-public/embed.js/route.ts` | public widget or form for a company's visitors |
| (platform and shared) | `(products)/api/agentos-public/avatar/[botId]/route.ts` | public widget or form for a company's visitors |
| (platform and shared) | `.well-known/security.txt/route.ts` | static or public asset / well-known file |
| (platform and shared) | `api/apps/builds/cron/route.ts` | scheduled job; must check the cron bearer secret |
| (platform and shared) | `api/backup/cron/route.ts` | scheduled job; must check the cron bearer secret |
| (platform and shared) | `api/notify/cron/route.ts` | scheduled job; must check the cron bearer secret |
| (platform and shared) | `api/reactivation/route.ts` | sign-in / sign-up flow before there is a session |
| (platform and shared) | `api/wallet/expiry-sweep/route.ts` | static or public asset / well-known file |
| (platform and shared) | `favicon.ico/route.ts` | static or public asset / well-known file |
| (platform and shared) | `llms.txt/route.ts` | static or public asset / well-known file |
| (platform and shared) | `manifest.webmanifest/route.ts` | static or public asset / well-known file |
| (platform and shared) | `pwa/icons/[file]/route.tsx` | static or public asset / well-known file |
| (platform and shared) | `robots.txt/route.ts` | static or public asset / well-known file |
| agentos | `(products)/api/agentos/cron/route.ts` | scheduled job; must check the cron bearer secret |
| agentos | `(products)/api/agentos/voice/webhook/route.ts` | called by a provider; must verify its signature |
| cashflow-ai | `(products)/api/cashflow-ai/webhooks/[provider]/[companyId]/route.ts` | called by a provider; must verify its signature |
| cashflow-ai | `(products)/api/cashflow-ai/webhooks/[provider]/route.ts` | called by a provider; must verify its signature |
| commandos | `(products)/commandos/verify-email/confirm/route.ts` | static or public asset / well-known file |
| cybervault | `(products)/api/cybervault/cron/route.ts` | scheduled job; must check the cron bearer secret |
| dealflow-ai | `(products)/api/dealflow-ai/meetings/cron/route.ts` | scheduled job; must check the cron bearer secret |
| evaliq | `(products)/api/evaliq/cron/route.ts` | scheduled job; must check the cron bearer secret |
| playbook-ai | `(products)/api/playbook-ai/cron/route.ts` | scheduled job; must check the cron bearer secret |
| sitecraft-ai | `(products)/sitecraft-ai/(protected)/forms/actions.ts` | public widget or form for a company's visitors |
| talentos | `(products)/api/talentos/payroll/webhook/[companyId]/route.ts` | called by a provider; must verify its signature |
| talentos | `(products)/api/talentos/payroll/webhook/route.ts` | called by a provider; must verify its signature |
| viralpulse-ai | `(products)/api/viralpulse-ai/accounts/cron/route.ts` | scheduled job; must check the cron bearer secret |
| viralpulse-ai | `(products)/api/viralpulse-ai/ads/cron/route.ts` | scheduled job; must check the cron bearer secret |
| viralpulse-ai | `(products)/api/viralpulse-ai/metrics/cron/route.ts` | scheduled job; must check the cron bearer secret |
| viralpulse-ai | `(products)/api/viralpulse-ai/oauth/[provider]/callback/route.ts` | called by a provider; must verify its signature |
| viralpulse-ai | `(products)/api/viralpulse-ai/oauth/[provider]/route.ts` | called by a provider; must verify its signature |
| viralpulse-ai | `(products)/api/viralpulse-ai/publisher/cron/route.ts` | scheduled job; must check the cron bearer secret |
| viralpulse-ai | `(products)/api/viralpulse-ai/ugc/cron/route.ts` | scheduled job; must check the cron bearer secret |

## P4 work list: status (unified employee experience)

Source lists: `docs/commandos-audit-sidebars.md` (10 role-filtered sidebars, 161 items) and `docs/commandos-audit-guards.md` section "Files where a person's ROLE changes what the UI shows" (82 files).

| Item | Status |
| --- | --- |
| Workspace sidebar, topbar menu, settings cards | Done: Director's list for everyone, items open or locked (`resolveNav`), hidden only when the product is switched off |
| Locked page + request access + request list under People & Access | Done (`/commandos/locked`, `access-requests.ts`, `AccessRequestsPanel`) |
| 7 sidebars with real role gates: CashFlow, CohortAI, CyberVault, EvalIQ, SpendIQ, SprintOS, TalentOS | Done: every item shown, locked by permission; the separate employee/student menus are gone; "Me" sections are open for everyone |
| 3 sidebars with no role gate in the file (RankMax, SiteCraft, ViralPulse) and Huddle | Already the full list for anyone who can open the product; their pages decide (P8) |
| Dashboard product matrix, Analytics page | Done: locked cards and a "Locked analytics" list |
| Staff-only product layouts (TalentOS, SprintOS, SpendIQ x2, CohortAI) | Done: render the locked page inside the product shell instead of bouncing to /me |
| 26 CommandOS pages that redirected non-Directors home | Done: `requireWorkspaceAccess(key)` opens the locked page |
| `roles.includes("super_admin")` in 26 CommandOS and shell files | Done: `isDirector()` (one place); sidebars, shells, top bars and layouts contain no role name (static test) |
| Server actions and API routes of the 82 files | Unchanged: they already refuse non-Directors server-side with the older checks. Converting each to `requireAccess` is P8 |
| Product pages and actions behind a locked product sidebar item | Still on the older per-product role checks (refuse server-side); moving them to `requireAccess` is P8 |

