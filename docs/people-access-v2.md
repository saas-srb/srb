# People & access v2: what was found and fixed (2026-11-17)

Companion to `docs/people-access-v2-ledger.md` (status of every item).

## One title for a person (point 1)
**Found:** every product's sidebar footer printed a product role name (TalentOS "Employee", CyberVault "Director", ...), and the shared menu guessed "Director" from any role containing "admin" or "super". The account drawer listed "Assigned roles".
**Fixed:** `src/lib/platform/organization/title.ts` (pure) and `title-server.ts` give ONE title: the designation chosen when the person was created, with the department as an optional line, "Team member" when there is none. The shared menu reads it from `/api/account/title`; all 17 product menus no longer compute a role label; the drawer shows the title and no roles; CyberVault's settings chip and SiteCraft's admin bar use it. Static test `test:person-title` fails if any component passes or computes a product role label again.
**Not done:** a title line beside names in other lists (directory, comments, approvals, audit labels, emails); none prints a role label today, so nothing is wrong, but nothing is added either.

## Hide, not lock (point 3, first half)
Per the owner's 2026-11-17 rule, what a person may not use is hidden: Workspace sidebar, dashboard product cards, Analytics, Product settings cards and the seven product sidebars. A section with nothing left disappears (`NavGroup`). A direct address still reaches the polite locked page with "Request access" (and the Access requests panel is unchanged). Decisions D1 and D3 in the plan are marked superseded.
**Not done:** removing the "Me" sections and making each product's pages scope-aware (see ledger C2). `scopeFor`, `scopeFilter` and `inScope` are built and tested but not yet used by any loader.

## Bulk access, copy access, templates (point 4)
`access-bundles.ts`: give several people the same access (add to theirs, or replace), copy one person's access, or apply a saved template. A template is a plain bundle of features, not a role: applying writes features once; editing or deleting it later changes nobody. Each person is saved through `updatePerson`, so the Director rule, seats, status and audit (`user.access_changed` per person plus `user.access_bulk`) are the same as editing one person. Up to 100 people per request. UI: "Give access to selected" in the People list.

## Review findings (point 5)
- **Privilege hole (fixed):** a delegated manager (holds "manage users" but is not a Director) could give someone any feature as long as it was not an `*_admin` role. They can now only give access they hold themselves (`delegation.ts`, applied to create, edit and bulk). Tested (`test-access-delegation.ts`, and the delegate case in `test:access-bundles`).
- **Account drawer and menu (fixed):** see point 1.
- **Matrix at scale (done):** "Show only granted", per-area quick choices and counts were added to the existing per-product accordions and search.
- **Checked, no change needed (existing tests):** self-edit of access is refused, a Director's access cannot be changed or copied, seat limits, status changes end sessions at once, access requests are rate limited and audited.
- **Not reviewed in a browser:** list, add, edit, preview, invitation/accept flow and the mobile layout were not clicked through with a real sign-in; only code and throwaway-database tests.

## Micro-level access, how to finish a product
1. Write `src/lib/access/micro/<product>.ts` (key `<product>.<module>.<feature>`, label, description, Read/Write, `legacy` capability link, optional `scope: "all"`, optional `baseline`), add it to `micro/index.ts`.
2. Enforce server-side through one `can(viewer, "<module>.<feature>")` (see `src/lib/products/cybervault/viewer.ts`), scope in the query (`scopeFilter`), `lockedUnless` on pages, hide menu items and buttons.
3. Remove the product's Me/employee-only menus: former "My X" pages become the normal pages with data following scope.
4. Map every page, route and action in `micro/coverage/<product>.ts` and add the product to `scripts/test-micro-coverage.ts`; write the Director/partial/own-only test.
Finished: CyberVault, RankMax, AgentOS, EvalIQ, ViralPulse, ContractFlow, SiteCraft, DealFlow, CashFlow (per-module view features, access subject on the CashFlow user, layouts and `lib/fms-access.ts`, `test:cashflow-access`), Huddle (20 micro features: baseline conversation features on the product tier, `channels.create`, `announcements.post`, `analytics.workspace`, `audit.view`, scope `moderation.all`; subject on `CurrentChatUser`, `chatCan`/`requireChat`/`requireChatPage`, `resolveScope(need)`; `test:huddle-access`). Helpers: `scripts/micro-convert.py` (old permission names to micro keys, with path overrides), `scripts/gen-micro-coverage.ts <product> <roots...>` (coverage-map skeleton filled from the keys each item mentions). TalentOS is STAGED (complete micro catalogue; Leave, Attendance, Requests and Holidays converted, six modules pending; see `micro/staged.ts` and the ledger). Everything else is pending (see the ledger).

Update 2026-11-23: every product, the Workspace menus, the company-wide data areas and DataBrain now run on micro features (`src/lib/access/holds.ts` for the cross-product questions). `test:no-legacy-role-checks` fails if a new legacy role check appears outside the listed entry gates.

## End-to-end review findings (2026-11-24)
Method: code read of every People & access screen plus the existing suites (`test:people`, `test:people-scope`, `test:account-status` via `test:people`, `test:access`, `test:access-bundles`, `test:access-sweep`). No real browser or sign-in; dev-harness screenshots only.
- List, add, edit, preview, invitation/accept, status changes, delegated managers, self-edit rule, bulk access, copy access, templates, audit events, seats: each has a test case in `test:people` / `test:access*` and passes; no defect found.
- Sessions on deactivation: `changeAccountStatus` revokes every session (`revokeSessionsOf`) when the new status cannot sign in; on leave keeps signing in. Covered by `test-account-status` assertions in the status flow.
- Matrix at 300+ features (`AccessMatrix.tsx`): search across products and features (a product-name hit shows all its features), "Show only granted", expand/collapse all, per-product quick choice (No access / Read only / Read & Write) and per-area "None / All read / All write". Baseline features are shown locked as Included. Usable at scale by design; not clicked at 300+ in a browser.
- Cross-product finding (design decision for the owner): every HR employee holds Playbook SOP reader access and ContractFlow document viewer access by the old roles; the sweep (`test:access-sweep`) pins this as "by design". If the owner wants these off by default, change the legacy links in `micro/playbook.ts` and `micro/contractflow.ts` and the matching role defaults.
- White label touched this surface: no wording in People & access names the platform.
- Open: mobile layout of the three steps was only seen at 390px in the dev harness; empty states and error texts were reviewed in code, not in a browser.
