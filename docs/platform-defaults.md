# Platform defaults: ledger and plan

Owner requirement (2026-11-25): every third-party and production default is set by the platform admin, in two Console sections mirroring the company ones (Integrations, Product settings). A company's own value wins; without it the platform default applies; reset returns to the default.

## State (2026-11-25, second builder)
Resume ledger. Everything in the build order below is built. Remaining work is listed under "Open".
- DONE: Console Integrations as cards and drawer; platform SMTP and SendGrid accounts.
- DONE: WhatsApp sender compliance (`test:whatsapp-sender`, 7).
- DONE: platform email fallback (`test:email-fallback`, 7).
- DONE: product defaults foundation, Console "Product settings", migration, static scan, and every product with default-able settings (`test:product-defaults`, 31).
- DONE: two-company runtime tests for push, Resend, domains and storage (in `test:platform-defaults`, now 12 static + 15 runtime).

## Open
- Migration `--apply` has not been run on any real or copied company data (only throwaway test data). It is not required for correct behaviour: it only adds a rollback snapshot.
- Companies that existing code had already written defaults for keep those values as their own: a platform default reaches them only after "Reset to default". Owner decision if a bulk reset is wanted (not built).
- Playbook document settings (approval rules, AI limits) have a platform default and a company "Reset", but no company form to set its own (none existed before).
- Not clicked through in a signed-in browser; no real provider was called.
- The platform's own WhatsApp messages: none exist yet; build them on a separate sender function, never `sendWhatsApp`.

## Product settings defaults
- Resolution, per setting: company stored value, else platform default, else the product's code default. "Stored in the company's document" means own.
- Code: `lib/platform/defaults/product/`: `model.ts` (pure rules), `specs.ts` (THE list of default-able settings), `store.ts` (platform values in `platform_settings` documents `product_defaults:<product>`, a GLOBAL collection; no new collection), `company.ts` (`resolveSettings`, `settingsPatch`, reset), `migration.ts`, `console-cards.ts`.
- Reading writes nothing any more (TalentOS, SpendIQ, SprintOS, Cohort AI and CashFlow tax rates used to create the document with every default on first read). Tax-rate default ids are now fixed (`std-...`).
- Saving a company form stores a setting only if it differs from the default shown, or was already the company's own. So a company that chooses exactly the default value keeps following the default.
- Company screen: a "Defaults" block on each product's settings screen shows "Using included default" or "Using your own" and "Reset to default" per setting (permission `company.products`, audited).
- Console, Product settings (`/console/product-settings`): one card per product, search and filters, right drawer with a "Set a platform default" tick per setting and "N companies use this default, M use their own". Permissions `defaults.read` / `defaults.manage`; changes audited (`settings.product_defaults.update`). Other server instances follow a change within 15 seconds.
- Migration: `npm run migrate:product-defaults [-- --apply | --revert]`; dry run by default; refuses a database whose name lacks "test" or "throwaway". Apply adds `_defaultsBaseline` (what each document stored); revert puts back fields reset since and removes it.
- Adding a setting: add it to `specs.ts` with the same range the product's own save accepts, read it through `resolveSettings` and save through `settingsPatch`; `test:product-defaults` fails otherwise.

