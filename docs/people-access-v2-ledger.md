# People & access v2 ledger (resume point)

Owner request of 2026-11-17 (five points). Status: done | partial | todo | blocked. Honest: the full request is a multi-week change across 16 products; this ledger says exactly what is finished and what is not.

| # | Item | Status | Evidence / what is left |
| --- | --- | --- | --- |
| A1 | ONE title accessor from the organization service (`displayTitle`, `titleOfPerson`, `titlesOfPeople`, `/api/account/title`); every sidebar footer and user menu shows it; "Team member" fallback; role names removed from the account drawer | done | `npm run test:person-title` (9) incl. static test: no component passes or computes a product role label |
| A2 | Title in directory, dashboards, comment/author chips, approvals, audit labels, emails | partial | CyberVault settings chip and SiteCraft admin bar done. Other product screens print people's names, not role labels (no role label printed was found by the static scan); a title line next to each name in those screens is not added. Needs a per-product pass. |
| B1 | Micro-level catalogue (every page, tab, section, action, button) with scope features | todo | The catalogue is still the 265 role-file capabilities. Not started: generating micro features without enforcing them would let People & access grant powers nothing checks, which is misleading. It must be done together with C and P8-B (enforcement). |
| B2 | Coverage test: every page, action and route handler mapped to a feature | todo | depends on B1; the existing guard scan (`scripts/audit-guards.ts`) lists the unmapped files |
| B3 | Matrix UI usable at hundreds of rows | done | per-product accordions, areas (module groups), search, "Show only granted", per-product and per-area quick set, counts, keyboard-accessible radios (`AccessMatrix.tsx`) |
| C1 | Hide instead of lock (Workspace sidebar, dashboard cards, analytics, product settings cards, 7 product sidebars) | done | `resolveNav` drops locked items; `NavGroup` hides empty sections; `test:shell`, `test:restructure`, `test-workspace-access` updated and green; LockedPage kept for direct addresses only |
| C2 | Remove the "Me" sections and employee-only layouts; same pages for everyone with scope-aware data | **todo (not started for any product)** | `scopeFor`/`scopeFilter`/`inScope` exist and are tested (`scripts/test-access-scope.ts`) but no loader uses them yet. Per product: TalentOS, SprintOS, SpendIQ, CohortAI (Me sections still in the sidebars), plus CashFlow, DealFlow, EvalIQ, CyberVault, Playbook, ContractFlow, ViralPulse, RankMax, SiteCraft, AgentOS, Huddle, Workspace. Removing a Me menu before its page is scope-aware would strand employees, so none was removed. |
| C3 | Dashboards: cards for features the person lacks hidden, scope-correct numbers | partial | Workspace dashboard hides products the person lacks; per-product dashboards still use their older role gates |
| D1 | Baselines per product explicit in Preview; removing access takes effect on the next request | done (existing) | `test:people`, `test:access`, `test-workspace-access` ("losing a role closes the product for the existing session at once") |
| D2 | Bulk assignment, copy access from another person, access templates (not roles) | done | `src/lib/products/commandos/access-bundles.ts`, "Give access to selected" in the People list (`BulkAccessDialog`), `npm run test:access-bundles` (9) |
| D3 | End-to-end review of People & access; fixes | partial | see `docs/people-access-v2.md` |
| E | P8 (guard the 65 files, requireAccess migration, AgentOS/EvalIQ read-only split, parity sweep, security review) | todo | see `docs/commandos-p8-ledger.md`; to be done against the micro catalogue after B1/C2 |

## Remaining (exact list, 2026-11-17)
- B1/B2 micro-level catalogue plus coverage test: not started (must be built together with enforcement so no unenforced feature is grantable).
- C2 removal of "Me" sections and scope-aware real pages, per product: not started; `scopeFor` exists and is tested but unused by loaders. No product is half-migrated: the Me groups are intact.
- C3 dashboards still use older role gates; A2 titles next to names in lists, comments, approvals, audit, emails not done.
- D: delegated-manager and bulk rules done; browser checks and screenshots not done.
- E: P8-B, P8-C, P8-D, owner guide and R-number statuses not done.

## Micro-level catalogue, per product (2026-11-17, continuation)
Framework (done, shared): `src/lib/access/micro/` (types, per-product catalogue, `derive.ts`), stored in the same access map, parity through `legacy` links (a person from the old roles gets exactly the micro features whose legacy capabilities they hold; `withMicros`), adapter derives old roles from micro features, finished-product matrix shows micro features by module with scope badge and product-name search, `splitPicked` opens old-role people prefilled in micro features. Coverage test `npm run test:micro-coverage` (add a product to its PRODUCTS table when finished): every page/route/server action mapped, key mentioned in code, every feature guards something, literal keys valid, no legacy role check left.

| Product | Status | Evidence |
|---|---|---|
| CyberVault | COMPLETE: 28 micro features in 12 modules incl. scope.all; viewer/records/actions/routes/dashboard/sidebar/AI entities enforce them server-side; no Me section existed (assignment scope = own) | `test:cybervault-access` (10), `test:micro-coverage` (6) |
| RankMax | COMPLETE: 42 micro features in 20 modules incl. scope `tasks.all`; viewer/actions/jobs/export (view + export feature)/audit route/dashboard/sidebar/AI entities+reports enforce them; no Me section | `test:rankmax-access` (9), `test:micro-coverage` (11 incl. rankmax) |
| AgentOS | COMPLETE: 17 micro features in 9 modules (incl. read-only level `agents.view`/`calls.view`, scope `chats.all`); viewer translates the old permission names in one place; pages/actions/routes/menu/AI entities enforce; P8-C done (Read only is truly read only) | `test:agentos-access` (8), `test:agentos` suites updated, `test:micro-coverage` (16) |
| TalentOS | NOT started, and it is not a mechanical copy of CyberVault/RankMax: the old HR model has a staff/employee tier with no positive capability key (`hasStaffRole` is not in the catalogue), a reporting-line (manager) scope as a third scope, ~256 role-check sites in 83 files, 15 API routes, and a 17-page Me tree whose pages must become scope-aware normal pages. Plan: (1) add the staff tier and reporting-line scope to the legacy catalogue generator, (2) a `staged` mode so micro features can be derived from legacy while modules are converted one by one, (3) convert modules Leave, Attendance, Payroll, Employees, Recruitment, Documents, Requests, Dashboard, Settings, then remove Me. Needs its own run. | |
| SprintOS, SpendIQ, CohortAI, CashFlow, DealFlow, EvalIQ, Playbook, ContractFlow, ViralPulse, SiteCraft, Huddle | not started. Cleanest next (single `can(viewer, perm)` choke point like CyberVault/RankMax): SiteCraft (NOT clean: Offers/Wallet/Push/Chatbot modules are gated by shared LMS permissions through `requireLmsOrCms`, and several pages have no check), ViralPulse, EvalIQ (needs the same Read-only split), ContractFlow | |
| Workspace/CommandOS pages and dashboards | not started | |
Still open: titles next to names in lists/comments/approvals/audit/emails; point 5 review fixes; screenshots of Director vs partial vs own-scope inside real product pages (only the matrix and preview were shot: /tmp/claude-1001/shots/micro-step2-*.png, micro-step3-*.png); P8-B, P8-C, P8-D, owner guide, R-number evidence.
Known gap in the harness: the product header count in step 2 ("0 of 28") is not recomputed in the sample harness.
