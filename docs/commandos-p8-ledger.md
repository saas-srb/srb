# P8 ledger (resume point)

Updated as work proceeds. Status: todo | doing | done | partial (with what is left) | blocked (why).

| # | Item | Status | Tests / evidence |
| --- | --- | --- | --- |
| 1a | Fix `test-signup-onboarding-flow` (stale paths; fake AI provider) | done | 15/15; `setOpenAIForTests` seam in `src/lib/openai.ts` (never honoured in production); hidden plan/interval fields and business-type fields accepted; invite link path fixed |
| 1b | Console Companies grid responsive on phones | done | the grid sits in a `min-w-0 max-w-full` wrapper (page and grid) and scrolls inside its own card; measured in the dev harness: page no longer widens at 390px (table 745px inside the card). Not known whether it overflowed before the Setup % column; not checked on the real page with data |
| 1c | Merge `setup-reminders` into an existing daily job (no extra function) | todo | |
| 1d | Remove `LEGACY_IDENTITY_FALLBACKS` only if every product reads company_identity | todo | |
| 1e | Billing details prefilled from company_identity ("Use company details") | todo | |
| 2 | P8-A guard the 65 unguarded files; allowlist for the 37 open ones; permanent static test | todo | |
| 3 | P8-B move legacy role checks to `requireAccess` (per product) + static test | todo | |
| 4 | P8-C AgentOS and EvalIQ "Read only" truly read only | todo | |
| 5 | P8-D permission parity sweep (static + runtime fake sessions) | todo | |
| 6 | P8-E security review (`docs/commandos-security-review.md`) | todo | |
| 7 | P8-F docs, owner guide, plan statuses, Build log | todo | |


## Status, 2026-11-17 (end of this run)
- 1a signup test: done. 1b console grid on phones: done (page no longer overflows; table scrolls in its card). 1c cron merge: done (17 crons, setup reminders run inside `backups`; `check:functions` could not run here, needs a full build). 1d LEGACY_IDENTITY_FALLBACKS: kept, not every product is proven to read `company_identity`. 1e billing prefill: done.
- 2 (P8-A): done as a permanent sweep plus allowlist; two real holes fixed.
- 3 (P8-B requireAccess migration), 4 (P8-C AgentOS/EvalIQ read-only), 5 (P8-D runtime parity sweep): NOT done.
- 6 (P8-E): done, see `docs/commandos-security-review.md`. 7 (P8-F): partial; R-number statuses and the owner guide are still to do.
