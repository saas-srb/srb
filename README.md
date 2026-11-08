# SelfRun Business

AI-powered business automation as a multi-tenant SaaS. A company signs up, gets its own workspace and website address, and
runs its whole business from one place: people, projects, sales, finance, procurement, training, documents, marketing and
support, with AI built into every product.

One Next.js app and one MongoDB database serve three audiences:

| Who | What they use |
| --- | --- |
| **Visitors** | The product website: features, modules, pricing, resources, demo request and `/signup` |
| **Customers** (companies) | Their public website on `<slug>.<root domain>` or their own domain, and their products (workspace, portal, …) on a separate app address |
| **Platform staff** | The Platform Console: companies, plans, billing, coupons, domains, support and platform settings |

For what every product does, see [docs/products.md](./docs/products.md). Architecture and deployment details are in
[docs/architecture.md](./docs/architecture.md) and [docs/deploy-vercel.md](./docs/deploy-vercel.md). To build and install the Linux, Windows, macOS,
Android and iOS apps, follow [docs/build-apps.md](./docs/build-apps.md).

> **Next.js 16.** APIs and file conventions differ from older versions (for example `src/proxy.ts` replaces
> middleware). Read the relevant guide in `node_modules/next/dist/docs/` before writing framework-level code.
> See [AGENTS.md](./AGENTS.md).

## Contents