### Where settings live, and what is never a default
| Product | Default-able | Left to the company (never a default) |
|---|---|---|
| Workspace | none here: sign-in second step (Console, Health; per-company override exists) and new-company locale, currency, time zone (Console, Platform settings) already have platform screens | company identity |
| TalentOS | work schedule; pay-day counting, overtime, short leave, claim age (`hrms_settings`, `hrms_payroll_config`) | CompanyDetails, registrations, statutory policy and rates (wage definition, PF mode, bonus, gratuity, leave encashment, TDS and regime, no-PAN rule, proof month, deduction cap), minimum wage, separate approver, salary account, state |
| CashFlow | payment limits and hold hours (`fms_payment_controls`), tax-rate list (`fms_tax_config`) | confirmation-code switch, accrual books, MSME days, TDS sections, numbering, approvals, accounts, bank data |
| SpendIQ | currency, approval amounts, item suggestions | company block and signatory |
| ContractFlow | none (`cf_settings` holds only the company's DLT registration) | DLT; stamp duty is the platform rulebook |
| SprintOS | categories, technology suggestions, currency | |
| Cohort AI | program tracks, currency, certificate format, class length | institute block and signatory |
| Playbook | own-document approval, AI drafting switch and limits (`pb_settings`); SOP reminders (`sop_settings`) | numbering, legal types, category access, retention, per-type rules, model, brand |
| AgentOS | default model, reply length, daily limit; calling hours, caps, call mode, website-call limits, masking | price list, instructions (platform AI prompts), allowed countries, disclosure and recording notice, kill switch, test number |
| EvalIQ | certificate format, validity, reminder, time allowance | organisation name, signatory, evaluators |
| ViralPulse | AI models and limits, studio switches and spend limits, posts per run, metrics limits | brand, brand kit, ad spend guard, AI label and badge choices, time zone, Business Profile switch, X reading switch, LinkedIn version, price tables |
| RankMax | crawl limits, thresholds, device, speed checks | site address, schedule (a new company is never crawled unasked), Search Console and GA4, excluded paths, country and language |
| CyberVault | warning days, alerts | |
| SiteCraft, Huddle, DataBrain | none (own website; per person; no settings) | |

## Console, Integrations (`/console/integrations`)
- One card per company Integrations card plus the platform's own (India SMS registration, app builds, scheduled jobs, email testing, upload safety): `lib/platform/defaults/console-cards.ts`. Search, status filter (Ready, Not set up, Company only) and category filter; the panel opens at `?open=<card>`.
- Each Console server key is edited in exactly one panel; email, domains, previous Vercel project and Blob copy each appear in one panel. The old single page of forms is gone (same address; old `#cfg-...` links now use `?open=`). Platform billing Razorpay stays under Console, Payments.
- Default cards show "N companies use this default, M use their own" on the card and above the form. Company only and not-yet-available cards show why and have nothing to edit.
- View needs `integrations.read`; saving and testing need `integrations.manage`. "Test connection" is read-only, limited to 10 a minute per person and audited (`settings.integrations.test`).

## Platform email accounts
Order for a company without its own email account: the platform's Resend account (or the console choice made on purpose in the Console), else the platform SMTP account, else the platform SendGrid account. Mail always comes from the platform's verified sender saved with that account (a bare address; a company's domain is never used), shown under the company's name, with replies to the company's reply-to. A company's own verified sender domain is applied only with Resend. Sends are metered against the plan as before. Console "Test connection" checks the account without sending.

**Fallback (2026-11-25):** when a send through a platform account fails (error or network failure), the next configured platform account in that order is tried once, from its own verified sender under the company's name, and both the failure and the delivery are logged on the server (`[email] platform ... account failed`). One retry only; the last account has none; a console choice made on purpose has none; a company's own account is never retried through a platform account. Known limit: a timeout can mean the first account did accept the message, so a duplicate is possible. Guard: `npm run test:email-fallback`.

## WhatsApp Cloud: why company only
WhatsApp requires business-initiated messages to use message templates approved for the sending business and its number, and holds that business responsible for opt-in. A shared platform number cannot lawfully send a company's messages under the company's identity, so there is no platform default.

## WhatsApp sender rule (decided 2026-11-25: industry standard)
- Company-written WhatsApp (automations, manual DealFlow sends, anything a company composes) goes ONLY through the company's own sender: its Twilio account with a WhatsApp sender, else its WhatsApp Cloud account. One decision point: `companyWhatsAppSender()` in `lib/platform/messaging`.
- The platform's Twilio WhatsApp sender is only for the platform's own approved template messages (none are sent today). The platform operator's own workspace counts as its owner.
- Without a sender nothing is attempted: the user sees "Add your WhatsApp sender to send this" (automation editor, DealFlow WhatsApp, the Twilio card and panel). Recorded as skipped: automation run and last run status `skipped` (history shows "Not sent"), DealFlow thread row `skipped` (once per message per 30 s, not counted in the hourly cap, never blocks the later real send), one admin notice when an automation starts skipping.
- Behaviour change on deploy: companies that relied on the platform sender stop sending until they add their own. Guard: `npm run test:whatsapp-sender`.

## Conservative decisions in force (owner has not answered; each is reversible)
1. Razorpay: no platform default for company money.
2. Gemini, Meta, Google OAuth, LinkedIn, X: company only. Enabling one later: change its entry in `integration-map.ts` to `platform` with its keys, add the keys to `config/registry.ts` and the resolver's `ENV` map and `PLATFORM_FALLBACK` (the card follows the map; the resolver does not, so it is more than one line today).
3. India SMS: the platform SMS registration is read only by the sign-in code sender, the only SMS path in the app (pinned by `test:platform-defaults`). Company-written WhatsApp never uses the platform sender (see the WhatsApp sender rule).

### The rule that exists today
Company's saved connection, else the platform's key (only for `PLATFORM_FALLBACK` services, email and push), else (platform owner's own workspace only) the deployment environment, else not set up (`lib/platform/connections/resolve.ts`, `email/index.ts`, `push/vapid.ts`). The platform's values live in `platform_settings`: `platform_config` (Console server keys, `config/registry.ts`) and the integrations document (email, domains), plus Payments (platform billing Razorpay).

### Integrations: card by card
The list is `src/lib/platform/defaults/integration-map.ts`, checked by `npm run test:platform-defaults`.
- Platform default exists (13): Resend, SMTP, SendGrid, Twilio, OpenAI, ElevenLabs, Google service account, PageSpeed, push (VAPID), TURN, LiveKit, domains (Vercel), storage.
- Company only (10): WhatsApp Cloud, Gemini, Meta, Google OAuth, LinkedIn, X, Razorpay, website tracking, webhooks, social accounts.
- Gaps: none.
- Platform-only keys (no company card): app builds, India DLT ids, cron secret, test inbox, VirusTotal.

### Decisions
The owner answered "do whatever is the industry standard" (2026-11-25). Applied: no shared Razorpay account for company money; social, Google OAuth and Gemini stay company only; India SMS sender only for the platform's registered messages; WhatsApp needs the company's own sender.

## Build order (all done)
1. Console Integrations as cards and drawer. 2. SMTP and SendGrid platform accounts; WhatsApp Cloud company only. 3. Product defaults store, resolver, migration. 4. Product by product. 5. Static scan.

## Adding a provider or a Console key
Add the company card in `connections/catalog.ts` or the key in `config/registry.ts`, then account for it in `defaults/integration-map.ts` (platform, company-only with a reason, gap, or platform-only). The test fails until you do.
