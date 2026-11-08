# SelfRun Business — architecture

How the platform is put together: hosts, tenants, products and the pieces that make a new deployment work. For setup see
[../README.md](../README.md); for hosting see [deploy-vercel.md](./deploy-vercel.md); for what each product does see
[products.md](./products.md).

## The two sides of every company

Every company, including the platform operator, has two hosts:

| Side | SelfRun Business | A customer on an automatic address | A customer with its own domain |
| --- | --- | --- | --- |
| **Site**: public pages only | `selfrunbusiness.com`, `www.…` (product website, `/signup`, `/login`) | `<slug>.selfrunbusiness.com` | `acme.com` |
| **App**: products only | `app.selfrunbusiness.com` | `<slug>-app.selfrunbusiness.com` | `app.acme.com` |

The site host never serves a product and the app host never serves a website. `src/proxy.ts` enforces it for page requests:

- a product path (`/workspace`, `/console`, `/talentos`, `/clientos`, `/login`, … see `src/lib/platform/tenancy/surfaces.ts`) on a site
  host is redirected to the same path on the app host;
- `/` on an app host goes to `/workspace`; any other website path on an app host is redirected to the site host;
- payment links (`/pay/…`) and certificate verification (`/verify/…`) work on both;
- APIs are not split: public forms and webhooks keep working on the site host, and every product API still requires its
  own sign-in;
- app hosts are never indexed (`noindex`, robots `Disallow: /`, empty sitemap).

Session cookies are per host, so a visitor on the website host never holds a product session. Signing up on the product
website ends with a one-time hand-off that signs the new owner in on their app host.

## Hosts

`src/lib/platform/saas/hosts.ts` lists the hosts of the product itself:

- site hosts: `SAAS_HOSTS` (comma separated; the `www.` or apex variant is added), in development `localhost` and `saas.localhost`;
- app hosts: `app.` plus every site host without `www.` (`app.selfrunbusiness.com`; in development `app.localhost`).

`resolveHostInfo` in `src/lib/platform/tenancy/companies.ts` resolves every request host to a company and a side, in this order:

1. a product site or app host, which resolves to the operator company;
2. a verified custom domain (site), or `app.<verified domain>` (app), which resolves to its company;
3. `<slug>-app.<root domain>` (app) or `<slug>.<root domain>` (site; in development `*.localhost`), which resolves to that company;
4. anything else, which shows "No workspace here".

A workspace address (slug) cannot end in `-app`. For custom domains the `app.` record is shown next to the website's in
Workspace → Settings → Domains and is attached at the hosting provider with the domain.

## Operator company and tenants

- The **operator company** is flagged `isPlatformOwner`. It holds the platform staff accounts and the Platform Console, served on `app.<SaaS host>`. It is
  created on the first start of an empty database when `SAAS_ADMIN_EMAIL` is set (`src/instrumentation.ts` calls
  `ensureOperator` in `src/lib/platform/saas/bootstrap.ts`, once per process). If `SAAS_ADMIN_PASSWORD` is not set, a temporary
  password is logged once.
- A **customer** is any other company. It is created by `/signup` (`createCompanyWithOwner`), with a Super Admin account, a
  trial subscription, the product set of its plan and a starter website. No customer is special-cased.

## Tenant isolation

Data sits in shared collections with a `companyId` field. `scopeDb` (`src/lib/platform/tenancy/scoped-db.ts`) wraps the
database so that:

- reads, updates and deletes always include the company's `companyId`,
- inserts are stamped with it and updates can never change it,
- aggregations are confined, including joins into other collections,
- unique indexes include `companyId` as their first key, so emails, slugs and codes are unique per company,
- operations that cannot be scoped (drop, rename, change streams) throw.

Keyed collections (counters, settings singletons, themes) store their `_id` as `<companyId>::<key>`, translated
transparently. Platform-level collections (companies, domains, billing, product registry, support, sign-ups) are listed in
`src/lib/platform/tenancy/collections.ts`; everything not listed there is isolated by default. Cross-company work must ask for
the unscoped database explicitly.

## Products and plans

The Product Registry lists every product: key, name, description, icon, route, order and global on/off. Plans
(`billing_plans`) list which products they include, and add-ons can add more. A company's sidebar shows the products its
subscription allows. Staff manage the registry and plans in the Platform Console.

## The installable app and push notifications

Only app hosts are an app. `src/app/manifest.webmanifest/route.ts` serves a manifest per app host (404 on website hosts), built from
`src/lib/pwa/identity.ts`: the company's brand and theme (light and dark colours) overridden by its `pwa_settings` (`lib/pwa/settings.ts`,
`store.ts`, edited at Workspace → Settings → Mobile app), with icons from `/pwa/icons/<size>.png` (`src/lib/pwa/icon.tsx`, maskable
variants included). Icon URLs carry a `?v=<hash>` of everything that affects the look, so a change reaches devices without waiting for caches. `public/sw.js` handles offline (only a static offline page; pages and API responses are never cached),
caches immutable build files, and shows push notifications. The root layout registers it and shows the install prompt only
when the host is a app host.