1. [Product overview](#product-overview)
2. [How it works](#how-it-works)
3. [Tech stack](#tech-stack)
4. [Third-party services and costs](#third-party-services-and-costs)
5. [Environment variables](#environment-variables)
6. [Run locally](#run-locally)
7. [Register a company](#register-a-company)
8. [Demo data](#demo-data)
9. [Deploy to production (Vercel)](#deploy-to-production-vercel)
10. [NPM scripts](#npm-scripts)
11. [Project structure](#project-structure)
12. [Architecture notes](#architecture-notes)
13. [Troubleshooting](#troubleshooting)
14. [Contributing](#contributing)

(The installable app and push notifications are described under [Mobile app and push notifications](#mobile-app-and-push-notifications).)

---

## Product overview

Every company gets the products its plan includes. Products are switched on or off per plan, and the platform staff manage the
plans and prices.

| Area | Products |
| --- | --- |
| **Core** | Workspace (dashboard, users, roles, branding, domains, billing, audit log), Team Chat |
| **People and operations** | HR & Payroll, Projects, Procurement & Assets, Training, SOPs & Policies |
| **Sales and finance** | CRM & Sales (leads, pipeline, campaigns, offers, wallet), Finance |
| **Documents and knowledge** | Legal & Documents, Digi Locker, Online Tests |
| **AI** | AI Assistants (custom bots), AI Intelligence (ask questions about your business data) |
| **Marketing and web** | Social Media, SEO, Website (CMS) with a public site per company |
| **External users** | Client & Student Portal for clients, students, interns and applicants |
| **Help** | Help & Support: AI help chatbot, help center and support requests to the platform team |

Customer self-service: sign-up with email confirmation, a free plan for life (no trial), plan upgrade and billing, add-ons, coupons, custom
domains with automatic TLS, and a starter website that is live from the first minute.

Platform staff: company registry, plans and prices, subscriptions, revenue metrics, invoices, coupons, add-ons, usage,
domains and SSL, support requests and help content, platform roles, audit log and integrations.

---

## How it works

Every company has **two addresses**: one for its **website** and one for its **app**. The website host serves only the
website; the app host serves the company's products. A page that belongs to the other side is redirected there.

| Who | Website (public pages only) | App (Workspace and enabled products) |
| --- | --- | --- |
| SelfRun Business | `selfrunbusiness.com`, `www.selfrunbusiness.com` (product website, `/signup`, `/login`) | `app.selfrunbusiness.com` (Platform Console and Workspace for platform staff) |
| A customer on an automatic address | `<slug>.selfrunbusiness.com` | `<slug>-app.selfrunbusiness.com` |
| A customer with its own domain | `acme.com` | `app.acme.com` |
| Anything else | "No workspace here" | |

In development: `localhost:3000` is the product website and `app.localhost:3000` the Platform Console; a customer is
`<slug>.localhost:3000` (website) and `<slug>-app.localhost:3000` (app).

- **Operator company.** The first start creates the company that runs the product (flagged as the platform owner) and the
  first platform staff account. Staff sign in at `app.selfrunbusiness.com/workspace/login` and manage the platform at `/console`.
- **Customers are all equal.** A company registers at `/signup` and gets a Super Admin account, its products and a starter
  website. Nothing is special-cased for any customer.
- **Tenancy.** Data lives in shared collections scoped by `companyId`; the database layer adds the scope automatically, so a
  query cannot see another company's rows.
- **Host routing.** `src/lib/platform/saas/hosts.ts` decides which hosts serve the product (site and app); `src/proxy.ts` rewrites the
  product website's marketing paths to `/saas/*` and sends a page to the other side's host when it is requested on the wrong one
  (`src/lib/platform/tenancy/surfaces.ts`). App hosts are never indexed (`noindex`, `Disallow: /`).
- **Slugs.** A workspace address can't end in `-app` (that is the app host of another address).

---

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling / UI | Tailwind CSS 4, shadcn-style components, Base UI, lucide-react, next-themes |
| Data | MongoDB (official driver, no ODM) |
| Charts / motion | Recharts, Framer Motion |
| Documents / exports | ExcelJS, `@react-pdf/renderer` |
| AI | OpenAI (Responses API, file search, image generation), ElevenLabs (voice) |
| Payments | Razorpay (subscriptions, payouts) |
| Storage | Vercel Blob (private) |
| Email | Resend |
| Hosting | Vercel (cron jobs in `vercel.json`) |

---

## Third-party services and costs

Everything the platform depends on outside this repository. "Required" means the product needs it to run; the rest switch on one feature each.
Prices change, so none are listed: the last column says how each one is billed. Keys for these services are listed under
[Environment variables](#environment-variables).

| # | Service | Used for | Required? | Cost | How it is billed |
| --- | --- | --- | --- | --- | --- |
| 1 | **Vercel** (server / hosting) | App, API, cron jobs, SSL, CDN, domains | Yes | Paid | Pro plan (per seat, monthly) plus bandwidth and function usage |
| 2 | **MongoDB Atlas** (database) | All data, every company's | Yes | Paid | Paid cluster (M10 or above), with storage and backups |
| 3 | **Vercel Blob** (storage) | Resumes, documents, chat attachments, voice files | Yes | Paid | GB stored plus transfer |
| 4 | **Resend** (email) | Verification, invitation, invoice and reminder emails | Yes | Free limit, then paid | Monthly plan after the free limit |
| 5 | **Razorpay** (payments) | SaaS subscriptions and payments | Yes | Per transaction | About 2% plus GST per transaction, no monthly fee |
| 6 | **Domain registrar** (your main domain) | The app address, `app.` and `*.` subdomains | Yes | Paid | Yearly |
| 7 | **Customers' custom domains** (e.g. `acme.com`) | A company's own address | When a company wants one | Paid by the customer | The customer's registrar fee. Your side: adding domains to the Vercel project (included in Pro) |
| 8 | **OpenAI** | AI chatbot, assistants, Intelligence, SOP and social-post generation, file search | When AI is used | Paid | Per token, plus vector-store storage |
| 9 | **ElevenLabs** | Voice / text to speech | When voice is used | Paid | Monthly plan or per character |
| 11 | **RazorpayX** (payouts) | Direct payouts from Finance | Only for payouts | Paid | Per payout fee plus account |
| 12 | **GitHub Actions** | Desktop and mobile app builds | Only for apps | Free minutes, then paid | Private repositories get limited free minutes; Windows and macOS minutes count extra |
| 13 | **Apple Developer** | iOS app and macOS signing | Only for iOS / macOS apps | Paid | Yearly |
| 14 | **Google Play Developer** | Publishing the Android app | Only for the Android app | Paid | One time |
| 15 | **Windows code-signing certificate** | Removes the "unknown publisher" warning on the installer | Optional | Paid | Yearly |
| 16 | **TURN server** (Twilio, Metered, or your own coturn) | Team Chat calls across different networks | When calls are used | Paid | Per GB or server cost |
| 17 | **Error monitoring** (e.g. Sentry) | Catching production errors | Recommended, not built in | Free to paid | Monthly |
| 18 | **Uptime monitor** (UptimeRobot, Better Stack) | Alerts when the site is down | Recommended | Free to paid | Monthly |
| 19 | **Web Push** (VAPID keys) | Notifications for the app and the website | Yes | Free | Generate the keys once |
| 20 | **Google APIs** (Search Console, Indexing, OAuth) | SEO product and Google sign-in | When SEO is used | Free | Service-account setup only |
| 21 | **Meta and LinkedIn APIs** | Social media publishing | When Social Media is used | Free | App review, no fee |
| 22 | **Tawk.to** (live chat) | Website live-chat widget | Optional | Free tier | Free tier |

The first running costs come from rows 1 to 6 and row 8. OpenAI is usage-based, so set AI limits on the plans.

---

## Environment variables

Copy `.env.example` to `.env` (git-ignored) and fill it in. Never commit real values, and never paste them into chat,
tickets or docs.

### Required (environment)

Only what the server needs before it can read the database. Everything else is set in the Platform Console and kept encrypted in the database.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. Use a **new, empty** database; the database name is the URI path |
| `SAAS_ADMIN_EMAIL` | Email of the first platform staff account, created automatically on first start |
| `SAAS_ADMIN_PASSWORD` | Optional. Password for that account. If omitted, a temporary one is printed once in the server log. **Wrap it in quotes** if it contains `#` or spaces |
| `PLATFORM_ENCRYPTION_KEY` | The single encryption key: every secret kept in the database, bank details, finance accounts, Digi Locker credentials, social tokens and API body sealing. `openssl rand -base64 32`; generate once and keep it (changing it makes the encrypted data unreadable) |
| `SAAS_HOSTS` | Production: comma-separated hosts serving the product website (`www.` variants are added). Development includes `localhost` |
| `CRON_SECRET` | Production on Vercel: the bearer secret Vercel Cron sends to the cron endpoints. Also managed in Platform Console → Integrations → Scheduled jobs (the Console value works for any other scheduler) |

### Set in the Platform Console (not in `.env`)

| Where | What |
| --- | --- |
| Integrations → Email | Provider, Resend API key, sender address |
| Integrations → Domains | Custom-domain provider (Vercel token, project, team) and the root domain companies live under |
| Integrations → AI | OpenAI API key |
| Integrations → Voice & messaging | ElevenLabs key, Twilio SID / token / WhatsApp sender |
| Integrations → Push notifications | VAPID key pair (`npx web-push generate-vapid-keys`, once; never change it later) |
| Integrations → File storage | Vercel Blob read/write token |
| Integrations → Upload safety check | Optional VirusTotal key |
| Payments | Razorpay key id, key secret and billing webhook secret |

The same-named environment variables (`OPENAI_API_KEY`, `RESEND_API_KEY`, `VAPID_*`, `BLOB_READ_WRITE_TOKEN`, `RAZORPAY_*`, …) still work as a fallback for older deployments; anything saved in the console wins.

### Optional feature variables

| Variable | Feature |
| --- | --- |
| `HRMS_API_SECRET`, `LEADS_API_SECRET`, `INDEXING_API_SECRET` | Bearer secrets for API and export endpoints |
| `HRMS_PAYOUT_PROVIDER`, `RAZORPAY_ACCOUNT_NUMBER`, `RAZORPAY_WEBHOOK_SECRET` | Salary payouts from the platform account |
| `MESSENGER_TURN_URL`, `MESSENGER_TURN_USERNAME`, `MESSENGER_TURN_CREDENTIAL`, `MESSENGER_CALL_MAX` | TURN relay for Team Chat calls |
| `NEXT_PUBLIC_APP_URL`, `PLATFORM_WILDCARD_SUBDOMAINS`, `SAAS_OPERATOR_NAME`, `SAAS_*_EMAIL` | Public URL, wildcard subdomains, legal name and contact addresses |
| `META_*`, `GOOGLE_OAUTH_*`, `LINKEDIN_*` | Social publishing |

> Treat encryption keys as permanent once data is written. Do not change them without re-encrypting the stored data.

---

## Run locally

Requirements: Node.js 20.9 or newer, npm, and a MongoDB database (Atlas or local).

```bash
npm install
cp .env.example .env
# edit .env: set MONGODB_URI (a new empty database) and SAAS_ADMIN_EMAIL
npm run dev
```

On the first start the server creates the operator company and the staff account, and logs
`[saas] Platform operator … created`.

| URL | What you see |
| --- | --- |
| `http://localhost:3000` | The SelfRun Business website |
| `http://localhost:3000/signup` | Company sign-up |
| `http://app.localhost:3000/workspace/login` | Staff sign-in (app host) |
| `http://app.localhost:3000/console` | Platform Console (staff only) |

`*.localhost` addresses resolve to your machine in Chrome; if your browser does not resolve them, add them to `/etc/hosts`.

---

### Plans and limits

Every plan has every product and feature; only the number of people and the allowance of each paid service change. The numbers come from
`DEFAULT_PLANS` in `src/lib/platform/billing/plans.ts`, were worked out in the Platform Console → Costs & pricing calculator from the providers'
official prices, and are loaded into an older catalogue once (revision `PRICING_REV`); later edits in the Platform Console are kept. Prices are
monthly, before GST; yearly is 10 × monthly.

| Plan | Price | People | AI tokens / month | Files | Emails / month | Voice min / month | Domains |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Free | ₹0 | 1 | 250,000 | 500 MB | 100 | 5 | 1 |
| Starter | ₹499 | 10 | 400,000 | 1.5 GB | 300 | 10 | 2 |
| Growth | ₹999 | 50 | 1,000,000 | 10 GB | 2,000 | 40 | 3 |
| Business | ₹1,999 | 200 | 2,000,000 | 25 GB | 6,000 | 120 | 5 |
| Enterprise | Contact support | 500 | 20,000,000 | 500 GB | 100,000 | 3,000 | 20 |

## Register a company

1. Open `/signup`.
2. Enter the company name, workspace address (slug), work email, password and business categories, and accept the terms.
3. Confirm the email (in development with `EMAIL_PROVIDER=console`, the link is printed in the server log).
4. The company is created with a Super Admin account on the Free plan, its products and a starter website.

Its website is `http://<slug>.localhost:3000` in development and `https://<slug>.<PLATFORM_ROOT_DOMAIN>` in production; its
app is at `http://<slug>-app.localhost:3000` and `https://<slug>-app.<PLATFORM_ROOT_DOMAIN>`. After sign-up the owner is
signed in on the app address.

---

## Mobile app and push notifications

There are two separate things:

1. **The app, for the company's team** (and its portal users): the **products** (every `app.…` / `<slug>-app.…` address) are an
   installable app (PWA) with push notifications, so a business can be run from a phone.
2. **Website push, for the company's visitors**: the public website can ask visitors for notification permission and the
   business sends them offers, rewards and news. See [Website push](#website-push-for-a-companys-visitors) below.

A company's website is **not** an installable app: it has no manifest and no offline mode, only the opt-in bell.

| Where | How to install |
| --- | --- |
| Android, Windows, Linux, ChromeOS, macOS (Chrome, Edge, Brave, Opera, Samsung Internet) | The browser offers “Install app”; the app also shows its own Install button |
| iPhone and iPad (Safari) | Share → **Add to Home Screen** (push works only from the installed app, iOS/iPadOS 16.4+) |
| macOS Safari | File → **Add to Dock** |
| Firefox | Android: Add to Home screen. Desktop Firefox cannot install web apps but still gets push in the browser |

- **Every company's app is its own, and dynamic.** Name (`Acme — Workspace`), short name, logo or initials, status-bar colour
  (light and dark mode), splash background, start page, shortcuts and more all come from the company's branding and theme
  automatically, and a Super Admin can override each of them in **Workspace → Settings → Mobile app**: names, an app icon (the
  Branding logo, an uploaded icon or initials) with its background, custom colours, which product the app opens on, up to 4
  long-press shortcuts, window style, orientation, the iPhone status bar and whether the install banner shows, with a live
  preview. Icons (including maskable ones for Android) are generated from these settings. The product's own app host is
  “SelfRun Business — Workspace” and is fixed.
- **Offline.** Installed or not, a lost connection shows a friendly offline page. Pages and data are never cached, so a shared
  device never shows another person's data.
- **Push.** Business events, reminders, alerts, workflow updates, AI activity, messages and system notices that already appear in a
  product's bell are also pushed to that person's devices: HR, Projects, Procurement, Training, Team Chat, SOPs, Digi Locker, SEO,
  Social, AI assistants, Online Tests, automations and the client portal.
- **Controls.** Each person opens Workspace → Notifications → **Settings** (portal: Notifications → Settings) to turn notifications on
  per device, switch each category on or off, set quiet hours with a time zone, send a test, and remove devices. Alerts ignore
  quiet hours; the in-app bell always shows everything.
- **Set up.** Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, then redeploy. Without them push is simply off (the install button and
  everything else still work). Never change the pair later: every device would have to subscribe again.
- **Safety.** Subscriptions are per company and per person; only addresses of the real browser push services are accepted; a link in a
  notification can only point inside the app; dead subscriptions are removed automatically.

### Apps (generated for every company)

**Workspace → Settings → Apps & downloads** (Super Admin) is one place for all of a company's apps, in three tabs, plus the
settings that shape them (name, icon, colours, start page, shortcuts, desktop defaults). Everything is per company and dynamic.

| Tab | What it is | Output |
| --- | --- | --- |
| **PWA Application** (all devices) | The installable web app. Ready as soon as the workspace exists; no build | Address, QR code, install steps per device, live preview, asset pack |
| **Mobile Application** (Android & iOS) | A native shell that opens the workspace | Android APK and Android Studio project, Xcode project (you sign with your own Apple account), previews, asset packs |
| **Desktop Application** (Windows, Linux, macOS) | Electron apps | `.exe`, `.dmg`, `.AppImage`, `.deb` |

Every image the apps need is **generated from the company's own name, logo and colours** and previewed on the page: icons for every
density and size, Android adaptive and round icons, Play Store icon and feature graphic, the iOS icon set, splash screens, and the
desktop icons. Each tab has a downloadable asset pack (ZIP). Change the name, logo or colours and all of it follows.

**One button per app, pressed by a person.** Nothing is ever built automatically: not when onboarding finishes, not after a rename or
a new icon, not by a daily job. On the Mobile and Desktop tabs each platform has its own button, a Super Admin presses the ones needed,
and only that app is built: **Generate Android App**, **Generate iOS App**, **Generate Windows App**, **Generate macOS App**,
**Generate Linux App**. After an app exists the button reads **Regenerate …**. Android can be generated while Windows is building;
the same app cannot be started twice at once.

A press hands the build to the build service (a GitHub Actions workflow). It reports back, and the download links appear on the Apps
page, which updates while it waits. The daily job only hands over builds a person already asked for (when the build service was not yet
connected) and marks builds that never finished as failed so the button comes back; it never starts one. If the company changes its name or
icon, the page says so and offers **Regenerate**.

**Every app is the company's own.** Name, short name, icon, splash, colours, start page and shortcuts all come from the company's branding
and Workspace → Settings → Apps; the installers, the app ids (`app.<company>.desktop`, `app.<company>.mobile`), the publisher and maintainer
fields and the window and notification names are the company's, and nothing of the platform's brand is shown. Colours, shortcuts and the
start page need no rebuild: every installed app reads them from the server. One-time platform setup:
[docs/deploy-vercel.md](./docs/deploy-vercel.md#15-optional-desktop-and-mobile-apps). Until the build service is connected, a press waits
in the queue and starts by itself once it is.

### Desktop app (Windows, macOS, Linux)

`desktop/` is an Electron app that opens a company's workspace in its own window with a tray icon and native notifications. It is
**fully dynamic**: nothing about a company is built in. On every start it reads the company's name, icon, theme colours
(light/dark), start page and shortcuts from `/api/desktop/branding`, which uses the same settings as the mobile app (Workspace →
Settings → Mobile app). Use one generic app (it asks for the workspace address once) or build an installer for one company named and
iconed as that company: `cd desktop && npm install && npm run build:company -- --address acme`. Electron has no Web Push, so the
desktop app polls `/api/desktop/notifications` and shows native notifications while it runs (it can stay in the tray). Details,
security notes and the CI workflow (`.github/workflows/desktop.yml`): [desktop/README.md](./desktop/README.md). Building needs Node 22.

### Website push (for a company's visitors)

For each company, its public website (`<slug>.selfrunbusiness.com` or its own domain) can offer visitors notifications. The
business controls it in **CMS → Push notifications** (Super Admin or anyone with the CMS settings permission).

- **Off by default.** Turn on *Website notifications* and save. Visitors then see a small bell (and, after a delay you choose, a card)
  asking which topics they want: *Offers and deals*, *Credits and rewards*, *News and updates*, *Announcements*. They can change
  or turn it off from the same bell at any time. iPhone/iPad Safari can't receive push from a plain website, so the bell is hidden there.
- **Automatic.** When a festival offer campaign goes live, a reward or referral campaign is switched on, or a blog post is
  published, the matching topic is notified (each can be switched off).
- **Manual.** Compose a title and message, choose a topic and the page it opens, preview, confirm the audience size and send.
- **Controls.** A daily limit (default 3, manual and automatic together), topics on/off, the prompt text and delay.
- **Results.** Subscribers (total, per topic, new this week) and a history with delivered, failed and opened counts per send.
- **Privacy.** Subscribers are anonymous browsers (no name, email or account). Credits a *logged-in* client earns are pushed
  to that person in the app (Part 1), not through the website.
- **Safety.** Public endpoints exist only on website hosts and are rate limited; only real push-service addresses are
  accepted; links open pages of the site only.

---

## Demo data

One command fills a demo company with realistic data for every product. It is for demos and development.

```bash
# 1. Register the demo company at /signup
# 2. Fill it
npm run demo:seeders                        # when it is the only customer company
npm run demo:seeders -- --company <slug>    # when there are several
```

- **Scoped to one company.** Everything is written through the company-scoped database; other companies and the operator
  company are never read or changed. The operator company is refused.
- **Safe to re-run.** It replaces the previous demo rows instead of duplicating them. Your own Super Admin login stays.
- **All products:** HR and payroll, projects, CRM and offers, finance, procurement, training, team chat, SOPs, legal
  documents, Digi Locker, online tests, AI assistants, social media, SEO, website, portal and wallet, help and support.
  AI Intelligence answers from the same business data.
- **Logins.** The command prints the demo accounts per product at the end; they use `example.com` addresses and one shared
  demo password, also printed there. Do not use this on a real company.
- **Plan.** A product shows in the sidebar only if the company's plan includes it (Platform Console → Companies).
- **AI assistants** get conversations and files as metadata only unless `OPENAI_API_KEY` is set.

To start over, use a new empty database (change `MONGODB_URI`) and register the company again.

---

## Deploy to production (Vercel)

1. Import the repository into Vercel.
2. Make `selfrunbusiness.com` the project's **production domain** (and `www.selfrunbusiness.com`). Add the wildcard
   `*.selfrunbusiness.com` (covers every `<slug>` and `<slug>-app` address) so every company gets a working HTTPS address.
3. Add environment variables for **Production**:
   - `MONGODB_URI` (a new, empty database), `SAAS_ADMIN_EMAIL`, `SAAS_ADMIN_PASSWORD` (quoted)
   - `SAAS_HOSTS` and `PLATFORM_ROOT_DOMAIN` (both `selfrunbusiness.com`)
   - `PLATFORM_ENCRYPTION_KEY`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`
   - the feature keys you use
4. **Redeploy** after any variable change; the running deployment does not pick them up otherwise.
5. Open `https://www.selfrunbusiness.com`. The first start creates the operator and logs it. Check `/`, `/pricing` and
   `/signup`.
6. Add the domain `app.selfrunbusiness.com` to the project too, then sign in at `https://app.selfrunbusiness.com/workspace/login`
   as the staff account, open `/console`, and set up plans, prices and the Razorpay keys.
7. Register a test company and confirm both its website (`<slug>.selfrunbusiness.com`) and its products
   (`<slug>-app.selfrunbusiness.com`) work.

Notes:

- Use MongoDB Atlas with Vercel's IPs allow-listed.
- Cron jobs in `vercel.json` register automatically. Protect them with `CRON_SECRET`.
- Local files under `uploads/` are not persistent on serverless hosting. Use Vercel Blob.
- Customers connect their own domains in Workspace → Settings → Domains; TLS is issued automatically.

Full guide, including DNS, email and payments: [docs/deploy-vercel.md](./docs/deploy-vercel.md).

Moving production from Vercel to one low-cost AWS server (EC2, Docker, Caddy, self-hosted MongoDB, in-app scheduler, `.env` file), including the end-to-end migration of every customer, database, file, subdomain and custom domain, with the code changes it needs: [docs/deploy-aws.md](./docs/deploy-aws.md).

Self-hosting: `npm run build && npm start` (port 3000; set `PORT` to change), and schedule the cron endpoints.

---

## NPM scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run demo:seeders` | Fill a demo company with realistic data for every product |

`demo:seeders` loads `.env` automatically.

---

## Project structure

```
src/
  app/
    (platform)/        SaaS routes, Platform Console, sign-up and platform utilities
    (products)/        Product apps and branded product API routes
    (site)/            Customer public website (SelfRun Sites)
  components/
    platform/          Platform Console, SaaS marketing and shared platform UI
    products/          Product-specific components by branded slug
  lib/
    platform/          Tenancy, companies, billing, product registry, SaaS and domains
    products/          Product-specific server logic by branded slug
    …                  Shared application services
  instrumentation.ts   First-start operator setup
  proxy.ts             Request proxy (host routing and rewrites)
desktop/               Electron desktop app and per-company build script
mobile/                Android and iOS app build script (Capacitor)
scripts/
  demo-seeders.ts      The demo data command
  demo/                Demo data modules, one per product
  test-*.ts, e2e/      Verification scripts
public/selfrun/        Logo, mark and favicon
docs/                  Architecture, deployment and app build guides (build-apps.md)
```

---

**GitHub token for the Generate buttons.** `GITHUB_DISPATCH_TOKEN` must be able to start workflows: fine-grained token on the code repository with
**Actions: Read and write**, **Contents: Read-only**, **Metadata: Read-only** (or a classic token with `repo` + `workflow`). A 403
"Resource not accessible by personal access token" means it lacks that permission; see the troubleshooting table in
[docs/build-apps.md](docs/build-apps.md#13-how-a-company-gets-its-own-apps-the-generate-buttons).

## Security and compliance

Security policy and vulnerability reporting: [SECURITY.md](SECURITY.md). The compliance work (country-wise legal register, standards mapping, data
inventory, policies, gap assessment, release criteria) is in [docs/compliance/](docs/compliance/README.md). Checks: `npm run typecheck`,
`npm run security:scan`, `npm run security:audit`, `npm run test:password`, `npm run test:transport`. API requests and responses (and Server Actions) are sealed end to end: [docs/compliance/api-transport-encryption.md](docs/compliance/api-transport-encryption.md).

## Architecture notes

- **Identity.** Internal users have a `roles` array per product; external people sign in through the portal. Sessions are
  separate cookies per product, with single sign-on across the products a user has a role in. Platform staff have their own
  platform roles.
- **Plans and products.** The Product Registry lists every product with its name, route and on/off state; plans decide which
  products a company gets.
- **Audit fields.** Documents use string ids and shared fields (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`,
  `deletedAt` for soft delete).
- **No multi-document transactions.** Atomicity comes from single-document updates with guard filters.
- **Caching.** Company and CMS lookups are cached (up to an hour). After editing the database directly, restart the
  server and clear `.next` to see changes immediately.
- **Server/client split.** Files importing `server-only` must not be imported by client components.
- **Brand.** The product brand lives in `src/lib/platform/saas/brand.ts`; a customer's own wordmark is rendered by `brandify()` in
  `src/lib/brand.tsx` from its Branding settings.

More detail: [docs/architecture.md](./docs/architecture.md).

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Production site shows a 404 with a small monogram header | The host is not recognised as a SaaS host. Set `SAAS_HOSTS` and `PLATFORM_ROOT_DOMAIN`, make the domain the production domain, then redeploy |
| Staff cannot sign in | A `#` in an unquoted `SAAS_ADMIN_PASSWORD` truncates it. Quote the value and restart |
| `localhost:3000/console` redirects to `app.localhost:3000/console` | Expected: the Platform Console is never served on the website host. Sign in there as the staff account from `SAAS_ADMIN_EMAIL` |
| `E11000 duplicate key` on first start | Drop the new database and start again; the setup guards against the race |
| A page shows empty data after a direct database change | Restart the server and delete `.next` (cached lookups) |
| A product is missing from a company's sidebar | The company's plan does not include it (Platform Console → Companies → plan) |
| Bank details cannot be saved | Set the matching `*_ENCRYPTION_KEY` |
| Chatbot unavailable | Set `OPENAI_API_KEY`, then re-index from CRM → Chatbot |
| Calls connect only on the same network | Add a TURN server through the `MESSENGER_TURN_*` variables |
| Build fails with a missing `.next/server/*manifest` | Another process touched `.next` during the build; stop it and rebuild |
| `demo:seeders` cannot connect | Check `MONGODB_URI` and the Atlas IP allow-list |

---

## Contributing

- Read [AGENTS.md](./AGENTS.md); check `node_modules/next/dist/docs/` before writing framework code.
- Match the surrounding code: naming, comment density and UI patterns.
- When you add a module that shows data, add demo data for it in `scripts/demo/` and call it from
  `scripts/demo-seeders.ts`, so demos never show blank sections.
- Before shipping run `npm run lint` and `npm run build`, and check that the build's exit code is 0
  (`tsc --noEmit` alone is not a reliable gate here).
- Commit only source and docs. Never commit `.env`, uploaded files or credentials.
