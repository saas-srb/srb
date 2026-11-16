# CommandOS restructure: requirements checklist, current state and plan

Source: the owner's brief (pasted in chat on 2026-11-15). Every sentence of the brief is a numbered requirement below so nothing is skipped; each has a phase and an acceptance test. Status column is updated as work lands.

## 1. Requirements (verbatim intent, numbered)

### Organization
- **R1** Company Setup stays in Organization.
- **R2** Departments: ONE centralized CRUD shared by all products; no duplicates anywhere; CRUD only, no permissions or business logic in it.
- **R3** Teams: same rule as R2.
- **R4** Designations: same rule as R2.
- **R5** People & Access: completely restructured, simple and easy to understand.
- **R6** Adding an employee is exactly 3 steps: (1) Person details with Departments, Teams, Designations; (2) Access; (3) Preview.
- **R7** Step 2 Access: remove "Add Product Roles"; show ALL products and ALL their features with exactly two levels, Read & Write and Read Only; a person reaches only what is assigned.
- **R8** Step 3 Preview shows every assigned detail and every access permission.

### Unified employee experience
- **R9** Every employee, whatever the role, sees exactly the same features, sidebar, UI/UX and interface as the Director.
- **R10** The ONLY difference is access permissions: each employee can use only the products, features, modules and functions assigned.
- **R11** Every feature, module and function works strictly by the permissions assigned to that person (server-side enforcement, not only hiding).

### Billing & Plan
- **R12** Plan & Billing. **R13** Invoices & Payments. **R14** Usage & Limits.

### Branding & Domains
- **R15** Apps & Downloads. **R16** Default Domain. **R17** Custom Domains.

### System Default
- **R18** Notification Center, **R19** AI Prompts, **R20** Scheduled Jobs, **R21** Documents & PDFs, **R22** Backups & Data, **R23** Import Data, **R24** Audit Log, **R25** Security.

### Engagement
- **R26** Push Notifications. **R27** Analytics.

### Connections & Automation (items to cover)
- **R28** Sender Email, Integrations, Product Settings, Engagement, Push Notifications, AI Chatbot (Dashboard, Conversations, Knowledge Base, AI Config), Conversation AI (Voice Dashboard, Voice Conversations, ElevenLabs Config).
- **R29** Completely restructure the section: production ready, simple, organized, easy.
- **R30** All third-party connections and integrations in ONE centralized place, organized.
- **R31** All product configurations in ONE centralized section.
- **R32** No configuration duplicated: if several products need the same thing it is created and managed once and shared.
- **R33** Centralized structure so the same information is never collected twice.
- **R34** The whole section is user friendly and easy to understand.

### Centralized CommandOS configuration
- **R35** Everything managed through CommandOS works across all products.
- **R36** No product has its own separate configuration.
- **R37** All configuration is managed exclusively through CommandOS.
- **R38** A configuration created in CommandOS is automatically available to every relevant product.
- **R39** No duplicate configuration across products.
- **R40** One consistent, unified configuration structure.
- **R41** Extremely simple and clear for businesses of every industry.