Push uses Web Push with VAPID (`web-push`). `src/lib/push/`: `categories.ts` (categories, preferences, quiet hours, type to category),
`store.ts` (`push_subscriptions`, `push_preferences`, company-scoped), `send.ts` (`queuePush` / `pushToUsers`: honours the master switch,
categories and quiet hours, prunes dead subscriptions), `api.ts` (the guard for `/api/push/*`: app hosts only, signed-in people
only, push-service allow-list). Every product's `notify()` (HR, Projects, Procurement, Training, Team Chat and the products that use it,
workflow notifications, and the client portal) calls `queuePush` after it stores the in-app notification, so a push never exists
without its bell entry. People manage themselves at `/workspace/notifications/settings` and `/clientos/notifications/settings`.

### Apps and the Generate buttons

`lib/apps/assets.tsx` draws every asset (PWA, Android, iOS, desktop icons, splash, feature graphic) from the company's brand and settings on demand;
`/api/apps/assets/file/<id>.png` and `/api/apps/assets/pack/<kind>` (ZIP) serve them (public on app hosts, rate limited, because the mobile
and desktop builds download them). `mobile/` builds Android and iOS projects from the pack (Capacitor). A build covers five platforms (`win`, `mac`,
`linux`, `android`, `ios`); the Apps page only ever asks for one (scope = that platform), and out-of-scope platforms are `skipped`. **Nothing is built
automatically**: the only way to start a build is a Super Admin pressing a platform's button (`buildAppAction`). A build blocks another only when they
share a platform, so Android can be generated while Windows builds. `getAppsOverview` gives each platform an action: `ready`, `running` or `unavailable`
(no build service connected).

`lib/apps/`: `enqueue.ts` (`enqueueBuild`, `dispatchBuild`, `runBuildCron`), `callback.ts` (what the build service may report),
`store.ts` (`app_builds`, a platform-level collection whose rows carry their `companyId`), `overview.ts` (what the Apps page shows).
Onboarding no longer starts builds. A build is a row with
a status per platform (win, mac, linux, android, ios). `dispatchBuild` starts `.github/workflows/desktop.yml`, which builds each platform with
`desktop/scripts/build-company.mjs`, publishes to the releases repository (`publish-build.mjs`) and POSTs to
`/api/apps/builds/callback` (bearer `DESKTOP_BUILD_SECRET`; only GitHub release download links are accepted). `/api/apps/builds/cron`
runs daily and only hands over builds that a person already requested and fails ones that never finished. What an installer bakes in (name, icon, address) is `PwaIdentity.buildHash`; everything else is read at run time.
The page is Workspace → Settings → Apps (`workspace/(protected)/settings/apps`).

### Desktop app

