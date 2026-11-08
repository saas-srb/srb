# Deploying SelfRun Business on Vercel: the complete step-by-step guide

This guide takes you from nothing to a live platform at **www.selfrunbusiness.com**, where every customer gets their own website
address and their own app address. Every step is broken into small actions (1.1, 1.2, …). After each group there is a
**✅ Checkpoint** that tells you exactly what you should see before you continue. If a checkpoint does not match, stop and use
the [Troubleshooting](#troubleshooting) table at the end.

Time needed: about 2 to 3 hours the first time (most of it waiting for DNS). Customers need none of this: they sign up on your
website and everything is created for them.

> [!IMPORTANT]
> **Two places hold settings, and each setting lives in exactly one of them.**
> - **Vercel environment variables** hold only the six values the app needs *before* it can read the database: `MONGODB_URI`,
>   `SAAS_ADMIN_EMAIL`, `SAAS_ADMIN_PASSWORD`, `PLATFORM_ENCRYPTION_KEY`, `SAAS_HOSTS` and `CRON_SECRET` (step 6).
> - **The Platform Console** holds everything else, section by section: email, domains, file storage, AI, voice and messaging,
>   push notifications, search and calls, payments, plans and more (step 11). Saving there needs **no redeploy**.
>
> Each company can also save its **own** keys under *Settings → Integrations*. A company's own key is used first; the platform's key
> from the Console is the fallback for companies that have not added one.

**How to read this guide**

| Mark | Meaning |
| --- | --- |
| **1.1**, **1.2** … | Micro-steps. Do them in order, one at a time |
| ⏱ | Time the step takes, whether it is required, and what you get from it |
| > ✅ **Checkpoint** | What you must see before you continue |
| > [!WARNING] | Something that can lose data or money if you ignore it |
| `code` | A value to type or copy exactly |


---

## Contents

0. [Understand the setup (read once)](#0-understand-the-setup-read-once)
1. [Collect your accounts and notes](#1-collect-your-accounts-and-notes)
2. [Create the database (MongoDB Atlas)](#2-create-the-database-mongodb-atlas)
3. [Create the file storage (Vercel Blob)](#3-create-the-file-storage-vercel-blob)
4. [Generate your secret keys](#4-generate-your-secret-keys)
5. [Create the Vercel project](#5-create-the-vercel-project)
6. [Add the environment variables](#6-add-the-environment-variables)
7. [Add your domains in Vercel](#7-add-your-domains-in-vercel)
8. [Point your DNS](#8-point-your-dns)
9. [Deploy and check the first start](#9-deploy-and-check-the-first-start)
10. [Set up email (Resend)](#10-set-up-email-resend)
11. [First sign-in and Platform Console setup](#11-first-sign-in-and-platform-console-setup)
12. [Test the whole flow](#12-test-the-whole-flow)
13. [Optional: payments (Razorpay)](#13-optional-payments-razorpay)
14. [Optional: customers' own domains](#14-optional-customers-own-domains)
15. [Optional: desktop and mobile apps](#15-optional-desktop-and-mobile-apps)
16. [Scheduled jobs](#16-scheduled-jobs-cron)
17. [Troubleshooting](#troubleshooting)
18. [Appendix: every variable at a glance](#appendix-every-variable-at-a-glance)

---

## The road map at a glance

| # | What you do | Time | Required? | You get |
| --- | --- | --- | --- | --- |
| 1 | Collect accounts and notes | 10 min | Yes | A notes file |
| 2 | MongoDB Atlas database | 15 min | Yes | `MONGODB_URI` |
| 3 | Vercel Blob storage | 5 min | Yes | `BLOB_READ_WRITE_TOKEN` (saved in the Console in step 11) |
| 4 | Generate secret keys | 10 min | Yes | 2 keys, push keys, staff login |
| 5 | Create the Vercel project | 5 min | Yes | A project |
| 6 | Add the 6 environment variables | 10 min | Yes | The app can start |
| 7 | Add 4 domains in Vercel | 10 min | Yes | Domains attached |
| 8 | Point DNS | 15 min + wait | Yes | HTTPS addresses |
| 9 | Deploy and check | 10 min | Yes | **Your live website** |
| 10 | Email (Resend) | 20 min | For sign-up emails | `RESEND_API_KEY` (saved in the Console in step 11) |
| 11 | First sign-in and Platform Console | 30 min | Yes | Every key and setting, section by section |
| 12 | Test the whole flow | 45 min | Recommended | Proof it works |
| 13 to 15 | Payments, customers' domains, desktop and mobile apps | 20 + 15 + 40 min | Optional | Extras |

> [!TIP]
> Steps 1 to 9 put the product website live. You can stop after step 9 and come back for the rest.

---

## 0. Understand the setup (read once)

⏱ *read only · 3 min*

Every company, including yours, has **two addresses**: one for its public **website** and one for its **products** (Workspace, HR,
Finance, the client portal and the rest). The website address shows only the website. The app address shows the enabled products.
Open a product URL on the website address and you are sent to the app address automatically.

| Who | Website address | app address |
| --- | --- | --- |
| SelfRun Business (you) | `selfrunbusiness.com` and `www.selfrunbusiness.com` (product website, `/signup`, `/login`) | `app.selfrunbusiness.com` (Platform Console for your staff) |
| A customer on an automatic address | `acme.selfrunbusiness.com` | `acme-app.selfrunbusiness.com` |
| A customer with its own domain | `acme.com` | `app.acme.com` |
| Any other address | "No workspace here" | |

Two settings drive this:

- `SAAS_HOSTS`: the website addresses of the product itself (`selfrunbusiness.com`). `app.selfrunbusiness.com` is derived from it.
- The **root domain**: the domain under which every company's automatic addresses live (`selfrunbusiness.com`). You do not set it in Vercel: on a Vercel production deployment it is worked out from the production domain you attach in step 7, and it can also be typed in *Console → Integrations → Domains & hosting* (step 11).

Words used below:

- **Vercel**: where the app runs.
- **MongoDB Atlas**: where the data lives.
- **DNS**: the settings at your domain provider that say which server a name points to.
- **Redeploy**: build and publish the app again. Required after changing any environment variable.

More background: [architecture.md](./architecture.md).

---

## 1. Collect your accounts and notes

⏱ *10 min · required · you get: an organised notes file*

Open a notes file (a password manager is best). You will paste values into it as you go. Do not share it.

- **1.1** Make sure you have these accounts. Create any that are missing now:

  | Account | Needed for | Required? |
  | --- | --- | --- |
  | Vercel (vercel.com) | Hosting | Yes |
  | GitHub, GitLab or Bitbucket, with this repository in it | Vercel deploys from it | Yes |
  | MongoDB Atlas (mongodb.com/atlas) | Database | Yes |
  | Your domain `selfrunbusiness.com`, and login to the place you bought it | Addresses | Yes |
  | Resend (resend.com) | Sign-up and notification emails | Yes for sign-up emails |
  | OpenAI (platform.openai.com) | AI features | Optional |
  | Razorpay | Charging companies for plans | Optional, can wait |

- **1.2** In your notes file create empty lines for the values you will collect:

  ```
  # Go in Vercel (step 6)
  MONGODB_URI            =
  PLATFORM_ENCRYPTION_KEY=
  CRON_SECRET            =
  SAAS_ADMIN_EMAIL       =
  SAAS_ADMIN_PASSWORD    =

  # Go in the Platform Console (step 11), not in Vercel
  BLOB_READ_WRITE_TOKEN  =
  VAPID_PUBLIC_KEY       =
  VAPID_PRIVATE_KEY      =
  RESEND_API_KEY         =
  OPENAI_API_KEY         =   (when you want AI)
  ```

> ✅ **Checkpoint:** you can sign in to Vercel, Atlas and your domain provider, and your notes file has the empty lines above.

---

## 2. Create the database (MongoDB Atlas)

⏱ *15 min · required · you get: `MONGODB_URI`*

Use a **new, empty** database. Never reuse a database from another product. On the first start the platform sets itself up.

- **2.1** Sign in to MongoDB Atlas. Create a project if you have none.

- **2.2** Create a cluster: **Create** (or *Build a Database*) → pick the free **M0** to start, or a paid tier for production → choose a
  region close to your Vercel region (for example Mumbai for India) → **Create**. Wait until the cluster shows as ready.

- **2.3** Create a database user: left menu **Database Access** → **Add New Database User**.
  - Authentication method: *Password*.
  - Username: for example `selfrun_app`.
  - Password: click *Autogenerate Secure Password*, then **copy it into your notes**. Prefer letters and numbers only; if it has
    special characters (`@ # / : ?`) you must URL-encode them in step 2.7 (for example `@` becomes `%40`).
  - Built-in role: *Read and write to any database*.
  - Click **Add User**.

- **2.4** Allow Vercel to connect: left menu **Network Access** → **Add IP Address** → **Allow access from anywhere**
  (`0.0.0.0/0`) → **Confirm**. Vercel does not use fixed IP addresses, so this is required.

- **2.5** Get the connection string: left menu **Database** → your cluster → **Connect** → **Drivers**. Copy the string. It looks like
  `mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority`.

- **2.6** Replace `<username>` and `<password>` with your real ones from step 2.3.

- **2.7** Add the **database name** just before the `?`: `...mongodb.net/selfrun?retryWrites=true&w=majority`. The final value looks like:

  ```
  mongodb+srv://selfrun_app:YourPassword@cluster0.abcde.mongodb.net/selfrun?retryWrites=true&w=majority
  ```

- **2.8** Paste it into your notes as `MONGODB_URI`.

> ✅ **Checkpoint:** `MONGODB_URI` ends with `/selfrun` followed by `?…`, has no `<` or `>` in it, and the Atlas **Network Access** page lists `0.0.0.0/0`.

> [!WARNING]
> Do not run this production database from your own computer. If your local `.env` points at it, `npm run dev` and
> `npm run demo:seeders` would write into production data. Use a separate database (for example `/selfrun_dev`) locally.

---

## 3. Create the file storage (Vercel Blob)

⏱ *5 min · required · you get: `BLOB_READ_WRITE_TOKEN`*

All uploads (logos, documents, chat attachments) go to Vercel Blob.

- **3.1** Sign in to Vercel → top menu **Storage** → **Create Database** → choose **Blob**.

- **3.2** Name it (for example `selfrun-files`). When asked for access, choose **Private**. This cannot be changed later.

- **3.3** Create it, then open the store → **Settings** (or the **.env.local** tab) and copy the **Read/Write token**.

- **3.4** Paste it into your notes as `BLOB_READ_WRITE_TOKEN`. It is saved in the Platform Console (*Integrations → File storage*, step 11.2), not in Vercel.

> ✅ **Checkpoint:** the token starts with `vercel_blob_rw_`.

---

## 4. Generate your secret keys

⏱ *10 min · required · you get: 2 secret keys, the push key pair, the staff login*

These protect sensitive data. You create them yourself, once.

- **4.1** Open a terminal on your computer (any folder).

- **4.2** Run this command **twice**. Each run prints a different random value. Copy each into your notes next to the name in the table:

  ```bash
  openssl rand -base64 32
  ```

  | Name in your notes | Protects |
  | --- | --- |
  | `PLATFORM_ENCRYPTION_KEY` | **The single encryption key** for everything sensitive: every key saved in the Platform Console or by a company, employee bank details, finance accounts, Digi Locker credentials, social tokens |
  | `CRON_SECRET` | The scheduled-job URLs (Vercel Cron sends it; without it every call is refused). Put the same value in the Console in step 11.2 |

  There is no other encryption key to create. Older guides listed separate HR, Finance, Digi Locker and Social keys: they are no longer used.

- **4.3** Generate the push-notification key pair (one command, prints two lines):

  ```bash
  npx web-push generate-vapid-keys
  ```

Copy **Public Key** into your notes as `VAPID_PUBLIC_KEY` and **Private Key** as `VAPID_PRIVATE_KEY`. You will paste them into the Platform Console in step 11, not into Vercel.

- **4.4** Decide the platform staff login and write it in your notes: `SAAS_ADMIN_EMAIL` (your email) and `SAAS_ADMIN_PASSWORD` (a strong password).

> ✅ **Checkpoint:** two random values, two VAPID values, and the admin email and password are all in your notes, and no two values are the same.

> [!WARNING]
> **Keep these keys forever.** If you lose or change `PLATFORM_ENCRYPTION_KEY`, everything it protected can no longer be read: saved
> keys, bank details and credentials. If you change the VAPID pair, every device must turn notifications on again. Use a different
> set for production than for local development.

---

## 5. Create the Vercel project

⏱ *5 min · required · you get: a Vercel project*

- **5.1** In Vercel click **Add New…** → **Project**.

- **5.2** Under *Import Git Repository* find this repository and click **Import**. (If it is not listed, click *Adjust GitHub App
  Permissions* and allow access to the repository.)

- **5.3** Leave *Framework Preset* as **Next.js** and the build settings as they are.

- **5.4** You can add the environment variables on this same screen (open **Environment Variables**), or deploy first and add them in step 6.
  Either way, the first deployment fails or shows an error page until the six variables of step 6 exist. That is expected.

- **5.5** Click **Deploy** if you are on the import screen. It may fail: that is fine, you will redeploy in step 9.

> ✅ **Checkpoint:** the project exists in Vercel and you can open its **Settings** tab.

---

## 6. Add the environment variables

⏱ *10 min · required · you get: the app able to start*

- **6.1** Vercel → your project → **Settings** → **Environment Variables**.

- **6.2** For each row below: type the **Key**, paste the **Value** (no quotes), tick **Production** (and Preview if you want), click **Save**.
  Repeat until every row is added.

> [!NOTE]
> In Vercel you type values **without quotes**. (Quotes are only for a local `.env` file, where a `#` or a space in a password
> would otherwise cut the value off.)

### 6A. The six variables (all required)

| Key | Value |
| --- | --- |
| `MONGODB_URI` | From step 2 |
| `SAAS_ADMIN_EMAIL` | Your staff email (step 4.4) |
| `SAAS_ADMIN_PASSWORD` | Your staff password (step 4.4) |
| `PLATFORM_ENCRYPTION_KEY` | From step 4.2 |
| `SAAS_HOSTS` | `selfrunbusiness.com` |
| `CRON_SECRET` | From step 4.2 |

That is everything the app needs to start. `PLATFORM_ENCRYPTION_KEY` has to stay here because it opens everything saved in the Console, so it cannot be saved there. `CRON_SECRET` has to be here because Vercel Cron can only send what is in the Vercel environment; the same value is also saved in the Console (11.2), which is what any other scheduler uses. **Do not add anything else here**: email, storage, AI, push, domains and payments are saved in the
Platform Console (step 11), where each has its own labelled section, and a key saved there needs no redeploy.

What you do **not** need to set any more:

- The company root domain: on a Vercel production deployment it is worked out from your production domain (7.2), and you can also type it in
  *Console → Integrations → Domains & hosting*.
- Separate HR, Finance, Digi Locker or Social encryption keys: `PLATFORM_ENCRYPTION_KEY` covers them all.
- The Razorpay billing webhook secret, `REQUIRE_PRIVILEGED_MFA` and `DEV_TUNNEL_HOST`: the first is saved in *Console → Payments & Razorpay*,
  the others no longer exist.

### 6B. Only if you choose DNS Option A (step 8)

| Key | Value |
| --- | --- |
| `PLATFORM_WILDCARD_SUBDOMAINS` | `1` (tells the app the project has the `*.selfrunbusiness.com` domain, so each new company's addresses need no per-company work) |

You add this one in step 8 (A.6), not now.

### 6C. Only if you build desktop and mobile apps (step 15)

`GITHUB_REPOSITORY`, `GITHUB_DISPATCH_TOKEN` and `DESKTOP_BUILD_SECRET` (plus the optional `DESKTOP_RELEASES_REPO`, `GITHUB_WORKFLOW_FILE`, `GITHUB_WORKFLOW_REF`).
These are the only other variables, because the build service is GitHub's, not the app's. You add them in step 15.

- **6.3** When all six rows are saved, scroll the list and tick them off against the table above.

> ✅ **Checkpoint:** the six keys are listed under **Production**, none has quotes around its value, and `SAAS_HOSTS` is exactly `selfrunbusiness.com`.

> [!IMPORTANT]
> **A change to an environment variable only takes effect after a redeploy.** Settings saved in the Platform Console do not need one.

---

## 7. Add your domains in Vercel

⏱ *10 min · required · you get: 4 domains attached to the project*

You add **four** domain names to the project. Do them one by one.

- **7.1** Vercel → your project → **Settings** → **Domains** → **Add**.

- **7.2** Type `www.selfrunbusiness.com` → **Add** → choose **Production** if asked. Then use the menu next to it to make it the **primary** domain.

- **7.3** Add `selfrunbusiness.com`. When Vercel offers it, choose **Redirect to** `www.selfrunbusiness.com`.

- **7.4** Add `app.selfrunbusiness.com`. No redirect. This is the address where **you and your staff** sign in to the Platform Console.

- **7.5** Add the wildcard `*.selfrunbusiness.com`. This one gives every company a working HTTPS address (`acme` and `acme-app`).
  If Vercel says a wildcard needs its nameservers, that is expected. You choose how to handle it in step 8.

- **7.6** Leave this page open. Vercel now shows **Invalid Configuration** next to each domain and tells you which DNS records it wants.

> ✅ **Checkpoint:** four domains are listed (`www`, the bare domain with a redirect, `app`, and `*`), all marked as needing DNS.

> [!TIP]
> `SAAS_HOSTS` (step 6) is the only thing that marks a host as the product's website, so it must be set. Customers' own domains attached to this project are never treated as the product's.

---

## 8. Point your DNS

⏱ *15 min of work, then waiting for DNS (minutes to 48 h) · required · you get: working HTTPS addresses*

Now tell the internet to send these names to Vercel. Pick **one** option.

### Which option?

- **Option A (recommended):** move your domain's DNS to Vercel. Every new company's address then works instantly with no
  per-company work. Takes the longest because nameservers must propagate.
- **Option B:** keep your current DNS provider. No nameserver change, but each new company's two addresses are attached through
  the Vercel API when it signs up (needs step 14), and a brand-new workspace can show a certificate warning for a few minutes.

### Option A: move DNS to Vercel (recommended)

- **A.1** At your domain provider, open the DNS records of `selfrunbusiness.com`. **Write down or screenshot every record** (A, CNAME,
  MX, TXT). Email stops working if you forget the MX and TXT records.

- **A.2** In Vercel → **Domains** → click `selfrunbusiness.com` → **DNS Records**. Re-create every record from A.1 here. Skip the A and
  CNAME records that point to the old host (Vercel manages the ones for this project).

- **A.3** At your domain provider, open **Nameservers** for `selfrunbusiness.com` and change them to custom nameservers:

  ```
  ns1.vercel-dns.com
  ns2.vercel-dns.com
  ```

If the provider refuses, first turn off DNSSEC for the domain, then try again.

- **A.4** Wait. This can take a few minutes to 48 hours (usually under an hour).

- **A.5** Back in Vercel → **Settings → Domains**: refresh until all four domains show **Valid Configuration**.

- **A.6** Add one more environment variable in Vercel: `PLATFORM_WILDCARD_SUBDOMAINS` = `1` (6B) → Save. You will redeploy in step 9.

### Option B: keep your DNS provider

- **B.1** At your DNS provider create these records (use the exact values Vercel shows on the Domains page if they differ):

  | Type | Name / Host | Value |
  | --- | --- | --- |
  | `CNAME` | `www` | `cname.vercel-dns.com` |
  | `CNAME` | `app` | `cname.vercel-dns.com` |
  | `CNAME` | `*` | `cname.vercel-dns.com` |
  | `A` | `@` (the bare domain) | `76.76.21.21` |

- **B.2** In the Name box most providers want only `www`, `app`, `*`, `@`, not the whole domain.

- **B.3** Do **not** set `PLATFORM_WILDCARD_SUBDOMAINS`. Instead finish [step 14](#14-optional-customers-own-domains) (the Vercel API token, saved in the
  Platform Console), so each new company's addresses are attached when it signs up.

- **B.4** Know the limits: every company uses **two** domains of your Vercel plan's domain limit, new workspaces can show a
  certificate warning for a short time, and an unknown name such as `nope.selfrunbusiness.com` shows a certificate error instead of "No workspace here".

> ✅ **Checkpoint (Option A):** all four domains show **Valid Configuration** in Vercel.
>
> ✅ **Checkpoint (Option B):** `www`, the bare domain, and `app` show **Valid Configuration**.

---

## 9. Deploy and check the first start

⏱ *10 min · required · you get: your live website and the first-start setup*

- **9.1** Vercel → **Deployments** → open the newest deployment → the three dots → **Redeploy** (or push any commit).

- **9.2** Wait until the status says **Ready** (a few minutes). If it says **Error**, open it and read the build log; the most common
  cause is a missing or misspelled variable from step 6.

- **9.3** Open **Logs** (or *Runtime Logs*) for the deployment and look for the line:

  ```
  [saas] Platform operator … created
  ```

This line means the first start created your operator company, your staff account and the list of products in the database.

- **9.4** Open `https://www.selfrunbusiness.com` in a private window.

- **9.5** Click through `/pricing` and `/signup`. They must open.

- **9.6** Open `https://www.selfrunbusiness.com/console`. It must **redirect** to `https://app.selfrunbusiness.com/console`.
  (products never open on the website address.)

- **9.7** Open `https://www.selfrunbusiness.com/api/notify/cron` in the browser. It must answer **401** (refused: it needs `CRON_SECRET`). That proves the scheduled jobs are protected.

> ✅ **Checkpoint:** the SelfRun Business website shows with a valid HTTPS padlock, the log line `[saas] Platform operator … created` exists, `/console` redirects to the `app.` address, and the cron URL answers 401.

> [!TIP]
> A 404 with a small monogram header on the main domain means the host is not recognised as a website host. Re-check
> `SAAS_HOSTS=selfrunbusiness.com` and that the domain is the project's production domain (7.2), then redeploy.

---

## 10. Set up email (Resend)

⏱ *20 min · required for sign-up emails · you get: `RESEND_API_KEY`*

Sign-up confirmation, "workspace ready", invitations, trial reminders and approvals are sent through Resend. You prepare the account here and
save the key in the Platform Console in step 11.2.

- **10.1** In Resend → **Domains** → **Add Domain** → `selfrunbusiness.com` → choose the region → **Add**.

- **10.2** Resend lists DNS records (SPF, DKIM and optionally DMARC). Add **every** one at the place where your DNS lives (Vercel DNS
  if you chose Option A, otherwise your domain provider).

- **10.3** Back in Resend click **Verify DNS Records**. Repeat after a few minutes until the status is **Verified**.

- **10.4** In Resend → **API Keys** → **Create API Key** (permission: *Sending access*) → copy it.

- **10.5** Paste it into your notes as `RESEND_API_KEY`. Do **not** add it to Vercel: it is saved in *Console → Integrations → Email* (11.2).

> ✅ **Checkpoint:** the domain shows **Verified** in Resend. (You will confirm email works in step 12.)

> [!NOTE]
> Until the email provider is saved in the Console, mail is only written to the logs. That is fine in development, never in production.
> A company can also send from its own address (*Settings → Sender email*) or use its own provider key (*Settings → Integrations*); if it does
> not, the platform's sender is used.

---

## 11. First sign-in and Platform Console setup

⏱ *30 min · required · you get: every key and setting saved, section by section*

- **11.1** Open `https://app.selfrunbusiness.com/workspace/login` (the **app** address, not `www`).

  Sign in with `SAAS_ADMIN_EMAIL` and `SAAS_ADMIN_PASSWORD`. If you did not set a password, use the temporary one printed once in the logs.
  Then open `/console` (the Platform Console).

- **11.2** **Console → Integrations.** This page keeps every provider key in clearly named sections. Each secret is stored encrypted with
  `PLATFORM_ENCRYPTION_KEY`, only its last four characters are ever shown again, and it takes effect immediately (no redeploy). Fill in, in this order:

  | Section | What to enter | Needed for |
  | --- | --- | --- |
  | **Email** | Provider `resend`, the `RESEND_API_KEY` from step 10, and the From address (`SelfRun Business <no-reply@selfrunbusiness.com>`) | Sign-up and notification emails |
  | **Domains & hosting** | Root domain `selfrunbusiness.com` (optional on a Vercel production deployment). Provider, token, project and team IDs only if you do step 14 | Company addresses, customers' own domains |
  | **File storage** | The `BLOB_READ_WRITE_TOKEN` from step 3 | Every upload and backup |
  | **Push notifications** | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and a contact address (step 4.3) | Notifications to installed apps and websites |
  | **AI** | The platform's OpenAI key | Chatbots, assistants, Intelligence, content generation (metered per plan) |
  | **Voice & messaging** | ElevenLabs key, Twilio SID, token and WhatsApp sender | Voice mode and WhatsApp |
  | **Search & calls** | PageSpeed key, Google service-account email and private key, TURN server | SEO audits, Messenger calls |
  | **Scheduled jobs** | Cron secret: press *Generate a strong value*, copy it, **put the same value in Vercel as `CRON_SECRET`**, then Save | Any scheduler that calls the job URLs (Vercel Cron, GitHub Actions, cron-job.org) |
  | **Email testing** | Leave empty. Only while testing: one inbox that receives every email instead of its real recipient | Testing before the email domain is verified |
  | **Upload safety check** | VirusTotal key (optional) | A second check on uploaded files |

  Leave any section empty that you do not use; the feature that needs it explains what is missing.

- **11.3** **Console → Payments & Razorpay.** Enter the Razorpay Key ID, Key Secret and webhook secret when you are ready (step 13).

- **11.4** **Console → Plans & pricing.** Review plans and prices, and which products each plan includes. Check the trial length and reminder days.

- **11.5** **Console → Platform settings.** Platform name, support details, seller details for invoices, and the **sign-up mode** (open, approval or closed).

- **11.6** **Console → Cron jobs.** Every scheduled job is listed with its next run. All should read **healthy** after their first run (step 16). *Run now* tests one immediately.

- **11.7** **Console → Notification center, Documents & PDFs and AI prompts.** Defaults are already on; review them once:
  - *Notification center*: every email, in-app and push event, switchable per channel for all companies (security and billing emails cannot be switched off).
  - *Documents & PDFs*: every PDF the system makes, with a sample in your letterhead; any kind can be switched off for everyone.
  - *AI prompts*: every instruction sent to an AI model. Leave them on their built-in text to start; change one only when you need to. Here you also decide whether companies may reword the prompts that allow it.

- **11.8** **Console → Support settings / Help content** (Support requests, Help content, Support settings) for the help centre and the assistant's articles, and **Maintenance** and **Incidents & status** when you need them.

> ✅ **Checkpoint:** you see the Platform Console dashboard on `app.selfrunbusiness.com`; Integrations shows **Email**, **File storage** and **Push notifications** as saved; and no section reports "cannot be decrypted".

> [!NOTE]
> If a section says its saved value "cannot be decrypted", `PLATFORM_ENCRYPTION_KEY` in Vercel is missing or was changed. Put the original back and redeploy.

---

## 12. Test the whole flow

⏱ *30 min · strongly recommended · you get: proof that everything works*

Do this once after the first deployment. Use a throwaway company.

- **12.1** **Sign-up.** Open `https://www.selfrunbusiness.com/signup`. The address field shows `.selfrunbusiness.com` next to it.

- **12.2** Fill in the form with a test company (slug for example `testco`) and pick at least one business category → **Create workspace**.

- **12.3** **Email.** The confirmation email arrives. Click its link. You land signed in at `https://testco-app.selfrunbusiness.com/workspace/onboarding`.

- **12.4** **Two addresses.**
  - `https://testco.selfrunbusiness.com` shows only the public website.
  - `https://testco.selfrunbusiness.com/workspace` redirects to `https://testco-app.selfrunbusiness.com/workspace`.
  - `https://testco-app.selfrunbusiness.com/` goes to the Workspace.
  - `https://nope.selfrunbusiness.com` shows "No workspace here".

- **12.5** **Isolation.** Register a second test company and confirm it shows none of the first company's data.

- **12.6** **App and push.** On a phone and a computer open `https://testco-app.selfrunbusiness.com` and install the app (Android and
  desktop: Install; iPhone/iPad: Share → Add to Home Screen). Open **Notifications → Settings** → **Turn on notifications** → **Send a test**.
  The website address `https://testco.selfrunbusiness.com` must show **no** install option.

- **12.7** **Website push.** In `testco`'s products open **CMS → Push notifications**, switch on *Website notifications*, save. On
  `https://testco.selfrunbusiness.com` a bell appears. Allow notifications, choose topics, then send one from the CMS page and check it arrives.

- **12.8** **Apps page.** In `testco`'s products open **Settings → Apps & downloads**. The PWA tab shows the address, QR code and previews. (The Mobile and Desktop tabs have a **Generate … App** button for each app; they build once step 15 is done.)

- **12.9** (Optional) Fill the test company with demo data: put the production `MONGODB_URI` in a local `.env` **only for this throwaway company** and run `npm run demo:seeders -- --company testco`. Never do this for a real company.

- **12.10** **Workspace settings.** In `testco`'s Workspace open **Settings** (Company settings) and check the new pages open: **Integrations**
  (sections for Email, AI & Voice, Payments and more; saving a company key there makes that company use its own key, and removing it falls back to yours),
  **Notification center** (the full list of emails, in-app and push messages; edit one and see the preview), **Documents & PDFs** (open a preview in the
  company's letterhead), **Scheduled jobs** (read-only list with times in the company's time zone) and **AI prompts** (editable prompts, plus the locked ones).

- **12.11** **Platform switches.** In the Console switch one notification channel and one PDF kind off, check `testco` shows them as turned off, then switch them back on.

- **12.12** **Trial end.** A company whose free trial has ended without a plan is locked: every page leads to **Subscribe to continue**, changes are refused, sign-in
  and *Plan & billing* still work, and nothing is deleted. After a plan is bought everything opens again. The trial cron (step 16) moves companies on when their trial ends.

> ✅ **Checkpoint:** every line of 12.1 to 12.8 behaves as described, and the pages in 12.10 open.

---

## 13. Optional: payments (Razorpay)

⏱ *20 min · optional · you get: paid plans*

This is how the platform charges companies for plans. It can wait until after launch; until then plans can be free or granted as complimentary.

- **13.1** In Razorpay → **Settings → API Keys** → generate a Key ID and Key Secret.

- **13.2** In your Platform Console → **Payments & Razorpay** → enter the Key ID and Key Secret → Save. They are stored encrypted. No environment variable is used.

- **13.3** In Razorpay → **Settings → Webhooks** → **Add New Webhook**:
  - URL: `https://www.selfrunbusiness.com/api/platform/billing/webhook`
  - Secret: choose a long random value and copy it.
  - Events: the subscription and payment events.

- **13.4** In the Platform Console → Payments & Razorpay, paste the same secret in **Webhook secret** and **Save keys**. No environment variable or redeploy is needed.

> ✅ **Checkpoint:** a test payment on a test company's **Plan & billing** page upgrades its plan.

A company that wants to collect payments from **its own customers** connects its own Razorpay account in Workspace → Settings → Payments; that page shows the company's webhook URLs.

---

## 14. Optional: customers' own domains

⏱ *15 min · optional · you get: customers' own domains*

This lets a company put its website on its own domain (for example `www.acme.com`, with its products on `app.acme.com`). The company does
the steps itself on its **Workspace → Settings → Custom domains** page, which has its own step-by-step guide. For it to work
(and for Option B in step 8) the platform must be able to attach domains to the Vercel project:

- **14.1** Vercel → your avatar → **Settings → Tokens** → **Create Token** (scope: the team that owns the project, no expiry or a long one). Copy it.

- **14.2** Project → **Settings → General** → copy the **Project ID**.

- **14.3** If the project belongs to a team, copy the **Team ID** (team **Settings → General**).

- **14.4** In the Platform Console → **Integrations → Domains & hosting** choose provider **Vercel** and save the token, the Project ID, and the Team ID if you use a team. No redeploy is needed.

- **14.5** Test: on the test company's **Custom domains** page add a domain you own. The page lists the exact DNS records to create. Create them at that domain's DNS, press **Check now**, and watch it become **Verified** with **SSL active**.

You can see every company's domains in Platform Console → **Domains & SSL**.

> [!NOTE]
> **Nothing has to be done by hand in the Vercel dashboard.** A custom domain brings two hosts to Vercel: the website (`www.acme.com`) and
> the app (`app.acme.com`). If Vercel asks for an ownership TXT record for either (it shows "Verification Required" on that host), the
> company's Domains page lists that exact record next to the others, under the domain. The company publishes **all** listed records once.
> After that, **Check now** and the daily automatic check verify both hosts through the Vercel API, and the page shows "products live at
> app.acme.com". The platform cannot write DNS records at the company's DNS provider by itself, so publishing the records is the one step that stays with the domain owner.

> ✅ **Checkpoint:** a test domain reaches **Verified** and **SSL active**, and `https://<that domain>` shows the company's website while `https://app.<that domain>` shows its products.

---

## 15. Optional: desktop and mobile apps

⏱ *40 min · optional · you get: Windows, macOS, Linux, Android and iOS apps that a company generates with one button each*

A company gets **Windows, macOS, Linux, Android and iOS** apps with its own name, icon and colours. **Nothing is built automatically**: a Super Admin
presses **Generate Android App**, **Generate iOS App**, **Generate Windows App**, **Generate macOS App** or **Generate Linux App** on **Settings → Apps**, and
only that app is built. The platform hands each build to a
**GitHub Actions workflow** (`.github/workflows/desktop.yml`), which builds the apps, publishes them to a public releases repository, and
reports the download links back. Set this up once:

- **15.1** **Releases repository.**
  1. GitHub → **New repository**.
  2. Name it for example `selfrun-app-releases`, set it to **Public** (so a company's people can download without a GitHub account), tick *Add a README*, **Create**.
     (It only ever holds installers with a company's name, icon and public app address.)

- **15.2** **A secret both sides share.** Run `openssl rand -base64 32` and save the result in your notes as `DESKTOP_BUILD_SECRET`.

- **15.3** **A token that can publish releases.**
  1. GitHub → your avatar → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
  2. Resource owner: you or your organisation. Repository access: **Only select repositories** → the releases repository.
  3. Permissions → Repository permissions → **Contents: Read and write**.
  4. Generate, copy it into your notes as `RELEASES_TOKEN`.

- **15.4** **A token that can start builds.**
  1. Same place, **Generate new token**. Repository access: only **this code repository**.
  2. Permissions → Repository permissions → **Actions: Read and write**.
  3. Generate, copy it into your notes as `GITHUB_DISPATCH_TOKEN`.

- **15.5** **Settings in the code repository** (GitHub → code repository → **Settings → Secrets and variables → Actions**):
  1. **Secrets** tab → *New repository secret*: `DESKTOP_BUILD_SECRET` (from 15.2).
  2. *New repository secret*: `RELEASES_TOKEN` (from 15.3).
  3. **Variables** tab → *New repository variable*: `DESKTOP_RELEASES_REPO` = `your-org/selfrun-app-releases`.

- **15.6** **Settings in Vercel** (Production). These are the only variables beyond the six in step 6, because the build service is GitHub's:
  - `GITHUB_REPOSITORY` = `your-org/your-code-repo`
  - `GITHUB_DISPATCH_TOKEN` = from 15.4
  - `DESKTOP_BUILD_SECRET` = from 15.2 (the **same** value as in GitHub)
  - optional `DESKTOP_RELEASES_REPO` = `your-org/selfrun-app-releases` (then only links from that repository are accepted)
  - optional `GITHUB_WORKFLOW_FILE` (default `desktop.yml`) and `GITHUB_WORKFLOW_REF` (default `main`)

Then **redeploy**.

- **15.7** **Test.** Open a test company's **Apps & downloads** page and press **Generate Windows App** (or any other platform's button) on the Desktop or Mobile tab. Nothing builds until you press one. The page
  shows **Building**, and 10 to 20 minutes later download buttons appear. In GitHub → **Actions** you can watch the run.

> ✅ **Checkpoint:** the run in GitHub Actions is green, the releases repository has a new release with the files, and the company's Apps page shows **Ready**.

Until 15.6 is done, builds wait in the queue ("Waiting for the build service") and start by themselves once it is. Good to know:
- Costs: GitHub Actions minutes (macOS minutes cost more). A build runs only when a Super Admin presses a Generate button; nothing starts by itself.
- The installers are not code-signed until you add certificates, so macOS and Windows show a warning the first time they are opened. The Android APK is debug-signed (install once allows "unknown apps"); iPhone apps are delivered as an Xcode project the company signs with its own Apple account.

---

## 16. Scheduled jobs (cron)

⏱ *read only · nothing to set up*

`vercel.json` registers 12 jobs, all daily, so it fits Vercel's Hobby plan. They start automatically after deployment and are protected by `CRON_SECRET` (without it every call is refused). The list lives in one place, `src/lib/cron/registry.ts`; `vercel.json` is generated from it (`npm run cron:sync`) and `npm run test:cron` fails if the two, or the routes on disk, ever disagree.

| Job | Time (UTC) | Does |
| --- | --- | --- |
| `/api/backup/cron` | 01:30 | Backups & data lifecycle: Makes the weekly backup for each company that is due, removes old backups, and deletes the companies whose 30-day deletion period has ended. |
| `/api/wallet/expiry-sweep` | 02:30 | Wallet expiry: Expires reward credits that have passed their date and warns people whose credits are about to expire. |
| `/api/playbook-ai/cron` | 03:00 | Procedure reminders: Moves procedures through their date-driven statuses (review due, expired) and sends acknowledgement reminders. |
| `/api/rankmax-ai/cron` | 03:30 | SEO housekeeping: Syncs Search Console and Analytics, runs the scheduled website audit, re-checks backlinks on Mondays and flags big ranking drops, for the companies that turned those on. |
| `/api/cybervault/cron` | 04:00 | Vault expiry alerts: Tells the vault's owners about credentials and documents that have expired or are about to. |
| `/api/viralpulse-ai/publisher/cron` | every 5 min | Scheduled posts: publishes approved scheduled posts that are due (DB leases, retries with backoff, resumes partly finished publishes), checks media the platforms are still processing, reminds publishers about due posts nobody approved and ads due to go live. |
| `/api/evaliq/cron` | 05:00 | Test deadlines: Finishes timed-out test attempts, expires missed assignments, sends opens-soon / due-soon / expired notices and releases results after a test closes. |
| `/api/platform/domains/cron` | 05:30 | Custom domain re-check: Re-checks every company's pending custom domains so they go live as soon as their DNS is right. |
| `/api/platform/billing/trials/cron` | 06:00 | Trial reminders & expiry: Emails trial reminders at the platform's reminder days and moves ended trials on (the workspace locks until a plan is subscribed). |
| `/api/platform/billing/subscriptions/cron` | 06:00 | Subscription renewals & dunning: Moves past-due subscriptions through grace to suspended, handles missed renewals and closes expired trials. |
| `/api/notify/cron` | 06:15 | Time-based notifications: Overdue invoices, stale leads, expiring documents, ending offers and HR, project, procurement and training deadlines: tells people even if nobody opened the product. |
| `/api/apps/builds/cron` | 07:00 | App builds: Hands over desktop-app builds that were requested while no build service was connected, and fails builds that never finished. It never starts a build by itself. |

**Watching them.** Platform Console → **Cron jobs** shows every job with its next run, its last run, what it did and whether it ran when it was due (healthy, overdue, failing). Each run is kept for 30 days. A Platform Console user with *Change platform settings* can press **Run now**. Two runs of the same job never overlap (a lock in the database), so a late or doubled call is harmless.

**Plan.** Vercel's Hobby plan only accepts daily schedules, and every job here is daily. Announcements a company scheduled are sent the moment anyone opens the workspace and by the daily *Time-based notifications* job; for minute-accurate sending, run the in-app scheduler (`RUN_SCHEDULER=1`, not on Vercel).

To confirm they are registered: Vercel → project → **Settings → Cron Jobs**. (Not on Vercel? Set `RUN_SCHEDULER=1` on exactly one instance and the app runs the same list itself; see [deploy-aws.md](./deploy-aws.md).)

---

## Go-live checklist

Tick these before you tell customers the platform is open.

- [ ] The website opens on `https://www.selfrunbusiness.com` with a padlock, and `/signup` works
- [ ] `https://app.selfrunbusiness.com/workspace/login` lets your staff in, and `/console` opens
- [ ] A test company can sign up, receive the confirmation email and land on its own `<slug>-app` address
- [ ] `https://<slug>.selfrunbusiness.com` shows only the website; `<slug>-app` shows only the products
- [ ] Two test companies cannot see each other's data
- [ ] Plans and prices are set in the Platform Console; sign-up mode is what you want (open, approval or closed)
- [ ] Email arrives from `no-reply@selfrunbusiness.com`
- [ ] A phone installed the app and received a test notification
- [ ] Console → Integrations shows Email, File storage and Push notifications as saved, with no "cannot be decrypted" warning
- [ ] Console → Cron jobs lists every job as healthy (or not yet due), and the cron URLs answer 401 without `CRON_SECRET`
- [ ] A test company's Settings pages open: Integrations, Notification center, Documents & PDFs, Scheduled jobs, AI prompts
- [ ] A test company whose trial has ended is sent to **Subscribe to continue** and gets access back after subscribing
- [ ] Only the six variables of step 6 (plus `PLATFORM_WILDCARD_SUBDOMAINS` for Option A) are set in Vercel
- [ ] `PLATFORM_ENCRYPTION_KEY`, `CRON_SECRET` and `MONGODB_URI` are saved in a password manager (and nowhere else)
- [ ] Atlas backups are on, and the Atlas and Vercel accounts use two-factor sign-in
- [ ] (Optional) A Razorpay test payment upgraded a plan
- [ ] (Optional) The Apps page of a test company shows Ready download buttons

---

## Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| 404 with a small monogram header on the main domain | The host is not a website host. Set `SAAS_HOSTS=selfrunbusiness.com`, make the domain the production domain (7.2), redeploy |
| Build fails in Vercel | Read the build log. Usually a missing or misspelled variable from the six in 6A |
| Staff cannot sign in | Sign in at `https://app.selfrunbusiness.com/workspace/login` (not `www`). Check `SAAS_ADMIN_EMAIL` and `SAAS_ADMIN_PASSWORD` for typos (no quotes in Vercel), fix and redeploy |
| No `[saas] Platform operator … created` in the logs | `SAAS_ADMIN_EMAIL` or `MONGODB_URI` is missing or wrong. Check them and redeploy |
| `MongoServerSelectionError` or timeout in the logs | Atlas Network Access does not allow Vercel: add `0.0.0.0/0` (2.4). Or the password in `MONGODB_URI` has special characters that must be URL-encoded |
| `E11000 duplicate key` in the first-start logs | A race on the very first start. Redeploy once; if it persists, use a fresh empty database |
| Company address shows `localhost` | The root domain is not known. Make `selfrunbusiness.com` the production domain (7.2), or type it in Console → Integrations → Domains & hosting |
| `app.selfrunbusiness.com` shows a certificate error or "not found" | Add `app.selfrunbusiness.com` to the project (7.4) and, for Option B, its DNS record |
| "No workspace here" on `<slug>.selfrunbusiness.com` | The company is suspended (Platform Console → Companies), the slug is wrong, or the wildcard domain is missing |
| Certificate error on a new company address | The wildcard is not active yet (step 8), or with Option B the address was not attached yet (step 14) |
| Sign-up email never arrives | Console → Integrations → Email has no provider or key saved, the Resend domain is not verified, or the From address is on another domain (steps 10 and 11.2) |
| Uploads fail | The Blob token is not saved in Console → Integrations → File storage, or the Blob store is not private |
| Bank details or a saved key cannot be saved or read | `PLATFORM_ENCRYPTION_KEY` is missing or was changed. Restore the original and redeploy |
| Console says a saved value "cannot be decrypted" | Same cause: `PLATFORM_ENCRYPTION_KEY` differs from the one used when it was saved. Restore it, or re-enter the value |
| AI features say they are unavailable | No OpenAI key in Console → Integrations → AI, and the company has not saved its own (Settings → Integrations) |
| Push notifications "not enabled on this server" | The VAPID keys are not saved in Console → Integrations → Push notifications (11.2) |
| A whole company sees "Subscribe to continue" | Its free trial ended without a plan. It opens again as soon as a plan is subscribed under Plan & billing |
| A cron job shows overdue or failing in Console → Cron jobs | Open the job for its last error; check `CRON_SECRET` is set; press *Run now* to retry |
| Scheduled announcements go out late | The every-5-minutes job needs Vercel Pro (step 16) |
| An AI prompt change does nothing | It applies within seconds, but a company's own wording wins for that company, and a prompt switched off for companies uses the standard text |
| Apps page says "Waiting for the platform's build service" | The three GitHub variables of step 15.6 are not set yet |
| A build fails | Open the **Build log** link on the Apps page (GitHub Actions run). Check the repository secrets and variables in 15.5 |
| Header or menu changes show late | Public navigation is cached for up to an hour; publishing in the CMS or redeploying refreshes it |
| Changes to a variable do nothing | Variables apply only after a redeploy |

---

## About the Free (Hobby) plan

**This platform does not fit Vercel's Hobby plan.** Hobby accepts at most 12 serverless functions in one deployment
(*"No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan"*). Vercel turns every API route and every server-rendered
page into function code, and this application has over 900 of them (about 230 API routes and 690 pages, across the website, the Platform Console and
every product). No setting or code change can bring that under 12; a deploy on Hobby will always stop with that message. Choose one of:

- **Vercel Pro** (a team): the function limit is far higher, and it also allows faster cron schedules. Everything in this guide then works as written.
- **Your own server or AWS**: run the same app with `next start` and the in-app scheduler (`RUN_SCHEDULER=1`). There is no function limit. Follow [deploy-aws.md](./deploy-aws.md).

Separately, Hobby is meant for personal, non-commercial projects, and a SaaS that bills customers normally belongs on Pro (check Vercel's current terms).
Hobby also allows only **daily** cron schedules (the 12 jobs in step 16 are all daily, so that part fits) and has lower limits on function duration, domains and team members.

---

## Appendix: every variable at a glance

### Vercel environment variables

| Key | Required? | Where it comes from |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Step 2 |
| `SAAS_ADMIN_EMAIL`, `SAAS_ADMIN_PASSWORD` | Yes | Step 4.4 |
| `PLATFORM_ENCRYPTION_KEY` | Yes | Step 4.2 (the single encryption key) |
| `SAAS_HOSTS` | Yes | `selfrunbusiness.com` |
| `CRON_SECRET` | Yes on Vercel (Vercel Cron can only send what is in its environment); also saved in the Console | Step 4.2 |
| `PLATFORM_WILDCARD_SUBDOMAINS` (`1`) | Only for DNS Option A | Step 8 A.6 |
| `GITHUB_REPOSITORY`, `GITHUB_DISPATCH_TOKEN`, `DESKTOP_BUILD_SECRET` | Only for the Generate buttons | Step 15 |
| `DESKTOP_RELEASES_REPO`, `GITHUB_WORKFLOW_FILE`, `GITHUB_WORKFLOW_REF` | Optional | Step 15 |

### Saved in the Platform Console (no environment variable, no redeploy)

| Where in the Console | What | Step |
| --- | --- | --- |
| Integrations → Email | Provider, Resend API key, From address | 10, 11.2 |
| Integrations → Domains & hosting | Root domain; Vercel token, project and team IDs | 11.2, 14 |
| Integrations → File storage | Blob read/write token | 3, 11.2 |
| Integrations → Push notifications | VAPID public and private key, contact | 4.3, 11.2 |
| Integrations → AI | The platform's OpenAI key | 11.2 |
| Integrations → Voice & messaging | ElevenLabs, Twilio SID, token, WhatsApp sender | 11.2 |
| Integrations → Search & calls | PageSpeed key, Google service account, TURN server | 11.2 |
| Integrations → Scheduled jobs | Cron secret (same value as the `CRON_SECRET` environment variable on Vercel) | 4.2, 11.2 |
| Integrations → Email testing | Test inbox that receives all email (testing only; leave empty in normal use) | 11.2 |
| Integrations → Upload safety check | VirusTotal key (optional) | 11.2 |
| Payments & Razorpay | Key ID, Key Secret, billing webhook secret | 13 |
| Plans & pricing, Platform settings | Plans, prices, trial, sign-up mode, seller details | 11.4, 11.5 |

### Saved by each company (Workspace → Settings)

A company can save its **own** keys under *Integrations*, *Sender email* and *Payment account*. Its own key is always used first; the platform's key above is the
fallback. Keys are stored encrypted, belong to that company alone and are never shown again in full.
