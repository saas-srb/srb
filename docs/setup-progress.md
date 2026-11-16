# Setup progress

One percentage for the whole company: how much of its setup is done, how much is left, and what to do next. It replaces the old five-step "Finish setup" count.

## Where it shows
- **Sidebar**, first item under Organization Setup, with the percentage as a badge (Directors; others see the item locked like every other company item).
- **Dashboard** (Directors): a card with the ring, "X of Y steps", the next three best steps and View all. At 100% only a quiet "Setup complete" chip.
- **Slim strip** on every Workspace page until 100% (same percentage; dismissible).
- **Page** `/commandos/setup`: big percentage, progress by area and by product, search, All / To do / Done, and every step with one button to the exact page or panel.
- **Platform Console, Companies**: a "Setup %" column and the filter "Setup stuck" (under 50% for 7 or more days).

## How it is computed
`src/lib/platform/setup-progress/`
- `registry.ts`: the single list of steps (`STEPS`) and `NOT_PART_OF_SETUP`.
- `gather.ts`: reads real data in a few batched queries, one fact group at a time. A group that fails is listed in `failed`; only its steps show "Could not check".
- `scoring.ts` (pure): `percent = weighted done / weighted applicable`.
  - Weights: required 3, recommended 2, optional 1. A partly done step counts a fraction (0.5 unless the step says).
  - "Not applicable" and "Could not check" steps are left out of both sides.
  - 100% means exactly one thing: every step that applies is done and every step could be checked. Otherwise the percentage never exceeds 99.
  - Steps of a product count only while the product is switched on, in the plan and not switched off by the platform.
- `index.ts`: `getSetupProgress()` caches per company for 20 seconds and drops the cache at once on any "configuration changed" event (identity, connections, setup marks).
- Stored (company database): `setup_progress` (`marks`, `reminders`) and `setup_progress_snapshots` (one percentage per day). The live percentage is never stored as truth. Platform database: `platform_setup_progress`, a small cache of the last percentage for the Console list.

## Marks (Directors only, reversible, audited)
- **Mark as reviewed**: only for steps that cannot be derived from data (`manual: true`).
- **Not applicable** with a short reason: only OPTIONAL steps. Required and recommended steps can never be skipped.
- Each mark writes a platform audit entry (`setup.reviewed`, `setup.not_applicable`, and the undo actions) with the company and the person.

## Reminders
Daily job `setup-reminders` (cron registry, `/api/setup/cron`): refreshes each company's percentage, snapshot and Console row, then, through the Notification center: one in-app reminder to the Directors when the percentage has not moved for 3 days, then one summary email a week until 100%. Both are Notification center events ("Setup reminder", "Weekly setup summary"), so a company can switch them off. Rules are pure (`decideReminders`) and tested.

## Adding a step
1. Add it to `STEPS` in `registry.ts`: `id`, `group`, `product` (module key, if it belongs to a product), plain `title`, one-sentence `description`, `why`, `tier`, `minutes`, `href` (a real page, with `?open=` for a panel), `feature` (the sidebar item that grants access), `needs` (fact groups the check reads), `covers` and `check(facts)`.
2. If it needs a new fact, add it to `SetupFacts` (`types.ts`) and `gather.ts`.
3. If it cannot be derived, set `manual: true`.
4. Run `npm run test:setup-progress`. The coverage test fails when an Integrations card, a Product settings card, an onboarding step or a setup-related sidebar item (company, account, push, chatbot) has no step and no entry in `NOT_PART_OF_SETUP` with a reason.

## Tests
`npm run test:setup-progress` (pure and static, then a throwaway database): scoring, the registry and its coverage, per-group checks with fakes, marks, audit, snapshots, reminders and opt-out, tenancy, cache invalidation, failure handling, and "completing a step through its real save path moves the percentage". Screenshots: `scripts/shot-setup.ts` with the dev harness `/dev-editor-harness/setup` (needs `next dev`).

## Known limits
- The marks are audited in the platform audit log, not in the company's own Audit log viewer (which is built from workflow event types).
- Product "first data" steps use record counts for TalentOS, SprintOS, SpendIQ, DealFlow, Playbook and CashFlow only; other products rely on settings or a review.
- Everything was checked on sample and throwaway data; no real sign-in or real company was used.