### Third-party defaults
- **R42** Every third-party connection uses SRB (SelfRun's own) by default.
- **R43** A business can instead configure and use its own connection (company keys first, SRB fallback: already the platform rule).

## 2. Current state (read from the code, 2026-11-15)

- **One nav definition already exists**: `src/lib/products/commandos/nav.ts` (418 lines). Items are gated by `allow(user)` rules that call 20 separate role files (`src/lib/*-roles.ts`: admin, aibots, cms, dlms, fms, hrms, intelligence, lms, lpms, messenger, ots, playbook, pms, portal, prms, seo, smms, sop, tms, workspace) plus `permission-overrides.ts` and 13 `MANAGE_PERMISSIONS`. So a person's sidebar and access depend on per-product roles (the behaviour R9/R10 want removed).
- **Company section groups** in nav.ts: Organization (setup, departments, teams, designations, users), Billing & plan (billing, invoices, usage), Branding & domains (app, addresses, domains, email), Connections & automation (payments, integrations, products, automations), System default (notifications, schedules, pdfs, prompts, backups, import, audit, security). The brief wants Sender Email under Connections, Engagement as its own group, and AI Chatbot / Conversation AI inside Connections & Automation; today they sit in other sections (`manage`, `engagement`, `ai`) and several sections are `sidebar:false`.
- **Organization CRUD pages exist** (`/commandos/settings/organization/{departments,teams,designations}` with Sheets), but departments are duplicated across products in code and data: `hrms_departments` (11 rows in production), `sop_departments` (105 rows), `src/lib/products/talentos/departments.ts`, Huddle users/announcements, SpendIQ pickers, Playbook db, AI agent entities (sop, hrms). They must collapse into one collection and one service.
- **People & access** (`/commandos/users`, 2,807 lines): create sheet with a stepper, PanelAccessMatrix, role editor, custom roles, permission overrides sheet, access preview. Complex (roles + overrides + per-product tiers); the brief replaces it with three steps and a Read/Write matrix.
- **Product settings**: 12 per-product pages under `/commandos/settings/products/*`; integrations hub (`ConnectionsHub`), email, payments, notifications, prompts, schedules, AI chatbot and ElevenLabs config live in different places with their own forms.
- **Third-party keys**: the platform already resolves company keys first then SRB (platform) keys (`src/lib/platform/integrations`). The UI to choose "Use SRB (default)" vs "Use my own" per connection is what is missing as one consistent control.
- **Production data** (read-only inspection): 4 companies, 4 admin users, 11 HR departments, 32 designations, 105 SOP departments. Any migration must be additive and reversible.

## 3. Target design

1. **One access model** (`src/lib/access/`): `product -> feature -> level (none | read | write)`; a person stores one `access` document. Features come from a single catalogue generated from the existing permission catalog and every product's role files, so nothing is lost (each legacy permission maps to a feature+level).
2. **Compatibility adapter**: derives the legacy role/permission data each product already checks from the matrix, so products keep working while they are migrated one by one; new code calls only `can(user, product, feature, level)`. Server actions and routes enforce it (R11); the UI mirrors it.
3. **Unified shell** (R9/R10): everyone gets the Director's sidebar, layout and UX. Items a person has no access to are shown locked (greyed, lock icon, "Ask your Director for access") and the server refuses them; items they can open work normally. (Assumption, see section 5.)
4. **Add person in 3 steps** (R6-R8): Details (name, email, phone, joining date, departments, teams, designations) -> Access (every product with its features, two levels, quick "All read / All write / None" per product) -> Preview (details + full permission list, seats, invitation) -> Create.
5. **Central org service**: one `organization` module (departments, teams, designations) with CRUD only; products read from it, never store their own copies; migration unifies `hrms_/sop_/` copies by name with a mapping table so existing references keep working.
6. **Connections & Automation hub**: one page group with: Connections (every third-party service, each with "SRB default / my own" switch), Sender email, Product settings (one place, per product tabs fed from a shared settings schema so shared values such as company name, address, GSTIN, currency, time zone, email provider are entered once), AI Chatbot, Conversation AI, Engagement (push), Automations. A shared setting is stored once in the company config and referenced by every product.
7. **Navigation regrouped** exactly as the brief: Organization, Billing & Plan, Branding & Domains, System Default, Engagement, Connections & Automation.

## 4. Phases (every requirement mapped)

| Phase | Scope | Requirements | Acceptance |
| --- | --- | --- | --- |
| P0 | Full audit: feature catalogue from all role files and permissions; inventory of every duplicated config and every department/team/designation copy; migration plan | all | audit doc, catalogue file, no TODOs |
| P1 (DONE, see PROGRESS) | Central organization service + data unification (additive, reversible, dry-run) | R2-R4 | one collection per entity, products read from it, tests |
| P2 (DONE, see PROGRESS) | Access model + adapter + `can()` + server enforcement helper | R7, R10, R11 | legacy checks derive from matrix; parity tests per product |
| P3 (DONE in code; screens checked in a headless browser on sample data only, see PROGRESS) | People & Access: 3-step create, edit person, bulk, matrix, preview | R5-R8 | click-through test, seats, audit events |
| P4 (DONE in code, see PROGRESS) | Unified shell: Director sidebar/UX for all, locked items | R9, R10 | screenshots for 3 sample people |
| P5 (DONE in code, see PROGRESS) | Navigation regroup (Organization, Billing & Plan, Branding & Domains, System Default, Engagement, Connections & Automation) | R1, R12-R28 | nav test: every item resolves, groups as brief |
| P6 (DONE in code, see PROGRESS) | Connections hub with SRB default / my own per connection | R30, R42, R43 | every provider listed once, test connection, keys-first resolution tests |
| P7 (DONE in code, see PROGRESS) | Product settings + shared config store, remove per-product config copies, AI Chatbot and Conversation AI moved in | R28, R29, R31-R41 | no duplicated field (static check), shared value change shows in every product |
| P8 | Hardening: security review, permission parity sweep across all 16 products, docs, migration runbook, regression tests | R11, all | no product page reachable without its permission |

## 5. Decisions (owner approved all audit proposals, 2026-11-15)

1. D1: ~~locked items are SHOWN greyed (visible) in the one shared Director shell; the server still refuses them.~~ **Superseded by the owner on 2026-11-17: what a person has no permission for is HIDDEN (not greyed, not locked); sections with nothing left disappear. The server still refuses a direct address, and that address shows the polite locked page with the request-access button.**
2. D2: the matrix is the only way to grant access. Custom roles and "Add Product Roles" go away; existing roles are converted to matrix rows by an additive migration; legacy fields stay untouched.
3. D3: ~~self-service features (my tasks, leave, payslips, own profile, own notifications) are always on for everyone and sit outside the matrix.~~ **Superseded by the owner on 2026-11-17: no separate "Me" sections or employee-only menus. A person uses the same real pages as the Director and the data follows their scope (own records with the "own" feature, everyone's with the "all" feature). The scope helper `scopeFor` is built (`src/lib/access/scope.ts`); converting each product's former Me pages is NOT finished, see `docs/people-access-v2-ledger.md`.**
4. D4: finer feature rows for risky actions (publish, place calls, approve, reveal secret, own-versus-all scope), but exactly two levels: Read & Write, Read Only.
5. D5: Huddle channel groups and SprintOS squads stay separate from organization Teams.
6. D6: designations stop carrying role bundles (plain titles); existing bundles are converted to matrix rows during migration.
7. D7: the ~50 routes / 52 action files without a recognised guard get a classified list (intentionally public or webhook versus must be guarded) in `docs/commandos-audit.md`; the ones that must be guarded are guarded in P8.
8. D8: the SiteCraft chatbot copy is removed (redirect to CommandOS) in P7.
9. D9: in-product settings pages become read-only links/redirects to the CommandOS page, old URLs keep working (P7).
10. D10: every migration has `--dry-run` (default), `--apply`, `--revert` and a migration id, takes a throwaway MONGODB_URI, and never touches production. Tests run on fakes or throwaway databases only.
11. Director/owner keeps full write access everywhere and cannot be reduced below that. Seats and billing counts stay as today.

## 6. Risks

- 16 products each enforce access in their own way: P2 parity tests are essential or someone loses or gains access silently.
- Department unification touches HR, SOP, TalentOS, Huddle, SpendIQ and Playbook: needs the mapping table and a dry-run report on production counts before applying.
- Real behaviour is unverified until clicked in a browser per product.

## 7. Status by requirement (updated after P3)

| Req | Status |
| --- | --- |
| R2-R4 | Done in code (P1): one organization service, pickers, migration tooling. OrgPicker is used in the forms and filters listed in PROGRESS; remaining native selects are listed there too |
| R5-R8 | Done in code (P3): `/commandos/users` list, `/commandos/users/new` and `/commandos/users/[id]/edit` with exactly 3 steps, matrix of all products and features, Preview |
| R9, R10 | Done in code (P4): everyone gets the Director's Workspace shell, sidebars and dashboards, items locked by access; self-service always open. Not checked with real sign-ins |
| R11 | Model and helpers done (P2); enforcement in each product is P8 |
| R12-R43 | Done in code (P5-P7); see section 9 for each requirement |

## 8. Status after P5 (navigation regroup) and the P6 core

| Requirement | Status |
| --- | --- |
| R12-R25 Billing, Branding & Domains, System Default, Security & Logs | Sidebar regrouped exactly as the owner's target; every old address works |
| R26, R27 Engagement (Push), Insight (Analytics) | In the sidebar; Analytics also has the combined AI & Voice view |
| R28-R30 Connections: Integrations, Product settings, AI Chatbot, Voice | One Integrations page of cards; AI Chatbot and Voice open as tabbed panels; Sender email is a section of Custom domains; Product settings is a card grid with the same side panel |
| R42, R43 SRB by default, own account optional | Done: a visible per-connection choice, saved, default SRB, own keys kept when switched; Test connection and masked secrets |
| R31-R41 one structure for all product configuration, no duplicates | NOT done: P7. Known duplicates are listed in `lib/platform/connections/cards.ts` |

Sections left out of the sidebar by design (decision, documented in `nav.ts`): Products (open from the dashboard cards, the Staff Hub tiles and each product's own sidebar), Management (registers reached from their products), per-product Analytics entries (listed by the Analytics page) and Account (profile menu).


## 9. Status after P6 and P7 (every R28-R43 requirement)

Done in code and tested on fakes and throwaway databases. Nothing was checked in a browser with a real sign-in, and no real keys were used (see "Not verified" in `docs/PROGRESS.md`).

| Req | Status | Where / how it is proved |
| --- | --- | --- |
| R28 Sender Email, Integrations, Product Settings, Engagement, Push, AI Chatbot (Dashboard, Conversations, Knowledge Base, AI Config), Conversation AI (Voice Dashboard, Voice Conversations, ElevenLabs Config) | DONE | Sidebar per the owner's target (P5); SiteCraft's second chatbot copy removed, its addresses redirect (D8); `test:restructure`, `test:shared-config` |
| R29 Restructure: production ready, simple, organized | DONE | One Integrations page, one Product settings page, one Company setup; plain wording; `test:restructure` |
| R30 All third-party connections in one place | DONE | Integrations cards (one per provider/service, grouped); every card has a real Test through one tester interface (`connections/testers.ts`); `test:connections` (37) |
| R31 All product configuration in one place | DONE | Product settings (card per product, panel); every in-product settings address redirects to it (D9); `test:shared-config` |
| R32 No configuration duplicated | DONE (with listed fallbacks) | Company identity once (`company_identity`); provider keys once (`workspace_connections`); schema check `settings-schema.ts`; the old identity copies remain only as read-only fallbacks until the owner confirms (listed in `settings-schema.ts`, `LEGACY_IDENTITY_FALLBACKS`) |
| R33 Same information never collected twice | DONE | Company setup is the only identity form; product forms show a read-only summary with "Manage in CommandOS"; provider screens show `ConnectionSummary` |
| R34 User friendly | DONE in code | Plain words, status badges, "Used by ... Changes apply to all of them"; screenshots of the dev harness read |
| R35 Everything managed through CommandOS works across all products | DONE | One change shows in TalentOS, PDFs, SpendIQ, Cohort AI, EvalIQ, SiteCraft and payroll (test), and a connection change shows in RankMax and ViralPulse (test) |
| R36 No product has its own separate configuration | DONE for identity and provider keys; product settings keep only product choices | Static checks in `test:shared-config` |
| R37 Configuration exclusively through CommandOS | DONE | Old in-product settings pages are redirects; actions of the old forms save only product fields (TalentOS statutory fields, product choices) |
| R38 A configuration created in CommandOS is automatically available to every relevant product | DONE | Single accessor + the "configuration changed" event (`config-events.ts`): same-process listeners at once, other instances within 2 seconds (`versionedCache`) |
| R39 No duplicate configuration across products | DONE | Guard test: no product code reads a provider environment variable or platform key; no secret form in a product; no duplicate field key across products unless a declared override |
| R40 One consistent structure | DONE | Cards, panels, read-only summaries and the schema file are the one shape |
| R41 Extremely simple and clear for every industry | DONE in code | Wording reviewed; not tested with real users |
| R42 SRB by default for every third-party connection | DONE | "Using SRB" only when the platform really has the service; otherwise "Not available from SRB, add your own" (`platform-services.ts`, same source as the staff Missing-settings checklist) |
| R43 A business can use its own connection (company keys first, SRB fallback) | DONE | `test:connections`: for every provider own wins, SRB is the fallback, switching keeps saved keys |

### Migrations (P7)

All: dry-run by default, `--apply`, `--revert`, `--id`, refuse a database that is not a throwaway one.

| Script | What it does | Mapping table |
| --- | --- | --- |
| `scripts/migrate-company-identity.ts` | Copies the company identity into the one `company_identity` document, filling only empty fields, most trusted old store first; reports conflicts and invalid values | in `src/lib/platform/company-identity/migration.ts` (TalentOS company details, company registry, SpendIQ company block, Cohort AI institute block, SiteCraft legal name, billing details) |
| `scripts/migrate-dealflow-access.ts` | Gives everyone who could open DealFlow before the lowest DealFlow role (the "anyone" rule is gone) | in `src/lib/products/commandos/dealflow-access-migration.ts` |
| provider keys | No migration was needed: no product settings document held a provider key on this branch (all products already read `workspace_connections` through the resolver); the guard test keeps it that way | `test:shared-config` |
| SiteCraft chatbot | No data to move: both screens used the same chatbot library and collections; the copy of the screens and actions was removed | `test:shared-config` (D8) |

### Left as a decision for the owner or for P8

- The old identity fields stay as fallbacks until the owner confirms they can be removed (then delete the fallbacks and the schema entries).
- The company logo is stored in Branding (one store); the identity accessor exposes it. It is edited under Branding, not under Company setup.
- Billing details (the GST invoice-to record of the subscription) still hold their own legal name and GSTIN; they are read as a fallback by the migration but not yet prefilled from the identity.
- The AgentOS ElevenLabs post-call webhook secret stays with the AgentOS call routing (a per-address signing secret, not an account key).
- `defaultCurrency` in SprintOS, Cohort AI and SpendIQ stays a declared product override of the company currency.