`desktop/` (own `package.json`, plain CommonJS, not part of the Next.js build) is an Electron shell for any workspace. The server gives it
two public-to-the-app endpoints on app hosts: `/api/desktop/branding` (the app identity from `lib/pwa/identity.ts`, so the same
Mobile app settings drive the desktop app) and `/api/desktop/notifications` (the signed-in person's unread items, polled with the
app's session because Electron has no Web Push). The app adds `WorkspaceDesktop/<version>` to its user agent; the web app uses it
(`isDesktopApp()` in `lib/pwa/client.ts`) to skip the service worker, install prompts and Web Push inside it.
`desktop/scripts/build-company.mjs` builds installers for one company from its live branding.

### Website push (a company's visitors)

Separate from the app above and from the app's subscriptions. On a company's website host `public/web-sw.js` (notifications only: it
caches nothing and makes nothing installable) and `components/webpush/WebPushPrompt.tsx` (mounted in the `(site)` layout) let a
visitor opt in per topic. `src/lib/webpush/`: `topics.ts` (topics, settings, validation), `store.ts` (`web_push_subscribers`,
`web_push_broadcasts`, `web_push_settings`), `send.ts` (`sendBroadcast`: switches, daily cap, batching with a time budget, dead
subscription pruning, history row; `queueBroadcast` for automations), `api.ts` (website-host-only guard and rate limit for
`/api/web-push/*`). Automations: an offer campaign going live (`offers/subscriptions.ts`), a reward campaign switched on
(`wallet/campaigns.ts`), a blog post published (`cms/collections/store.ts`). The business manages it at `/sitecraft-ai/push`.

## The product website

`src/app/(platform)/saas/*` holds the marketing pages (home, features, modules, AI, automation, use cases, industries, how it works,
integrations, security, pricing, about, contact and demo, resources, FAQ, privacy, terms). The `(platform)` route group is an
organizational folder and does not add `/console` to the public URL. Pricing reads the live plans. Demo and contact requests are
stored with a honeypot and rate limit. Brand, colours and copy live in `src/lib/platform/saas/` (`brand.ts`, `theme.ts`,
`content.ts`); marketing components live in `src/components/platform/saas/`. The logo, mark and favicon are in `public/selfrun/`.
Robots and sitemap are host-aware.

## Repository layout and product URLs

Product route folders use the same branded slug as their customer-facing app URL. The route group keeps the filesystem organized
without adding a URL segment. API route folders follow the same slug, so for example `src/app/(products)/api/sitecraft-ai/`
serves `/api/sitecraft-ai/`.

| Product | App URL | Route folder |
| --- | --- | --- |
| CommandOS | `/commandos` | `src/app/(products)/commandos/` |
| DealFlow AI | `/dealflow-ai` | `src/app/(products)/dealflow-ai/` |
| CashFlow AI | `/cashflow-ai` | `src/app/(products)/cashflow-ai/` |
| SpendIQ | `/spendiq` | `src/app/(products)/spendiq/` |
| Cohort AI | `/cohort-ai` | `src/app/(products)/cohort-ai/` |
| Playbook AI | `/playbook-ai` | `src/app/(products)/playbook-ai/` |
| ContractFlow AI | `/contractflow-ai` | `src/app/(products)/contractflow-ai/` |
| CyberVault | `/cybervault` | `src/app/(products)/cybervault/` |
| EvalIQ | `/evaliq` | `src/app/(products)/evaliq/` |
| AgentOS | `/agentos` | `src/app/(products)/agentos/` |
| DataBrain AI | `/databrain-ai` | `src/app/(products)/databrain-ai/` |
| ViralPulse AI | `/viralpulse-ai` | `src/app/(products)/viralpulse-ai/` |
| RankMax AI | `/rankmax-ai` | `src/app/(products)/rankmax-ai/` |
| SiteCraft AI | `/sitecraft-ai` | `src/app/(products)/sitecraft-ai/` |
| TalentOS | `/talentos` | `src/app/(products)/talentos/` |
| SprintOS | `/sprintos` | `src/app/(products)/sprintos/` |
| Huddle AI | `/huddle-ai` | `src/app/(products)/huddle-ai/` |
| ClientOS | `/clientos` | `src/app/(products)/clientos/` |
| ResolveIQ | `/resolveiq` | `src/app/(products)/resolveiq/` |
| SelfRun Sites | `/` on the company's site host | Public site is served by the `(site)` routes; there is no `/sites` app URL |

Product UI is grouped in `src/components/products/<slug>/`; product-specific server logic is grouped in
`src/lib/products/<slug>/` where that product has a dedicated library. Shared platform services stay in `src/lib/platform/` and
shared UI stays outside the product folders. Marketing code is grouped under `src/app/(platform)/saas/`,
`src/components/platform/saas/` and `src/lib/platform/saas/`.

The platform operator's console is served at `/console` from `src/app/(platform)/console/`. Platform UI and services live under
`src/components/platform/` and `src/lib/platform/`; its APIs remain under `src/app/(platform)/api/platform/` at `/api/platform/`.
The old `/platform/...` product URLs permanently redirect to their `/console/...` equivalents. The `(platform)` route group itself
never appears in public URLs.

## AI prompts

Every instruction the system sends to an AI model is a **prompt** described once in `src/lib/prompts/registry.ts` (key, name, group, product, kind, variables with examples, default text). Code never holds prompt text: it calls `getPrompt("key", { vars })` from `src/lib/prompts/store.ts`.

- **Overrides.** A platform admin can change any prompt in Platform Console → *AI prompts* (`/console/prompts`; read needs `settings.read`, changes need `settings.manage`). An override is stored in `prompt_overrides`, applies to every company within about 10 seconds, and can be switched off or reset at any time. History is append-only: every save, restore, reset and on/off switch is a new numbered version in `prompt_versions` (also written to the platform audit log), nothing is deleted, numbering never restarts, and any version (or the built-in text) can be restored at any time, which creates a new version. The page also has a *Test run* tab that tries a draft against the platform's OpenAI key without saving it (rate limited, not for image prompts).
- **Safe by construction.** `{{name}}` placeholders are filled from the variables the prompt declares; an override that drops a required variable, uses an undeclared one, is empty or exceeds 60,000 characters is refused. If the database can't be read, or a stored override is no longer valid, the built-in text is used, so a prompt never breaks a feature.
- **Usage.** Uses per prompt per day are counted in memory and flushed at most every 30 seconds to `prompt_stats` (expires after 100 days).
- **Adding a prompt.** Add a `PromptDef` to the registry and call `getPrompt` where it is used. `npm run test:prompts` fails if a key doesn't exist, a registry entry is never asked for, a file calls an AI model without taking its prompt from the registry, or a prompt helper is used in a template literal without `await`.
- **Company prompts.** A handful of instruction prompts (`companyEditable` in the registry: the Ask AI agent and its website editor, the workspace assistant, ContractFlow, and the social-media system/post/ad/campaign prompts) can be reworded by each company in Settings → AI prompts (`company.prompts`). Scope, language, data-access, support, bot, website-builder and classifier prompts are never open to companies. A company's wording lives in the company-scoped `company_prompt_overrides` / `company_prompt_versions` (append-only, same version rules as the platform's), is used only for that company, and is always sent inside a fixed security header and footer written in `src/lib/prompts/guard.ts` (this one place; no screen edits it). Saving checks that the variables carrying scope, language and identity are kept, that nothing is undeclared, hidden or over 8,000 characters, and refuses wording that mentions other companies, secrets or the database, tries to switch the rules off or reveal hidden instructions. These are defence in depth: the real tenant boundary is the company-scoped data layer, which limits every query to the current company before any model is involved. Platform Console → AI prompts can switch company prompts off for everyone or per prompt (what companies saved is kept and applies again when switched back on).
- **Not in the registry on purpose:** tool/JSON schemas (they are code contracts), labels and data that are filled into prompts, canned replies, and text each company writes itself (its chatbot persona, bot instructions); the registry holds the *starting* text for those.

