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

Hardening: Z1 security and tenancy, Z2 performance, Z3 legal and content review

Counting: 2 of about 40 features done = about 5%.

## Things only the owner can do
1. Run `npm run build` once (stop the dev server first).
2. Open each new screen in a browser and report problems.
3. Real accounts: Twilio (public URL, number, verified numbers), ElevenLabs, Gemini, OpenAI keys; Meta/YouTube/LinkedIn/X/Google developer apps and approvals.
4. Legal review of legal templates by a qualified advocate.