## Payroll (TalentOS)

Indian payroll with the calculation kept apart from the database. `src/lib/products/talentos/payroll/` is pure code (no I/O) and is what `npm run test:payroll` exercises; `payroll/context.ts` and `payroll-run.ts` load the data and store the results.

- **Engine.** `compute.ts` turns one employee's month into a payslip: paid days (`paid-days.ts`: calendar/working/fixed basis, joining and exit proration, half-days, paid and unpaid leave, sandwich rule, unmarked days, late marks, overtime), earnings, PF, ESI, professional tax, LWF, statutory bonus, gratuity provision, income tax (`tax.ts`: new and old regimes, age slabs, 87A rebate and marginal relief, surcharge, cess, HRA, Chapter VI-A, projection over the remaining months of the year with a true-up in the last), one-off items, loan instalments and the deduction cap. `settlement.ts` builds the full and final settlement (leave encashment, gratuity, notice recovery, loan balance) with the taxable and exempt parts split. `exports.ts` makes the PF ECR file, ESI file, PT report, TDS register, register and journal.
- **Rates are law, so they are not company settings.** Slabs, ceilings and percentages live in `payroll/rates.ts` (built in) and can be replaced by a platform admin in Platform Console → **Payroll rates** (`/console/payroll-rates`, collection `payroll_statutory_rates`, versioned, audited, resettable). A table carries `confirmed`; payroll still runs on an unconfirmed table but every payslip made on one is flagged. Built in and confirmed: income tax FY 2024-25 and 2025-26, PF, ESI, gratuity, bonus, leave encashment. **Not confirmed (check before relying on them):** FY 2026-27 income tax (carried over from 2025-26), every professional-tax slab, and no labour-welfare-fund rates are pre-loaded.
- **Company policy** (`payroll-config.ts`, Payroll → Settings) holds what a company decides: which registrations it has, how days are counted, overtime, the default regime, the deduction cap, whether a second person must approve a run.
- **Run flow.** draft → approved → paid. A draft can be recomputed (it re-reads attendance, leave, items, declarations); a salary can be held; warnings are `info`, `review` or `blocking` (a blocking one stops approval, review ones must be acknowledged). Approving books one-off items, loan instalments and settlements; deleting a run gives them back. Payslips store the figures they were made from (`schemaVersion: 2`, `ratesUsed`), so an old payslip never changes when a rate does.
- **Inputs outside the run.** Payroll → *Payroll items* (one-off earnings/recoveries, loans and advances, full and final settlement), Payroll → *Tax declarations* (HR verifies; employees declare under *My Tax*), holidays by state, alternate Saturdays and the work state on the payroll profile.
- **Requests** (`work-requests.ts`, `work-request-rules.ts`, collection `hrms_work_requests`): an employee asks for overtime already worked, a partial (short) leave (default two a month, up to 4 hours, paid, no leave balance) or an expense claim (equipment, subscriptions, internet, travel; filed against a bill within 60 days). A manager in the reporting line or HR approves; nobody decides their own. Approved overtime is read by the run (when the company pays only approved overtime, attendance hours earn nothing), an approved partial leave stops a late or half-day mark costing pay, and an approved expense becomes a non-taxable reimbursement item for the month the approver picks. Everything is closed once the month's run is approved. Limits are in Payroll → Settings.
- **Tax estimate** (`tax-preview.ts`): while filling the declaration the employee sees the tax under both regimes, worked out by the real payroll engine from their salary, payslips so far and months to come, with each deduction capped at its legal limit and the saving of the better regime.
- **Government payments** (`payroll/dues.ts`, `statutory-dues.ts`, `/talentos/payroll/compliance`): from an approved run, what is owed to EPFO, ESIC, the income-tax department and each state, the central due dates (PF and ESI on the 15th, TDS on the 7th, March TDS on 30 April), status and an estimate of TDS interest (1.5% a month or part). HR records each payment with its challan details (TDS needs BSR code and serial); a payment above the unpaid balance or a repeated reference is refused. The system does not move the money: EPFO, ESIC and TIN-NSDL offer no payment API a company can call, so payment is made on their portals or by bank and recorded here. State professional-tax and labour-welfare due dates are not preset because they differ by state.
- **Payments are Razorpay-only** (`payments/payouts.ts`, `payout-provider.ts`). Every payment the company makes goes through its own RazorpayX account: salaries (TalentOS), and anything paid from CashFlow (vendor bills, reimbursements, advances, one-off payments, via the `fms_payouts` engine). A payout is created at RazorpayX with our own id as the idempotency key, so a retried request cannot pay twice; a request that never reached Razorpay stays "queued" and is retried safely. RazorpayX's webhook (`/api/talentos/payroll/webhook/<companyId>`, events payout.processed, failed, reversed, rejected) reports the result, and "Check status" asks Razorpay directly when a webhook was missed. Nothing is shown as paid until Razorpay says so. When paid, one expense is booked against the **RazorpayX balance** account in CashFlow (created on first use); a reversed payout reverses it. An approved payable that is paid has its existing entry completed instead of a second one being added. The modules that pay through the engine, and what each does only when Razorpay has paid: a **vendor bill** (SpendIQ payment saved as scheduled, then processed and the bill reduced), an **employee advance** (approved, then disbursed), an **employee reimbursement** (record and "reimbursed" made then), an **HR expense claim** (paid now instead of with salary), and any one-off payment from Payments. Payees come from what the company already keeps: a vendor's saved bank details (`fms_beneficiaries`, account number encrypted, never marked verified by us) and an employee's primary bank account. Money a customer pays outside the gateway (cash, cheque, bank transfer) is recorded as a **receipt** (`receipts.ts`, rules in `receipt-rules.ts`): the money must be tied to a company bank or cash account; a bank transfer needs the bank's reference and the same reference and amount is not recorded twice; cash from one customer in a day must stay under ₹2,00,000 (section 269ST); a cheque needs its six-digit number, bank and date, is kept as *awaiting clearance* (nothing applied to the invoices, nothing booked) until it is marked cleared, and a bounced cheque keeps its reason and changes nothing. Voiding a cleared receipt reverses the allocation and the ledger entry. Receipts made by the Razorpay checkout skip these rules because the gateway has already proved the money arrived. There is no simulated or offline gateway any more (the mock provider, its checkout and `ALLOW_MOCK_PAYMENTS` are gone); Razorpay is the only `PaymentProviderId`. Payouts that RazorpayX has not reported (no webhook secret yet, a missed delivery) are caught up by asking Razorpay when the Payments, Salary Payouts or run pages are opened (`refreshStalePayouts`, `refreshStaleSalaryPayouts`: bounded, best effort). A payment link is emailed to the customer when it is created, and counts as "sent" only if the email went out. Customer refunds go through Razorpay's refund API on the original payment and are completed only after Razorpay accepts them; customers pay invoices and payment links through Razorpay Checkout, and the server confirms the order with Razorpay before a receipt is made. The company's **current account** (`payroll-bank.ts`, `/talentos/payroll/bank`, a CashFlow bank account) tops up RazorpayX (recorded as a transfer between the company's own accounts) and pays government dues, which cannot go through Razorpay: PF, ESI, tax and professional tax are paid on their portals and recorded against a company account. Tests: `npm run test:payroll` (including `scripts/test-razorpay-payouts.ts`) run against an in-memory stand-in for Razorpay's API, so they check our requests, not Razorpay itself.
- **Payment security** (what protects money leaving the company; each point has a test in `scripts/test-razorpay-payouts.ts` or `test-payroll-run.ts`). *Who:* only finance managers (those who can approve transactions) send vendor payments, reimbursements and advances; an accountant records a payment as scheduled and the manager pays it; Razorpay keys are changed only by the owner. *Confirmation code:* before any money moves (and before keys, limits or approvals change) the person confirms with the code from their authenticator app, else one emailed to them (`security/payment-auth.ts`, `payment-guard.ts`); a code works once, wrong tries are limited, and a stolen session alone cannot send money. The company can switch it off (not recommended); `PAYMENT_CODE_DISABLED=true` skips it in local development only, never in production. *Limits (Payments → Limits, owner only):* most for one payment, most per day, most in salaries per day, the amount from which a *second person* must approve (never the person who started it; several small payments to one payee that add up past it also wait), and a cooling-off (24 h by default) for a payee's new or changed bank details, whether a vendor's or an employee's. *No double payment:* our payout id is the idempotency key at Razorpay, a repeated form submission carries a key, and one record cannot be paid twice. *Trust nothing from outside:* a webhook is checked against the company's secret with a timing-safe comparison, size-limited and rate-limited; RazorpayX must report exactly the amount we asked for or the payment is held for a person, not booked as paid; customer payments are confirmed with Razorpay itself and the Checkout signature is verified. *Secrets:* Razorpay keys and bank account numbers are encrypted at rest; the assistant can never start a payment. *Watching:* every start, approval, refusal, payment, failure and reversal is in the audit trail, and the owners are emailed about payments waiting for approval, failures, returns, amount mismatches, changes to the Razorpay connection, to limits and to anyone's bank details. *What this does not do:* it cannot stop someone who holds both a signed-in session and the confirmation channel (the owner's phone or mailbox), it does not check an account with a test payment of ₹1 (RazorpayX offers that for a fee), and Razorpay-side protections (an allow-list of server addresses for the API keys, key rotation, RazorpayX's own approval workflow) must be turned on in the Razorpay dashboard.
- **Customer payments, end to end** (`payments/links.ts`, `intents.ts`, `webhooks.ts`, the `/pay/<token>` page; tested in `scripts/test-customer-payments.ts` and, for the production front door, `scripts/test-gate-rules.ts`). A link has a 128-bit token, expires after 7 days and allows five attempts; the attempt is counted atomically when the customer starts to pay, and a paid link can never be paid again. The server makes the Razorpay order from the stored link (the browser never names an amount), the customer pays in Razorpay Checkout, and the payment is confirmed with Razorpay itself, by the browser (`verify`, with the Checkout signature) and by Razorpay's webhook. Whichever arrives first claims the payment atomically, so the other cannot book it again; a receipt and the invoice update (or, for a link with no invoice, an income entry) are booked once to the *Razorpay collections* account in the ledger, which Razorpay settles to the bank later (record that as a transfer). If the money arrives but cannot be booked (for example the invoice was paid in the meantime) the payment is kept, flagged for review and the owners are emailed: it is never lost. Refunds go back through Razorpay on the customer's own payment and take the money out of the same account. The front door (`security/gate.ts`) treats the two customer endpoints as public (browser origin and rate limits still apply) and the webhooks as machine routes that need Razorpay's signature header; every route that moves company money needs a signed-in person. **Payments → Payment setup check** (and `npm run check:payments -- --company <slug>`) lists what is missing: keys, webhook secret, email, confirmation code, owners.
- **Test data.** `npm run seed:payroll -- --company <slug>` fills an empty test company with eight employees that each exercise a rule (high earner with tax, old-regime declaration with rent, ESI-covered, mid-month joiner, leaver with full and final settlement, missing PAN/UAN/bank), last month's attendance and an approved run, and this month's items and requests. `--reset-only` removes it and restores the payroll settings it changed; `--login` also makes a portal login for one employee. `--razorpay` also connects Razorpay **test** keys (`SEED_RZP_KEY_ID` must be `rzp_test_…`; `SEED_RZP_KEY_SECRET`, `SEED_RZP_ACCOUNT_NUMBER`, optional `SEED_RZP_WEBHOOK_SECRET`) with salary payouts on, so the approved month can be paid through RazorpayX in test mode; `--reset-only` disconnects them. Test bank accounts need `PLATFORM_ENCRYPTION_KEY` (base64, 32 bytes) in the environment. It refuses the platform company and any company with real employees.
- **Downloads** for a run: `/api/talentos/payroll/runs/[id]/export/[type]` (`register`, `pf-ecr`, `esi`, `pt`, `tds`, `journal`); ECR and ESI need an approved run. Every download is audit-logged.

## CA & Compliance (CashFlow AI)

`src/lib/products/cashflow-ai/compliance/`. `catalog.ts` is the CA checklist as data (from `local/CA_Pvt_Ltd_Complete_Checklist_README.md`); an item's key is `<section>.<position>`, saved with the company's progress, so the lists are append-only. `tracker.ts` stores progress (`fms_compliance_items`, one row per touched item), `filings.ts` the filing calendar (`fms_compliance_filings`), `health.ts` the live book-health checks that read the ledger, bank lines, invoices, bills, tax rates, payroll dues and the calendar. `*-core.ts` files are pure (tested by `npm run test:compliance`). The catalog and templates carry no due dates, rates or thresholds: the checklist says the CA/CS must confirm them, so the calendar holds only dates the company types in, flagged as confirmed or not. `facts.ts` + `auto-core.ts` give checklist items an "auto signal" (verified / issue) only where the books really prove it, and never for a fact that could not be read; the signal informs, it never changes a saved status. `owners.ts` holds who does each workstream (README §22). Overdue and due-within-7-days filings are reminded daily from the existing FMS notification sweep (`fms_filings_overdue`, `fms_filings_due_soon`), so no new cron or function. Viewing needs `canViewFinancialStatements`, editing `canManageCompliance`; every change is audit-logged.

### Razorpay settlements

`payments/settlements-core.ts` (pure) parses Razorpay's combined settlement report (`/v1/settlements/recon/combined`, amounts in paise) and recomputes each settlement's net from payments less fee and tax, less refunds, plus adjustments; only a settlement where that agrees with what Razorpay says it credited is "ready". `settlements.ts` stores settlements and lines (`fms_gateway_settlements`, `fms_gateway_settlement_lines`), matches payments to customer payments by `gatewayPaymentId`, and `bookSettlement` posts the fee (account 5600), the GST on the fee (1500, the input-credit ledger the GST module will use) and the net transfer from "Razorpay collections (awaiting settlement)" to the chosen bank account, behind an atomic claim so it books once. Adjustments, chargebacks, unidentified payments and any mismatch hold the settlement for review. The report's field meanings come from Razorpay's documentation and have not been run against a live account: the sum check is what stops a wrong assumption from being booked. `npm run test:settlements`.

### Accrual books

`accrual/` in `lib/products/cashflow-ai`. Off by default: until the company switches it on (`fms_accrual_settings`, one document) the ledger works exactly as before (cash basis). `core.ts` (pure) builds the journal lines of a document (invoice, credit note, bill, debit note, opening balances) and their signature; `posting.ts` keeps each document's single live journal entry (`docKey`, unique) in step with the document — unchanged = left alone, changed = reversed and re-posted, cancelled / draft / deleted = reversed — and refuses a change that would land in a closed fiscal period (the callers put the change back); `engine.ts` switches the books on (opening receivable and payable from the records, existing documents flagged `openingAccrued`), posts anything missed, and compares the ledger's Receivable / Payable with the records (`accrualTieOut`). A customer receipt or vendor-bill payment carries `accrualRole` and, when recorded after the switch-on, settles Receivable / Payable instead of income / expense. Documents in the opening balances cannot change amount. `npm run test:accrual`.

### Income-tax working

`lib/products/cashflow-ai/income-tax/`: `core.ts` (pure) is the computation (`computeTax`: book profit, additions and deductions by scope normal / MAT / both, loss set-off limited to what is available and to the income, rate then surcharge then cess, the higher of normal tax and MAT when the CA says MAT applies, less tax paid) and the advance-tax instalment comparison; it holds no rate, threshold or date. `store.ts` keeps one document per financial year (`fms_it_years`: rates with a Confirmed flag, adjustments, set-offs) and assembles a year from the profit and loss, `fms_it_losses`, `fms_it_payments` (via `taxPaidForYear`) and the TDS customers deducted on receipts. `provision.ts` posts the tax as a provision through the same one-live-entry-per-document mechanism as the accrual books. `payments-store.ts` (`fms_it_payments`, `fms_it_schedules`), `losses-store.ts`, `returns-store.ts` (`fms_it_returns`) and `notices-store.ts` (`fms_it_notices`, append-only events) are the registers. The profit and loss excludes a period's closing entry, so a closed year still shows its profit. `npm run test:income-tax`.

### TDS working

`lib/products/cashflow-ai/tds/`: `core.ts` (pure) holds PAN checks, the Indian financial year and quarters, the per-bill deduction check (`deductionRows`, `expectedTds`) and the month-by-month deposit position; it contains no rate, limit or due date, only what the company entered per section (`fms_tds_sections`, with a Confirmed flag, who and when). `store.ts` reads vendor bills (`prms_invoices`, with the optional `tdsSection` and the vendor's PAN) into deductions. `challans-store.ts` (`fms_tds_challans`; the deposit posts Dr 2220 TDS payable / Cr bank when accrual books are on, a unique index on BSR code + serial + date), `statement.ts` / `statement-csv.ts`, `certificates-core.ts` / `certificates-store.ts` (`fms_tds_certificates`, `fms_tds_lower_certs`) and `credits-core.ts` / `credits-store.ts` (`fms_tds26as_uploads`, `fms_tds26as_rows`: TDS that customers deducted, matched with receipts) sit on top. No API routes: CSV downloads and uploads are server actions. `npm run test:tds`.

### GST working

`lib/products/cashflow-ai/gst/`: `core.ts` (pure) turns invoices and vendor bills into GST rows (recipient / vendor GSTIN checked with the platform's `lib/platform/billing/gst.ts`, place of supply, CGST + SGST halves or IGST, rate-wise lines, flags) and a month's GSTR-3B working; nothing in it applies a threshold or decides eligibility. `store.ts` loads a month from the books and keeps the company's input-credit decision per bill (`fms_gst_itc`). `register.ts` / `csv.ts` / `hsn.ts` (sales), `purchases-*.ts` (purchases) and `gstr2b-core.ts` / `gstr2b-store.ts` (uploaded GSTR-2B, `fms_gstr2b_uploads` and `fms_gstr2b_rows`, re-compared on every read) sit on top. No API routes: CSV downloads are server actions. The company's own GSTIN and state come from Settings → Company details. `npm run test:gst`.

### Month close, party reconciliation, vendor controls

`month-close/`: `core.ts` (pure step catalog with stable keys, IST month and Indian fiscal-year helpers, fact evaluation, lock decision) and `store.ts` (facts, person-recorded steps in `fms_month_close_steps`, override, lock through `closePeriod`). Every fact fails soft: unreadable is never "passed". `party-recon/`: `core.ts` pure statements, ageing, flags and `compareWithConfirmation`; `store.ts` builds statements from the sub-ledger collections (never the general ledger) and owns `fms_party_confirmations` and `fms_party_writeoffs`. `vendor-controls/`: `core.ts` pure; `store.ts` owns `fms_vendor_bank_state`, `fms_vendor_msme`, `fms_vendor_advances`, `fms_vendor_controls_settings`. `vendorPayee` pays only independently verified bank details; `saveBeneficiary` triggers the change check for vendors straight away, and the check also runs on every payout and page view. A debit note in this product is an extra charge owed to the vendor: it increases the payable.

### Books clean-up

`hygiene-core.ts` / `hygiene.ts`: a vendor bill with a vendor invoice number already entered for the same vendor is refused when entered in SpendIQ (numbers compared ignoring case, spaces, dashes and slashes; zeros count); same vendor + date + total under another number is only listed. Also lists bills with no document and completed income/expense entries with no account. Feeds the book-health panel and the checklist signals.

## Legal pages

The public policies (Terms, Privacy, Refund & Cancellation, Cookie, Data Policy, Data Processing Addendum, Sub-processors, Data Rights, Grievance Redressal) are written for India in `src/lib/platform/saas/legal-india.ts` (Information Technology Act and rules, CERT-In directions, Digital Personal Data Protection Act, Consumer Protection and E-Commerce Rules, CGST Act, Contract and Arbitration Acts). They are built per request from the operator's profile in Platform Console → **Legal & compliance** (entity, registered office, registration number, Grievance Officer, courts, effective date; legal name and GSTIN from Tax & invoicing). A field that is not entered is left out, never replaced by a placeholder, and the Console lists what is still missing. `npm run test:legal` guards this. Websites generated for companies get an India-law Privacy Policy and Terms of Service page of their own.

## Environment

| Variable | Meaning |
| --- | --- |
| `MONGODB_URI` | The platform database. Use a new, empty one |
| `SAAS_ADMIN_EMAIL`, `SAAS_ADMIN_PASSWORD` | First platform staff account (password optional; quote it if it contains `#`) |
| `SAAS_HOSTS` | Production hosts of the product site |
| `PLATFORM_ROOT_DOMAIN` | Root of customers' automatic addresses |
| `SAAS_HELLO_EMAIL`, `SAAS_SALES_EMAIL`, `SAAS_SUPPORT_EMAIL`, `SAAS_SECURITY_EMAIL` | Public mailboxes (default `<name>@<saas host>`) |
| `SAAS_OPERATOR_NAME` | Optional operating company named in the footer and legal pages |

The full list is in the README and `.env.example`.

## Where things live

| Path | Contents |
| --- | --- |
| `src/proxy.ts` | Host routing and rewrites |
| `src/instrumentation.ts` | First-start operator setup |
| `src/app/(platform)/console/` | Platform operator product, served at `/console` |
| `src/app/(platform)/saas/` | SaaS marketing pages, organized under the platform route group |
| `src/lib/platform/saas/`, `src/components/platform/saas/` | SaaS brand, hosts, routes, marketing components and content |
| `src/lib/push/`, `src/lib/pwa/`, `public/sw.js` | Push notifications and the installable app |
| `src/lib/platform/` | Tenancy, companies, billing, product registry, domains, email, website starter |
| `src/components/products/<slug>/`, `src/lib/products/<slug>/` | Product UI and product-specific server logic |
| `src/lib/products/sitecraft-ai/` | SiteCraft AI collections, themes and sections |
| `src/app/(platform)/` | Sign-up, SaaS routes, console, maintenance and workspace-not-found |
| `scripts/demo-seeders.ts`, `scripts/demo/` | The demo data command |

### My work (CashFlow AI)
`work/catalog.ts` (data) → `work/engine.ts` (pure) → `work/store.ts` (progress in `fms_work_log` unique on taskId+periodKey, `fms_work_plan` keyed `main`) → `work/auto.ts` (auto-proven steps, fail-soft) → pages under `(protected)/work` with server actions that re-check permissions and recompute auto ticks. Periods are validated with `canonicalPeriod`, so made-up keys never create rows.
