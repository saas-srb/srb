# Moving SelfRun Business from Vercel to AWS: the lean, low-cost, end-to-end guide

This guide moves the **live production platform, with every customer, every database record, every file, every automatic
subdomain and every customer-owned domain**, from Vercel to **one small AWS server**, using as few paid services as possible.

> [!IMPORTANT]
> **The design in one sentence:** one EC2 server runs four Docker containers — **Caddy** (HTTPS and every domain, automatically),
> the **app**, **MongoDB**, and a **backup** job — and everything the app used to rent as a service is done by code or by those
> containers instead.

| What used to be a service | What replaces it here | Extra service bill |
| --- | --- | --- |
| Vercel hosting | The app in a Docker container on EC2 | EC2 only |
| MongoDB Atlas | **MongoDB in a container** on the same server, with daily backups | none |
| Vercel Blob (file storage) | **A folder on the server's disk** (the code goes back to plain files) | none |
| Vercel Cron | **The scheduler inside the app** (runs the same jobs at the same times; `RUN_SCHEDULER=1`) | none |
| Vercel domains + TLS for customers' own domains | **Caddy** gets and renews free HTTPS certificates for any customer domain by itself | none |
| Secrets Manager / Parameter Store | **One `.env` file on the server** (permissions `600`) | none |
| ALB, NAT gateway, ECS, ECR | **Not used** (they cost more than the app itself) | none |
| Resend | **Amazon SES** (email cannot be self-hosted safely; SES is pay-per-email) | cents |

The few paid AWS items are: the **server**, its **disk**, a fixed **IP address**, **Route 53** DNS (for the wildcard certificate and
`*.selfrunbusiness.com`), **S3** for off-server backups (pennies), and **SES** for email. See [Part 0.3](#03-what-it-costs).

Every step is small and numbered. After each part there is a **✅ Checkpoint**. If it does not match, stop and use
[Troubleshooting](#troubleshooting).

Time needed: about **2 days** of work (one day for the code changes and the server, one day for the data move and rehearsals),
then a **short cut-over window** and a **few weeks** while customers re-point their own domains.

**How to read this guide**

| Mark | Meaning |
| --- | --- |
| **1.1**, **1.2** … | Micro-steps. Do them in order |
| ⏱ | Time the step takes |
| > ✅ **Checkpoint** | What you must see before you continue |
| > [!WARNING] | Something that can lose data if ignored |
| `<like-this>` | A value you replace with your own |

---

## Contents

0. [Understand the move (read once)](#0-understand-the-move-read-once)
- [Part A: the code changes (about half a day)](#part-a-the-code-changes-about-half-a-day)
1. [Prepare](#1-prepare)
2. [Create the server](#2-create-the-server)
3. [DNS (Route 53)](#3-dns-route-53)
4. [Install Docker and lay out the server](#4-install-docker-and-lay-out-the-server)
5. [The `.env` file (your settings and keys)](#5-the-env-file-your-settings-and-keys)
6. [MongoDB, backups and restore](#6-mongodb-backups-and-restore)
7. [Caddy: HTTPS for every domain](#7-caddy-https-for-every-domain)
8. [Build and deploy the app (GitHub Actions)](#8-build-and-deploy-the-app-github-actions)
9. [Email (SES)](#9-email-ses)
10. [First start and tests on the new server](#10-first-start-and-tests-on-the-new-server)
11. [Inventory: everything that must be migrated](#11-inventory-everything-that-must-be-migrated)
12. [The migration plan (zero lost data, short downtime)](#12-the-migration-plan-zero-lost-data-short-downtime)
13. [Step by step: the data rehearsal](#13-step-by-step-the-data-rehearsal)
14. [Step by step: cut-over day](#14-step-by-step-cut-over-day)
15. [Customers' own domains: the bridge and the hand-over](#15-customers-own-domains-the-bridge-and-the-hand-over)
16. [After the move: monitoring, updates and growth](#16-after-the-move-monitoring-updates-and-growth)
17. [Rollback plan](#17-rollback-plan)
18. [Decommission Vercel and Atlas](#18-decommission-vercel-and-atlas)
- [Troubleshooting](#troubleshooting)
- [Appendix A: every environment variable](#appendix-a-every-environment-variable)
- [Appendix B: files you will touch or create](#appendix-b-files-you-will-touch-or-create)

---

## 0. Understand the move (read once)

⏱ *read only · 6 min*

### 0.1 The picture

```
  Anyone (visitors, companies, customers' people)
        │  selfrunbusiness.com · acme.selfrunbusiness.com · acme-app.… · app.acme.com (a customer's own domain)
        ▼
  Route 53 ── our domains ──►  ┐
  Customer's own DNS ────────► ┘  one fixed IP address (Elastic IP)
        ▼
 ┌────────────────────────── ONE EC2 SERVER ──────────────────────────┐
 │  Caddy      :80 :443   automatic HTTPS, wildcard + on-demand certs  │
 │     │                                                               │
 │  app (Next.js, port 3000)  ── scheduler inside (the scheduled jobs) │
 │     │            │                                                  │
 │  MongoDB      /data/uploads  (files on the disk)                    │
 │  backup job ── nightly dump ──► disk + S3 (off-server copy)         │
 └────────────────────────────────────────────────────────────────────┘
   EBS snapshots (daily, automatic) ·  SES sends email
```

### 0.2 What does not change

The app finds a company by the **`Host` header** (`src/proxy.ts`, `SAAS_HOSTS`, `PLATFORM_ROOT_DOMAIN`, `company_domains` in the database). Caddy
passes the original host unchanged, so **every company address keeps working with no data change**. All data of all companies lives in **one
MongoDB database** (rows are scoped by company), so moving "every customer" means moving **one database and one folder of files**.

### 0.3 What it costs

> These are **rough, order-of-magnitude figures for one region** (prices differ by region and change). Check them in the **AWS Pricing
> Calculator** before you buy anything. The point is the *shape*: one server instead of a dozen billed pieces.

| Item | Size to start | Roughly per month |
| --- | --- | --- |
| EC2 server | `t3.medium` (2 vCPU, 4 GB) | tens of dollars; less with a 1-year Savings Plan later |
| Disk (EBS gp3) | 60 GB (more when files grow) | a few dollars |
| Daily disk snapshots | 7 kept | a few dollars |
| Fixed public IP (Elastic IP) | 1 | a few dollars |
| Route 53 | 1 hosted zone | about half a dollar, plus tiny query charges |
| S3 backups | database dumps only | about a dollar |
| SES email | per email | cents per thousand emails |
| Data transfer out | first 100 GB a month is free | usually nothing |

By comparison, an ALB + Fargate + NAT gateway + managed database setup runs several times this before it serves a single request. You
**start small and scale the one server up** (Part 16.4) when the numbers say so.

### 0.4 What you give up (be aware)

- **One server = one point of failure.** If it is rebooted or fails, the platform is down until it is back (minutes). The protection is: automatic
  disk snapshots, nightly off-server backups, an alarm that **auto-recovers** the instance, and a **rebuild script** (Part 16.3). For most small platforms this is
  the right trade for the cost; the moment downtime costs you more than a second server, see Part 16.4.
- **You run MongoDB yourself:** updates, backups and restore tests are your job (this guide gives the exact commands).
- **Releases** restart the app for a few seconds (the containers are replaced). Do them at quiet times.

### 0.5 Words used below

- **EC2**: a virtual server. **EBS**: its disk. **Elastic IP**: a public address that stays yours.
- **Docker / Docker Compose**: runs the four containers described in one file.
- **Caddy**: a web server that gets and renews free HTTPS certificates automatically.
- **DNS**: the settings that say which server a name points to. **TTL**: how long others remember them.
- **Bridge**: a temporary forwarder (Part 15) that keeps customers' own domains working during the move.

---

## Part A: the code changes (about half a day)

⏱ *required · do them on a branch called `aws`; production stays on Vercel until the cut-over*

The app was built for Vercel in a few places. These changes remove them and add the small pieces that replace paid services. Nothing else in the
product changes.

### A.1 Files: Vercel Blob → the server's disk (required)

Before Vercel, the app wrote files to a folder. Go back to that: **one folder on the EBS disk**, mounted into the container as `/data/uploads`.

**Files to change**

| File | Change |
| --- | --- |
| `src/lib/storage/blob.ts` | Replace the body with the disk version below (same three function names, same results) |
| `src/lib/products/sitecraft-ai/media.ts`, `src/lib/products/viralpulse-ai/media.ts` | Replace `head(pathname)` from `@vercel/blob` with `statObject(pathname)` below |
| `src/app/(products)/api/sitecraft-ai/media/upload/route.ts`, `src/app/(products)/api/viralpulse-ai/media/upload/route.ts` | Accept the file in the request itself (multipart) instead of issuing a Blob token |
| `src/lib/useCmsMediaUpload.ts`, `src/components/products/viralpulse-ai/useMediaUpload.ts` | `POST` the file to that route instead of calling Blob's `upload()` |
| `package.json` | Remove `@vercel/blob` |

**The new `src/lib/storage/blob.ts`:**

```ts
import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { assertStorageAvailable, meterStorage } from "@/lib/platform/billing/enforce";

/** Files live on the server's disk: UPLOAD_DIR (default /data/uploads). A key like "resumes/<uuid>.pdf" is a path under it. */
const ROOT = path.resolve(process.env.UPLOAD_DIR || "/data/uploads");

export interface PutResult { storageKey: string; contentType: string; size: number }
export interface GetResult { stream: ReadableStream<Uint8Array>; contentType: string }

/** Never let a key leave the uploads folder ("../" and absolute paths are refused). */
function safePath(storageKey: string): string {
  const p = path.resolve(ROOT, storageKey);
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key");
  return p;
}

export async function putObject(folder: string, filename: string, body: Buffer, contentType?: string): Promise<PutResult> {
  const storageKey = `${folder}/${filename}`;
  const resolved = contentType || "application/octet-stream";
  await assertStorageAvailable(body.byteLength);
  const file = safePath(storageKey);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body, { mode: 0o640 });
  await writeFile(file + ".type", resolved);                      // the content type, kept beside the file
  await meterStorage(body.byteLength);
  return { storageKey, contentType: resolved, size: body.byteLength };
}

/** null for a clean "not found"; anything else throws. */
export async function getObject(storageKey: string): Promise<GetResult | null> {
  const file = safePath(storageKey);
  try { await stat(file); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  const contentType = await readFile(file + ".type", "utf8").catch(() => "application/octet-stream");
  return { stream: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, contentType };
}

export async function deleteObject(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;
  const file = safePath(storageKey);
  const size = await stat(file).then((s) => s.size, () => 0);
  let deleted = true;
  await rm(file, { force: true }).catch(() => { deleted = false; });
  await rm(file + ".type", { force: true }).catch(() => {});
  if (deleted && size > 0) await meterStorage(-size);
}

/** Size and content type of a stored file (replaces Blob's head()). */
export async function statObject(storageKey: string): Promise<{ size: number; contentType: string }> {
  const file = safePath(storageKey);
  const [s, contentType] = await Promise.all([stat(file), readFile(file + ".type", "utf8").catch(() => "application/octet-stream")]);
  return { size: s.size, contentType };
}
```

**The upload routes.** On Vercel a request body is limited to a few MB, which is why uploads went straight to Blob. On your own server there is
no such limit, so the browser can send the file to the app: in each `upload/route.ts` keep the existing sign-in check and the plan-limit
check, then `const form = await req.formData(); const file = form.get("file") as File; await putObject(folder, name, Buffer.from(await file.arrayBuffer()), file.type)`,
store the record in MongoDB exactly as today, and return the same JSON the page already expects. In the two upload hooks replace `upload(...)`
with `fetch("/api/sitecraft-ai/media/upload", { method: "POST", body: formData })` (use `XMLHttpRequest` if you want a progress bar).

> [!WARNING]
> Files are private (HR documents, resumes, finance). They must stay behind the app's authenticated routes. The uploads folder is **never** served directly by Caddy.

### A.2 Scheduled jobs: Vercel Cron → the scheduler inside the app (required)

The app already contains the scheduler (`src/lib/cron/scheduler.ts`, started from `src/instrumentation.ts`). It reads the same list as `vercel.json` (`src/lib/cron/registry.ts`, UTC), checks every 20 seconds which jobs are due and runs them in the app: no HTTP call, no secret. Turn it on with one setting on **exactly one** app container:

```
RUN_SCHEDULER=1
```

That is all. Every run is recorded and a lock stops two runs of one job overlapping, so a second container with the scheduler on (or Vercel Cron still active) cannot run a job twice at once; it is still wasteful, so keep it to one. Watch the jobs in Platform Console → **Cron jobs** (next run, last run, healthy / overdue / failing, **Run now**). The page says "Started by: The in-app scheduler" when it is on.

The jobs run on the schedule in the registry; the every-5-minutes *Scheduled announcements* job has no plan limit here (that limit is Vercel Hobby's). If you would rather drive them from the host's own cron, each job is also a URL: `curl -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/<job path>` (paths are in the registry and in section 16 of the Vercel guide).

### A.3 Let Caddy ask the app which domains are real (required for customers' own domains)

Caddy issues a certificate for a customer domain **only if the app says that domain belongs to a company**. Add `src/app/api/internal/tls-ask/route.ts`:

```ts
import { resolveHostInfo } from "@/lib/platform/tenancy/companies";

export const dynamic = "force-dynamic";

/** Called by Caddy (inside the server) before it gets a certificate: 200 = this host belongs to a company or to the product. */
export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain")?.toLowerCase() ?? "";
  if (!domain) return new Response(null, { status: 400 });
  const info = await resolveHostInfo(domain).catch(() => null);
  return new Response(null, { status: info ? 200 : 404 });
}
```

Caddy blocks this path from the internet (Part 7), so only Caddy inside the server can use it.

### A.4 Health endpoint, standalone build (required)

1. `next.config.ts`: add `output: "standalone"` at the top level of the config. Keep everything else.
2. `npm i sharp` (fast image optimisation in the container).
3. Add `src/app/api/health/route.ts`:

   ```ts
   export const dynamic = "force-dynamic";
   export function GET() { return Response.json({ ok: true }); }
   ```

### A.5 Email: add SES (required if you use SES; skip if you keep Resend)

`EMAIL_PROVIDERS` in `src/lib/platform/integrations/resolve.ts` is `["resend", "console"]`. The repository already has an SMTP sender (`src/lib/platform/email/smtp.ts`) and SES has an SMTP endpoint:

1. Add `"ses"` to `EMAIL_PROVIDERS`.
2. Where the `resend` provider is created, create the `ses` one: `createSmtpEmailProvider({ host: process.env.SES_SMTP_HOST!, port: "587", secure: "starttls", username: process.env.SES_SMTP_USERNAME!, password: process.env.SES_SMTP_PASSWORD! })`.
3. `EMAIL_PROVIDER=ses`. (Companies that set their own SMTP in their Workspace keep working.)

> If you would rather keep **Resend** (it has a free tier and nothing in this guide depends on AWS for email), skip A.5 and keep `RESEND_API_KEY`.

### A.6 The domain instructions customers see (required)

`src/lib/platform/domains/vercel.ts` → `routingRecord()` tells customers to point an apex domain to the A record `76.76.21.21` and a subdomain to `cname.vercel-dns.com`. Those are Vercel's.

- Create `src/lib/platform/domains/self.ts` exporting a `routingRecord(host)` that returns the **Elastic IP** as the **A** record value for apex domains and
  `edge.selfrunbusiness.com` as the **CNAME** value for subdomains (use `process.env.SERVER_IP` and `process.env.EDGE_HOST`).
- Use it wherever the Domains page builds its instructions in place of the Vercel one.
- In `src/lib/platform/domains/index.ts` the `manual` provider is the right one for a self-hosted server: Caddy attaches every saved domain by itself. Set `DOMAIN_PROVIDER=manual`.

### A.7 Check it builds, then try it in Docker

```bash
npm run build                      # must pass
docker build -t selfrun-web .      # the Dockerfile is in Part 8
```

> ✅ **Checkpoint (Part A):** `npm run build` passes; files upload, download and delete on a local run (the files appear in `UPLOAD_DIR`); `/api/health` answers 200; `/api/internal/tls-ask?domain=x` answers 200 for a known company host and 404 for an unknown one; with `RUN_SCHEDULER=1` the log prints `[scheduler] 10 daily jobs scheduled (UTC)`.

---

## 1. Prepare

⏱ *30 min · required*

- **1.1** An **AWS account** with billing on. Use the root user only to create an administrator (IAM Identity Center, or an IAM user with `AdministratorAccess`), turn on **MFA** for both, then stop using root.
- **1.2** On your computer install the **AWS CLI v2** (`aws --version`) and sign in (`aws configure sso` or `aws configure`). Check: `aws sts get-caller-identity`.
- **1.3** Make a notes file (a password manager is best) and choose names once:

  ```
  AWS_REGION   = ap-south-1                (pick the region closest to your customers)
  ROOT_DOMAIN  = selfrunbusiness.com
  SERVER_NAME  = selfrun-1
  BUCKET       = selfrun-backups-<account-id>
  ```
- **1.4** Set a **billing budget alert**: Console → Billing → Budgets → monthly cost budget → alert at 50%, 80%, 100% to your email.
- **1.5** Have access to: your current **Vercel** project, your **MongoDB Atlas** project, your **domain registrar**, **GitHub** (this repository).

> ✅ **Checkpoint:** `aws sts get-caller-identity` works and the budget alert exists.

---

## 2. Create the server

⏱ *25 min · required*

- **2.1** **Security group.** Console → EC2 → **Security Groups → Create**: name `selfrun-server`, in the default VPC. **Inbound rules: only** HTTP **80** and HTTPS **443** (and **UDP 443** for HTTP/3) from anywhere. **No SSH (22)**: you will reach the server with **Session Manager** (below), which needs no open port. Outbound: all.
- **2.2** **Instance role** (so the server can sign in to AWS without keys): IAM → Roles → **Create role** → *EC2* → name `selfrun-server-role` → attach the managed policy **`AmazonSSMManagedInstanceCore`** (Session Manager). Then add an **inline policy** (replace the placeholders):

  ```json
  { "Version": "2012-10-17", "Statement": [
    { "Effect": "Allow", "Action": ["s3:PutObject","s3:GetObject","s3:ListBucket","s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::selfrun-backups-<ACCOUNT_ID>","arn:aws:s3:::selfrun-backups-<ACCOUNT_ID>/*"] },
    { "Effect": "Allow", "Action": ["route53:ListHostedZonesByName","route53:GetChange"], "Resource": "*" },
    { "Effect": "Allow", "Action": ["route53:ChangeResourceRecordSets","route53:ListResourceRecordSets"], "Resource": "arn:aws:route53:::hostedzone/<HOSTED_ZONE_ID>" }
  ] }
  ```

  (The Route 53 lines are for Caddy's wildcard certificate; `<HOSTED_ZONE_ID>` comes from Part 3. The S3 lines are for backups.)
- **2.3** **Launch the instance.** EC2 → **Launch instance**:
  - Name `selfrun-1`; image **Ubuntu Server 24.04 LTS** (x86_64).
  - Type **`t3.medium`** (2 vCPU, 4 GB). It is enough for the app, MongoDB and Caddy for a platform of small and medium companies; scale up later (Part 16.4).
  - Key pair: **Proceed without a key pair** (you will use Session Manager).
  - Network: default VPC, a public subnet, **auto-assign public IP: enable**, security group `selfrun-server`.
  - Storage: **60 GiB gp3**, tick **Encrypted**. (Everything lives here: the database and the uploaded files. Plan for growth: you can enlarge it later without downtime.)
  - Advanced details → **IAM instance profile**: `selfrun-server-role`. **Metadata version**: *V2 only* (IMDSv2). 
  - Launch.
- **2.4** **Fixed IP.** EC2 → **Elastic IPs → Allocate** → **Associate** with `selfrun-1`. Write the address in your notes as `SERVER_IP`. Customers' apex domains will point here.
- **2.5** **Protect it.** Select the instance → **Actions → Instance settings → Change termination protection → Enable**. Also **Actions → Instance settings → Change stop protection → Enable**.
- **2.6** **Daily disk snapshots** (cheap, automatic): EC2 → **Lifecycle Manager → Create lifecycle policy** → *EBS snapshot policy* → target the volume by a tag (`Name = selfrun-1`: add that tag to the volume) → every 24 hours, retain 7 → Create.
- **2.7** **Auto-recover** if the hardware fails: CloudWatch → Alarms → Create → metric *EC2 → Per-Instance → StatusCheckFailed_System* for `selfrun-1`, threshold `>= 1` for 2 periods → action **EC2 action: Recover this instance**. Add a second alarm on *StatusCheckFailed_Instance* with action **Reboot**, and a notification to your email (SNS).
- **2.8** **Open a shell** (no SSH): Console → EC2 → select the instance → **Connect → Session Manager → Connect**. Or from your computer: install the *Session Manager plugin* and run `aws ssm start-session --target <instance-id>`.

> ✅ **Checkpoint:** you can open a shell on the server through Session Manager, the Elastic IP is attached, and the snapshot policy and alarms exist.

---

## 3. DNS (Route 53)

⏱ *20 min · required*

Route 53 is needed so Caddy can prove it owns `*.selfrunbusiness.com` (a wildcard certificate covers every company's automatic address at once, with no per-company wait). Cost is about half a dollar a month.

- **3.1** Console → Route 53 → **Hosted zones → Create hosted zone** → `selfrunbusiness.com`, *Public*. Note the **Hosted zone ID** (put it in the IAM policy of 2.2) and the four **NS** values.
- **3.2** **Copy every existing record** from your current DNS provider into this zone, **except** the ones pointing at Vercel: email (`MX`, SPF/DKIM/DMARC `TXT`), verification `TXT`s, and any `CNAME` for other services. Compare the two lists line by line.
- **3.3** Add the web records, **but leave them for the cut-over** (Part 14). While you test (Part 10), use `curl --resolve` or a hosts-file entry, not DNS:

  | Name | Type | Value (at cut-over) |
  | --- | --- | --- |
  | `selfrunbusiness.com` | A | `<SERVER_IP>` |
  | `www.selfrunbusiness.com` | A | `<SERVER_IP>` |
  | `*.selfrunbusiness.com` | A | `<SERVER_IP>` (covers `app.`, every `<slug>.` and `<slug>-app.`) |
  | `edge.selfrunbusiness.com` | A | `<SERVER_IP>` (what customers' subdomains point to) |
  | `origin.selfrunbusiness.com` | A | `<SERVER_IP>` (used only by the temporary bridge, Part 15) |

- **3.4** **Do not change the name servers at your registrar yet.** That is part of the cut-over.

> ✅ **Checkpoint:** the hosted zone contains copies of all your non-web records, and you have written down its ID and NS values.

---

## 4. Install Docker and lay out the server

⏱ *20 min · required*

Open a shell on the server (2.8) and run these as is.

- **4.1** Update and install Docker:

  ```bash
  sudo apt-get update && sudo apt-get -y upgrade
  sudo apt-get -y install ca-certificates curl unzip unattended-upgrades awscli
  curl -fsSL https://get.docker.com | sudo sh
  sudo systemctl enable --now docker
  docker --version && docker compose version
  ```
- **4.2** Automatic security updates:

  ```bash
  sudo dpkg-reconfigure -f noninteractive unattended-upgrades
  ```
- **4.3** A small **swap file** so a memory spike does not kill MongoDB:

  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- **4.4** Folders (everything that matters lives under `/opt/selfrun` and `/data`, on the encrypted disk):

  ```bash
  sudo mkdir -p /opt/selfrun /data/mongo /data/uploads /data/backups /data/caddy
  sudo chown -R 1000:1000 /data/uploads            # the app runs as user 1000 in its container
  sudo chmod 700 /data/mongo /data/backups
  ```
- **4.5** Limit container logs so they never fill the disk. `sudo nano /etc/docker/daemon.json`:

  ```json
  { "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
  ```

  then `sudo systemctl restart docker`.

> ✅ **Checkpoint:** `docker compose version` prints a version, and `ls /data` shows `mongo uploads backups caddy`.

---

## 5. The `.env` file (your settings and keys)

⏱ *20 min · required*

All settings and secrets live in **one file**, `/opt/selfrun/.env`, readable only by root. No secrets service is needed; the file is on the encrypted disk and in your backups.

- **5.1** Generate the values you need:

  ```bash
  openssl rand -base64 32      # run once per secret below
  npx web-push generate-vapid-keys   # on your computer, once: VAPID pair
  ```
- **5.2** **Reuse, never regenerate, the keys of the live platform.** From Vercel (project → Settings → Environment Variables → Production → *Reveal*) copy these **exact values**: `PLATFORM_ENCRYPTION_KEY` (plus `HRMS_`, `FMS_`, `DLMS_`, `SMMS_ENCRYPTION_KEY` only if the live platform had set them), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `OPENAI_API_KEY` and every other key you use (Appendix A).

  > [!WARNING]
  > **Never generate new encryption keys for an existing database.** Bank details, finance accounts, Digi Locker credentials and social tokens would become unreadable. Only a brand-new, empty installation may use new keys.
- **5.3** Create the file (`sudo nano /opt/selfrun/.env`) with this content and your values:

  ```bash
  # --- identity of the platform ---
  NODE_ENV=production
  SAAS_HOSTS=selfrunbusiness.com
  PLATFORM_ROOT_DOMAIN=selfrunbusiness.com
  PLATFORM_WILDCARD_SUBDOMAINS=1
  NEXT_PUBLIC_APP_URL=https://www.selfrunbusiness.com
  DOMAIN_PROVIDER=manual
  SERVER_IP=<Elastic IP>
  EDGE_HOST=edge.selfrunbusiness.com

  # --- database (container on this server) ---
  MONGO_ROOT_USER=root
  MONGO_ROOT_PASSWORD=<long random>
  MONGO_APP_PASSWORD=<long random>
  MONGODB_URI=mongodb://selfrun:<MONGO_APP_PASSWORD>@mongo:27017/selfrun?authSource=selfrun

  # --- files, scheduler ---
  UPLOAD_DIR=/data/uploads
  RUN_SCHEDULER=1
  CRON_SECRET=<same value as on Vercel>

  # --- encryption keys (SAME as the live platform) ---
  PLATFORM_ENCRYPTION_KEY=...

  # --- first staff account (used only if the database has none) ---
  SAAS_ADMIN_EMAIL=you@selfrunbusiness.com
  SAAS_ADMIN_PASSWORD='<password>'

  # --- push, AI, email, payments: copy what you use today (Appendix A) ---
  VAPID_PUBLIC_KEY=...
  VAPID_PRIVATE_KEY=...
  OPENAI_API_KEY=...
  EMAIL_PROVIDER=ses
  EMAIL_FROM=SelfRun <no-reply@selfrunbusiness.com>
  SES_SMTP_HOST=email-smtp.ap-south-1.amazonaws.com
  SES_SMTP_USERNAME=...
  SES_SMTP_PASSWORD=...

  # --- Caddy / bridge ---
  ACME_EMAIL=admin@selfrunbusiness.com
  BRIDGE_SECRET=<long random, used in Part 15>
  AWS_REGION=ap-south-1
  ```

  Wrap values that contain `#` or spaces in quotes.
- **5.4** Lock it down and back it up:

  ```bash
  sudo chown root:root /opt/selfrun/.env && sudo chmod 600 /opt/selfrun/.env
  ```

  Keep **a copy of this file in your password manager** (it is the one thing that is not recreated from code). The nightly backup in Part 6 also copies it.

> ✅ **Checkpoint:** `sudo ls -l /opt/selfrun/.env` shows `-rw------- root root`, and every encryption key equals the one on Vercel.

---

## 6. MongoDB, backups and restore

⏱ *40 min · required*

MongoDB runs in a container on this server, **reachable only by the app** (no port is published to the internet). A nightly job dumps it to the disk and to S3.

- **6.1** Create the off-server backup bucket (private, encrypted, old copies expire):

  ```bash
  aws s3api create-bucket --bucket selfrun-backups-<ACCOUNT_ID> --region $AWS_REGION --create-bucket-configuration LocationConstraint=$AWS_REGION
  aws s3api put-public-access-block --bucket selfrun-backups-<ACCOUNT_ID> --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-encryption --bucket selfrun-backups-<ACCOUNT_ID> --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
  aws s3api put-bucket-lifecycle-configuration --bucket selfrun-backups-<ACCOUNT_ID> --lifecycle-configuration '{"Rules":[{"ID":"expire","Status":"Enabled","Filter":{},"Expiration":{"Days":30}}]}'
  ```
- **6.2** The app's database user is created by a script that MongoDB runs on its first start. Create `/opt/selfrun/mongo-init.js`:

  ```js
  // runs once, when the data folder is empty
  db = db.getSiblingDB("selfrun");
  db.createUser({ user: "selfrun", pwd: process.env.MONGO_APP_PASSWORD, roles: [{ role: "readWrite", db: "selfrun" }] });
  ```

  Because the script needs the password, it is read from the environment in the compose file (Part 8.1) with `--eval`. If you prefer, create the user by hand after the first start:

  ```bash
  docker exec -it selfrun-mongo mongosh -u root -p '<MONGO_ROOT_PASSWORD>' --authenticationDatabase admin --eval \
   'db.getSiblingDB("selfrun").createUser({user:"selfrun",pwd:"<MONGO_APP_PASSWORD>",roles:[{role:"readWrite",db:"selfrun"}]})'
  ```
- **6.3** The nightly backup script, `/opt/selfrun/backup.sh` (the backup container runs it):

  ```bash
  #!/bin/sh
  set -e
  STAMP=$(date -u +%Y%m%d-%H%M)
  OUT=/backups/mongo-$STAMP.archive.gz
  mongodump --uri "mongodb://root:${MONGO_ROOT_PASSWORD}@mongo:27017/?authSource=admin" --archive=$OUT --gzip
  cp /env/.env /backups/env-$STAMP.env               # the settings file travels with the backup
  aws s3 cp $OUT s3://${BACKUP_BUCKET}/mongo/ --only-show-errors
  aws s3 cp /backups/env-$STAMP.env s3://${BACKUP_BUCKET}/env/ --sse AES256 --only-show-errors
  find /backups -name 'mongo-*' -mtime +7 -delete; find /backups -name 'env-*' -mtime +7 -delete
  echo "backup $STAMP done"
  ```

  `chmod +x /opt/selfrun/backup.sh`. (The `.env` copy contains secrets; the S3 bucket is private, encrypted and has no public access.)
- **6.4** **Test a restore now, before you have anything to lose** (you will rehearse it again in Part 13):

  ```bash
  docker exec selfrun-backup /backup.sh
  ls -lh /data/backups
  # restore into a scratch database name to prove the file is good:
  docker exec -i selfrun-mongo mongorestore -u root -p '<MONGO_ROOT_PASSWORD>' --authenticationDatabase admin \
     --archive=/backups/<file>.archive.gz --gzip --nsFrom 'selfrun.*' --nsTo 'selfrun_restore_test.*'
  ```

  Then drop `selfrun_restore_test`.
- **6.5** **Memory tuning:** MongoDB takes about half of RAM by default; cap it so the app has room. It is set in the compose file (`--wiredTigerCacheSizeGB 0.75` on a 4 GB machine).

> ✅ **Checkpoint:** a backup file appears in `/data/backups` and in the S3 bucket, and the scratch restore succeeded.

---

## 7. Caddy: HTTPS for every domain

⏱ *30 min · required*

Caddy does three jobs: HTTPS for the platform's own names (one **wildcard** certificate through Route 53), HTTPS for **customers' own domains** on demand (asking the app first), and the temporary **bridge** (Part 15).

- **7.1** Caddy needs the Route 53 plug-in, so build a small image. `/opt/selfrun/caddy/Dockerfile`:

  ```dockerfile
  FROM caddy:2-builder AS build
  RUN xcaddy build --with github.com/caddy-dns/route53
  FROM caddy:2
  COPY --from=build /usr/bin/caddy /usr/bin/caddy
  ```
- **7.2** `/opt/selfrun/Caddyfile`:

  ```caddyfile
  {
      email {$ACME_EMAIL}
      # A customer's own domain gets a certificate only if the app says the domain belongs to a company.
      on_demand_tls {
          ask http://web:3000/api/internal/tls-ask
      }
  }

  # ── The platform's own names: selfrunbusiness.com, www., app., every <slug>. and <slug>-app. ──
  selfrunbusiness.com, *.selfrunbusiness.com {
      tls {
          dns route53        # proves ownership through Route 53 (the server's IAM role, no keys)
      }
      encode zstd gzip

      # The bridge: requests forwarded by the temporary Vercel proxy (Part 15) arrive here.
      @bridge host origin.selfrunbusiness.com
      handle @bridge {
          @ok header X-Bridge-Secret {$BRIDGE_SECRET}
          handle @ok {
              reverse_proxy web:3000 {
                  header_up Host {http.request.header.X-Bridge-Host}
                  header_up X-Real-IP {http.request.header.X-Bridge-Client-Ip}
                  header_up -X-Bridge-Secret
                  flush_interval -1
              }
          }
          respond 403
      }

      handle {
          @internal path /api/internal/*
          respond @internal 404
          reverse_proxy web:3000 {
              header_up X-Real-IP {remote_host}
              flush_interval -1        # live chat updates (SSE) are sent as they happen
          }
      }
  }

  # ── Customers' own domains (acme.com, app.acme.com …): a certificate the first time each one is visited ──
  https:// {
      tls {
          on_demand
      }
      encode zstd gzip
      @internal path /api/internal/*
      respond @internal 404
      reverse_proxy web:3000 {
          header_up X-Real-IP {remote_host}
          flush_interval -1
      }
  }
  ```

  How the pieces fit: a name that matches the first block uses the wildcard certificate; any **other** name goes to the second block, where Caddy first asks the app (`tls-ask`); only a real company host gets a certificate. The `/api/internal/*` path is hidden from the internet.
- **7.3** **Limits to know:** Let's Encrypt allows many certificates per week per registered domain, and the wildcard avoids that for every company address. Each **customer domain** is a different registered domain, so the limits do not add up. A customer domain gets its certificate on its **first visit after its DNS points here** (a one-time delay of a few seconds).

> ✅ **Checkpoint:** the three files exist (`caddy/Dockerfile`, `Caddyfile`, and the compose file in Part 8), and the Route 53 policy from Part 2.2 is attached to the instance role.

---

## 8. Build and deploy the app (GitHub Actions)

⏱ *45 min · required*

The app image is built on GitHub (the production build needs about 6 GB of memory, which the server should not spend) and stored in **GitHub Container Registry**, which is free. The server only pulls and runs it.

- **8.1** **The compose file**, `/opt/selfrun/docker-compose.yml`:

  ```yaml
  services:
    caddy:
      build: ./caddy
      container_name: selfrun-caddy
      restart: unless-stopped
      ports: ["80:80", "443:443", "443:443/udp"]
      env_file: .env
      environment:
        AWS_REGION: ${AWS_REGION}
      volumes:
        - ./Caddyfile:/etc/caddy/Caddyfile:ro
        - /data/caddy:/data           # certificates (keep them: they are re-used across restarts)
      depends_on: [web]

    web:
      image: ghcr.io/<your-org>/<your-repo>:latest
      container_name: selfrun-web
      restart: unless-stopped
      env_file: .env
      environment:
        PORT: "3000"
        HOSTNAME: "0.0.0.0"
      volumes:
        - /data/uploads:/data/uploads
      depends_on: [mongo]
      healthcheck:
        test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
        interval: 30s
        timeout: 5s
        retries: 3
        start_period: 40s

    mongo:
      image: mongo:7
      container_name: selfrun-mongo
      restart: unless-stopped
      command: ["mongod", "--auth", "--bind_ip_all", "--wiredTigerCacheSizeGB", "0.75"]
      environment:
        MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER}
        MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
        MONGO_APP_PASSWORD: ${MONGO_APP_PASSWORD}
      volumes:
        - /data/mongo:/data/db
        - ./mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
      # no "ports": MongoDB is reachable only from the other containers on this server.

    backup:
      image: mongo:7
      container_name: selfrun-backup
      restart: unless-stopped
      env_file: .env
      environment:
        BACKUP_BUCKET: selfrun-backups-<ACCOUNT_ID>
      volumes:
        - /data/backups:/backups
        - ./backup.sh:/backup.sh:ro
        - ./.env:/env/.env:ro
      entrypoint: ["/bin/sh", "-c", "apt-get update -qq && apt-get install -y -qq awscli cron >/dev/null && echo '0 1 * * * /bin/sh /backup.sh >> /proc/1/fd/1 2>&1' | crontab - && cron -f"]
  ```

  > MongoDB's `--auth` plus the fact that no port is published means the database cannot be reached from outside the server. Do **not** add a `ports:` line to `mongo`.
- **8.2** **The app's Dockerfile** (repository root):

  ```dockerfile
  FROM node:22-bookworm-slim AS deps
  WORKDIR /app
  COPY package.json package-lock.json ./
  RUN npm ci

  FROM node:22-bookworm-slim AS build
  WORKDIR /app
  ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=6144
  COPY --from=deps /app/node_modules ./node_modules
  COPY . .
  RUN npm run build

  FROM node:22-bookworm-slim AS run
  WORKDIR /app
  ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
  RUN groupadd -g 1000 app && useradd -u 1000 -g app -m app
  COPY --from=build --chown=app:app /app/.next/standalone ./
  COPY --from=build --chown=app:app /app/.next/static ./.next/static
  COPY --from=build --chown=app:app /app/public ./public
  USER app
  EXPOSE 3000
  CMD ["node", "server.js"]
  ```

  and a `.dockerignore`: `node_modules`, `.next`, `.git`, `*.zip`, `dev.zip`, `.env`, `.env.*`, `docs`, `mobile`, `desktop`.
- **8.3** **Let GitHub deploy to the server without keys**, using OIDC and Session Manager (no SSH needed):
  1. IAM → Identity providers → add `https://token.actions.githubusercontent.com` (audience `sts.amazonaws.com`).
  2. IAM → Roles → *Web identity* → that provider → role `github-deploy`, trust restricted to `repo:<org>/<repo>:ref:refs/heads/main`.
  3. Permissions for that role: `ssm:SendCommand` and `ssm:GetCommandInvocation` on the instance, and on the document `AWS-RunShellScript`.
- **8.4** `.github/workflows/deploy-aws.yml` (the existing `desktop.yml` stays as it is):

  ```yaml
  name: Deploy to AWS
  on:
    push:
      branches: [main]
  permissions:
    id-token: write
    contents: read
    packages: write
  jobs:
    deploy:
      runs-on: ubuntu-latest        # 16 GB: the build needs about 6 GB
      steps:
        - uses: actions/checkout@v4
        - uses: docker/login-action@v3
          with: { registry: ghcr.io, username: "${{ github.actor }}", password: "${{ secrets.GITHUB_TOKEN }}" }
        - uses: docker/setup-buildx-action@v3
        - uses: docker/build-push-action@v6
          with:
            context: .
            push: true
            tags: ghcr.io/${{ github.repository }}:latest,ghcr.io/${{ github.repository }}:${{ github.sha }}
            cache-from: type=gha
            cache-to: type=gha,mode=max
        - uses: aws-actions/configure-aws-credentials@v4
          with:
            role-to-assume: arn:aws:iam::<ACCOUNT_ID>:role/github-deploy
            aws-region: ap-south-1
        - name: Pull and restart on the server
          run: |
            CMD_ID=$(aws ssm send-command --instance-ids <INSTANCE_ID> --document-name AWS-RunShellScript \
              --parameters 'commands=["cd /opt/selfrun && docker compose pull web && docker compose up -d web && docker image prune -f"]' \
              --query Command.CommandId --output text)
            aws ssm wait command-executed --command-id $CMD_ID --instance-id <INSTANCE_ID>
  ```
- **8.5** Make the image readable by the server: GitHub → your repository → **Packages** → the image → **Package settings** → keep it **private** and on the server run `echo <a read-only GitHub token> | sudo docker login ghcr.io -u <user> --password-stdin` once (a fine-grained token with *read:packages*).
- **8.6** **First start** (on the server). Copy `docker-compose.yml`, `Caddyfile`, `caddy/`, `mongo-init.js`, `backup.sh` into `/opt/selfrun` (paste them with `nano`, or `aws s3 cp` from a private place), then:

  ```bash
  cd /opt/selfrun
  sudo docker compose build caddy
  sudo docker compose up -d
  sudo docker compose ps
  sudo docker compose logs -f web      # Ctrl+C to leave
  ```

> ✅ **Checkpoint:** `docker compose ps` shows `caddy`, `web`, `mongo`, `backup` as `running` (web `healthy`), and the web log shows `[scheduler] 10 daily jobs scheduled (UTC)` and no errors.

---

## 9. Email (SES)

⏱ *30 min plus approval wait · required for sign-up emails (skip if you keep Resend)*

- **9.1** SES (same region) → **Identities → Create identity** → *Domain* `selfrunbusiness.com` → **Easy DKIM** → publish the records to **Route 53** (one click).
- **9.2** Set a **custom MAIL FROM** domain (`mail.selfrunbusiness.com`), publish the `MX` and `TXT` records it shows. Add a **DMARC** TXT record: `_dmarc.selfrunbusiness.com` = `v=DMARC1; p=none; rua=mailto:dmarc@selfrunbusiness.com`.
- **9.3** **Leave the sandbox:** SES → Account dashboard → **Request production access** (use case: transactional — sign-up verification, password resets, notifications). Usually granted within a day.
- **9.4** SMTP credentials: SES → **SMTP settings → Create SMTP credentials**; put them in `.env` as `SES_SMTP_USERNAME` / `SES_SMTP_PASSWORD`; restart the app (`docker compose up -d web`).
- **9.5** Add a **configuration set** with a bounce and complaint notification to your email. A bounce rate above 5% or complaints above 0.1% can pause sending.

> ✅ **Checkpoint:** the domain shows **Verified** and DKIM **Successful**, production access is **granted**, and a test email arrives with `dkim=pass`.

---

## 10. First start and tests on the new server

⏱ *1 to 2 hours · required*

Test **before** DNS changes. Send the real host names to the server without touching DNS:

- **10.1** From your computer: `curl --resolve www.selfrunbusiness.com:443:<SERVER_IP> https://www.selfrunbusiness.com/api/health`. The first request makes Caddy obtain the wildcard certificate (it can take a minute; watch with `docker compose logs -f caddy`). Expected: `{"ok":true}`.
- **10.2** In your browser add a **hosts-file** entry for each test name (`www`, `app`, `<test-slug>`, `<test-slug>-app`) pointing to `<SERVER_IP>`; remove them afterwards.
- **10.3** Run this checklist on a **new test company** (this database is empty at this point, or a copy: see Part 13):

  | # | Check | Expected |
  | --- | --- | --- |
  | 1 | Home, Features, Pricing, Offers, Gallery, Docs | Pages and images load; dark mode works |
  | 2 | Sign up a test company | Verification email arrives; workspace is created |
  | 3 | Sign in to its products at `<slug>-app.…` | Dashboard loads |
  | 4 | Upload a logo, an HR document, a CMS image; download; delete | Works; file appears under `/data/uploads`; storage meter goes down on delete |
  | 5 | Team Chat in two browsers for 5+ minutes | Live updates keep flowing |
  | 6 | AI answer and a CSV import | Complete without a timeout |
  | 7 | Wrong password 10 times | Rate limit applies; the log shows your real IP, not the container's |
  | 8 | Run one cron by hand: `docker exec selfrun-web node -e "fetch('http://127.0.0.1:3000/api/playbook-ai/cron',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)"` | JSON with `ok: true` |
  | 9 | `curl https://www.selfrunbusiness.com/api/internal/tls-ask?domain=x` (through Caddy) | `404` (hidden from outside) |
  | 10 | Reboot the server (`sudo reboot`) | Everything comes back by itself in about a minute |
  | 11 | Stop and start the web container while browsing | Site recovers; no data lost |
- **10.4** Watch the logs for `MongoServerError`, `Unauthorized`, `ENOENT` or `Missing environment variable`; fix them now.

> ✅ **Checkpoint:** every row passes, and the server restarts cleanly by itself.

---

## 11. Inventory: everything that must be migrated

⏱ *1 hour · required*

"All customers" means more than the database. List everything so nothing is forgotten.

| # | What | Where it is today | Where it goes | How |
| --- | --- | --- | --- | --- |
| 1 | **All data** of every company (one database) | Atlas | MongoDB container | `mongodump` / `mongorestore` (Part 13) |
| 2 | **Uploaded files** | Vercel Blob | `/data/uploads` | Copy script (Part 13.3) |
| 3 | **Encryption keys, VAPID keys, secrets** | Vercel environment | `/opt/selfrun/.env` | Copy exactly (Part 5.2) |
| 4 | **Automatic addresses** (`<slug>.selfrunbusiness.com`, `<slug>-app.…`) | Vercel wildcard | Route 53 wildcard → server | DNS switch at cut-over (Part 14) |
| 5 | **Customers' own domains** (`acme.com`, `app.acme.com`) | Attached to the Vercel project; the customer's DNS points at Vercel | Server (Caddy on-demand HTTPS) | Bridge, then each customer changes DNS (Part 15) |
| 6 | **Platform settings saved in the database** (Platform Console → Integrations: Vercel token, email provider, payment keys) | Atlas (moves with 1) | same | Edit after the move (Part 14.9) |
| 7 | **Scheduled jobs** | `vercel.json` | The in-app scheduler | Disable Vercel's at cut-over |
| 8 | **Third-party callbacks** that point at your addresses (Razorpay webhooks, Google/Meta/LinkedIn redirect URLs) | The same domain names | unchanged | Re-check only |
| 9 | **Desktop/mobile app builds** (GitHub Actions) | GitHub | unchanged | The app only calls GitHub's API |
| 10 | **Email** (SPF/DKIM) | Resend | SES | Part 9 (and Resend DKIM removed at the end) |

**Get the list of customer domains now.** On the **current** database, in `mongosh`:

```js
db.company_domains.find({}, { host: 1, kind: 1, status: 1, companyId: 1 }).toArray()
// customers' own domains only:
db.company_domains.find({ kind: "custom" }, { host: 1, status: 1, companyId: 1 }).toArray()
```

Export the custom ones to a spreadsheet (host, company, status). Also list the domains attached to the Vercel project (Vercel → project → Settings → Domains, or `vercel domains ls`). Compare: every custom domain should be in both. This sheet drives Part 15.

> ✅ **Checkpoint:** you have the spreadsheet of every customer's own domain, and the count of companies (`db.companies.countDocuments()`).

---

## 12. The migration plan (zero lost data, short downtime)

⏱ *read only · 5 min*

The hard part of moving a multi-tenant platform is the **customers' own domains**: their DNS is theirs, and it points at **Vercel**. You cannot change it. The plan avoids needing to:

```
 BEFORE        DURING THE CUT-OVER (about 30-60 minutes)               AFTER (weeks)
 ─────────     ───────────────────────────────────────────────────     ────────────────────────────
 Vercel + Atlas   1 freeze writes   2 final copy of data/files          Customer domains still hit
 serve everyone   3 start the new server   4 point OUR DNS at it         Vercel, which now only FORWARDS
                  5 replace the Vercel app with a BRIDGE                them to the new server
                    (forwards every request to the new server)         (the bridge). Each customer changes
                                                                       DNS to the new IP at their own pace.
                                                                       When all have, the bridge is turned off.
```

- Automatic addresses (`*.selfrunbusiness.com`) move **at once**, because **you** control that DNS.
- Customers' own domains keep working **without any action by them**: Vercel still answers, and forwards to the new server through the bridge. The bridge also
  guarantees nobody writes into the old database after the switch (the old app is gone).
- Each customer later changes their DNS to your server's address. Their certificate is issued automatically on first visit.
- **Nothing is lost:** the old Atlas database and Blob store stay untouched for 30 days as the rollback copy.

**The rule:** only one side ever writes. Before the freeze it is Vercel; after step 5 it is the new server. There is never a time when both accept writes.

---

## 13. Step by step: the data rehearsal

⏱ *2 to 4 hours · required · do this a few days before cut-over, then again on cut-over day*

### 13.1 Copy the database

On **your computer** (install the MongoDB Database Tools from mongodb.com/try/download/database-tools):

```bash
mongodump --uri "<OLD Atlas MONGODB_URI>" --archive=selfrun.archive.gz --gzip
```

Upload it to the server's backup bucket and restore it into the container:

```bash
aws s3 cp selfrun.archive.gz s3://selfrun-backups-<ACCOUNT_ID>/migration/
# on the server (Session Manager):
aws s3 cp s3://selfrun-backups-<ACCOUNT_ID>/migration/selfrun.archive.gz /data/backups/
docker exec -i selfrun-mongo mongorestore -u root -p '<MONGO_ROOT_PASSWORD>' --authenticationDatabase admin \
   --archive=/backups/selfrun.archive.gz --gzip --drop
```

If the Atlas database name differs from `selfrun`, add `--nsFrom 'OLDNAME.*' --nsTo 'selfrun.*'`.
(For a very large database you can use Atlas's **Live Migrate** or `mongodump` straight from one machine to the other; for most platforms the archive above is simplest.)

### 13.2 Verify the database

On the server:

```bash
docker exec -it selfrun-mongo mongosh -u root -p '<MONGO_ROOT_PASSWORD>' --authenticationDatabase admin --eval '
  const d = db.getSiblingDB("selfrun");
  printjson({ companies: d.companies.countDocuments(), domains: d.company_domains.countDocuments(), collections: d.getCollectionNames().length })'
```

Compare with the same numbers on Atlas. They must match (during the rehearsal, a few new records on the live side are normal).

### 13.3 Copy the files (Blob → the server's disk)

The database stores each file's key (like `resumes/<uuid>.pdf`). Copy every blob to the same path under `/data/uploads`, and write its content type beside it. Put this script on your computer (Node 22; the **old** `BLOB_READ_WRITE_TOKEN`), and run it so it writes into a folder you then upload to the server (or run it on the server through Session Manager with the token):

```js
// scripts/blob-to-disk.mjs   run: BLOB_READ_WRITE_TOKEN=... OUT=/data/uploads node scripts/blob-to-disk.mjs
import { list, get } from "@vercel/blob";
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
const OUT = path.resolve(process.env.OUT);
let cursor, copied = 0, skipped = 0;
do {
  const page = await list({ cursor, limit: 1000 });
  for (const b of page.blobs) {
    const file = path.join(OUT, b.pathname);
    if (!file.startsWith(OUT + path.sep)) continue;                      // never write outside the folder
    if (await stat(file).then(() => true, () => false)) { skipped++; continue; }   // safe to re-run
    const r = await get(b.pathname, { access: "private" });
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(await new Response(r.stream).arrayBuffer()));
    await writeFile(file + ".type", r.blob.contentType || "application/octet-stream");
    copied++;
  }
  cursor = page.cursor;
} while (cursor);
console.log({ copied, skipped });
```

Then set the owner so the app can read it: `sudo chown -R 1000:1000 /data/uploads`. It is safe to run again (it skips files that exist), so the cut-over day run only copies what is new.

### 13.4 Verify the files

Count: the number of blobs (`vercel blob list` or the script's `copied + skipped`) must equal `find /data/uploads -type f ! -name '*.type' | wc -l`. Open a company's HR document, a CMS image, a resume on the **rehearsal** site (hosts-file test, Part 10.2) and confirm they open.

### 13.5 Rehearse the app against the copy

With the copied data in place, run the full Part 10 checklist **with real customer data** (use a company of your own, or a test company that exists in the copy). Check: a company's website loads, its products load, its documents open, a payment page loads, the Domains page lists its domains.

> ✅ **Checkpoint:** the counts match, files open, and a real company works end to end on the new server (still reached only through your hosts-file entries).

---

## 14. Step by step: cut-over day

⏱ *about 1 to 2 hours · choose a quiet time and tell customers in advance*

**Two days before**

- **14.1** In the **current** DNS (and wherever customers' records for **your** names live), lower the TTL of `@`, `www`, `app`, `*`, `edge` to **60 seconds**. Wait two days so every resolver forgets the old long TTL.
- **14.2** Deploy the **bridge** project to Vercel **but keep it unattached** (Part 15.2). Test it on a `*.vercel.app` address against the new server.
- **14.3** Tell customers: "short maintenance on `<date>`, about 30 to 60 minutes. Your own domain keeps working; you will get a separate message about a one-time DNS update."

**The cut-over** (follow in order; times are a guide)

- **14.4** *Freeze writes on the old side.* Platform Console → **Maintenance** → *takeover* for the window (visitors see the maintenance screen; APIs, webhooks and payment links keep working, which is fine because the freeze is about people changing data). Also pause outgoing jobs: in Vercel remove or empty `crons` for the final deploy (or pause the project's cron jobs) so no job runs from there again.
- **14.5** *Final data copy.* Run Part 13.1 again (a fresh dump and restore with `--drop`), then Part 13.3 (files, only the new ones). Compare counts (Part 13.2, 13.4).
- **14.6** *Start serving from the new server.* On the server: `cd /opt/selfrun && sudo docker compose up -d`. Confirm in the log: `[scheduler] 10 daily jobs scheduled (UTC)`, no errors, and `curl --resolve www.selfrunbusiness.com:443:<SERVER_IP> https://www.selfrunbusiness.com/api/health` is `{"ok":true}`.
- **14.7** *Switch our DNS.* In **Route 53** the records from Part 3.3 already exist. Make them live:
  - If your DNS is **already** in Route 53 or you can edit it there: it is done as soon as the records exist.
  - Otherwise at your **registrar** replace the name servers with the four **NS** values of the Route 53 zone (Part 3.1). With the 60-second TTL most resolvers follow within minutes; some take longer.
  Check: `dig +short www.selfrunbusiness.com` returns `<SERVER_IP>`, and `dig +short acme.selfrunbusiness.com` too.
- **14.8** *Replace the Vercel app with the bridge.* In Vercel, **attach the bridge project to the same domains** the old project holds (Part 15.3) and remove them from the old project, so every customer domain now lands on the bridge. From this moment the old app and its database are no longer used by anyone.
- **14.9** *Fix the platform's saved settings.* Platform Console → **Integrations**: set the **domain provider to Manual** (remove the saved Vercel token) and set the **email provider to SES** (or leave Resend). These are stored in the database, so they override the `.env` values until you change them.
- **14.10** *End maintenance mode.*
- **14.11** *Watch for 30 minutes:* `docker compose logs -f web caddy`, a fresh sign-up end to end, a file upload, an email, a customer's own domain (it should work through the bridge), the Razorpay test or a payment page.
- **14.12** *Keep the old side untouched* (Atlas cluster, Blob store, the old Vercel deployment as an unattached project) for **30 days** as the rollback copy.

> ✅ **Checkpoint:** `www`, `app`, a customer's automatic address, and a customer's **own domain** all load, sign-in works, files open, scheduled jobs are logged by the new server (the first one fires at its UTC time), and email is delivered.

---

## 15. Customers' own domains: the bridge and the hand-over

⏱ *bridge: 1 hour once · hand-over: a few minutes per customer, over a few weeks*

### 15.1 What the bridge is

A **tiny Vercel project** with no pages. Customer domains still point at Vercel, so every request lands there; the bridge **forwards it to
`origin.selfrunbusiness.com` (your server) and tells Caddy which host it was for**. Caddy puts the real host back (`header_up Host …`), so the app
sees exactly what it always saw. **The app needs no change**, and the browser keeps seeing the customer's own domain and Vercel's certificate for it.

Cost: you stay on your current Vercel plan during the transition. The bridge uses almost nothing.

### 15.2 Create the bridge project

Make a new, separate repository `selfrun-bridge` with three files.

`package.json`:

```json
{ "name": "selfrun-bridge", "private": true, "dependencies": { "next": "latest", "react": "latest", "react-dom": "latest" } }
```

`middleware.ts` (runs on every request, forwards it to your server):

```ts
import { NextResponse, type NextRequest } from "next/server";

export const config = { matcher: "/:path*" };

export function middleware(req: NextRequest) {
  const origin = process.env.ORIGIN_URL!;                         // https://origin.selfrunbusiness.com
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, origin);
  const headers = new Headers(req.headers);
  headers.set("x-bridge-secret", process.env.BRIDGE_SECRET!);
  headers.set("x-bridge-host", req.headers.get("host") ?? "");
  headers.set("x-bridge-client-ip", req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  headers.set("x-forwarded-proto", "https");
  return NextResponse.rewrite(url, { request: { headers } });
}
```

`app/page.tsx` (never shown; keeps the project valid):

```tsx
export default function Page() { return null; }
```

In the Vercel project's **Environment Variables** set `ORIGIN_URL=https://origin.selfrunbusiness.com` and `BRIDGE_SECRET` (the **same** value as in the server's `.env`). Deploy it.

> [!NOTE]
> A rewrite to an external address is proxied by Vercel: the browser stays on the customer's domain, cookies and redirects work, and the response (including live-update streams) comes straight through. Test it on the project's `*.vercel.app` address by temporarily setting the host: `curl -H "Host: acme.com" https://<bridge>.vercel.app/` should return the company's website only **after** Part 14 (when the new server holds the data).

### 15.3 Switch the customer domains to the bridge (cut-over step 14.8)

Move each custom domain from the old Vercel project to the bridge project: Vercel → old project → Settings → Domains → **Remove**, then bridge project → Settings → Domains → **Add** (the customer's DNS does not change, so Vercel verifies it at once). Do it for every host in your spreadsheet (both `acme.com`, `www.acme.com` and `app.acme.com`). You can script it with the Vercel API (`DELETE /v9/projects/{old}/domains/{host}`, `POST /v10/projects/{bridge}/domains`); the same token that the old platform used for domain attachment works.
Also add the wildcard and apex of **your own** domain only if they were on the old project; once your DNS points at the server (14.7) Vercel no longer receives that traffic, so they can simply be removed.

### 15.4 Tell each customer what to change (hand-over)

Send this (adapt the wording) to every customer with its own domain, from your spreadsheet:

> We have moved to faster infrastructure. **Your website keeps working with no action from you.** Please make a one-time DNS change within the next `<N>` weeks:
> - **`acme.com` (apex):** change the **A record** from `76.76.21.21` to **`<SERVER_IP>`**.
> - **`www.acme.com` and `app.acme.com`:** change the **CNAME** from `cname.vercel-dns.com` to **`edge.selfrunbusiness.com`**.
> - Keep the existing ownership/verification TXT records. Changes take effect within minutes to an hour. Your certificate is renewed automatically.

The platform's own **Domains** page (company → Settings → Domains) shows the same records (Part A.6), so customers who open it see the new values.

### 15.5 Track who has moved

On any computer:

```bash
for h in $(cat custom-domains.txt); do printf "%s -> " $h; dig +short $h | head -1; done
```

A domain is **moved** when it resolves to `<SERVER_IP>` (apex) or to `edge.selfrunbusiness.com`'s address (subdomains). Mark it in the spreadsheet. After a customer has moved, **remove that domain from the bridge project** in Vercel (it no longer receives traffic). Chase the rest by email after a week and two weeks.

### 15.6 Switch the bridge off

When **every** domain is moved (or you set a deadline and the rest are told the date), delete the bridge project. Customers who never moved will see their domain stop working at that point, so give a firm date and a final reminder.

> ✅ **Checkpoint:** a customer domain that has moved opens over HTTPS **directly from your server** (`curl -I https://acme.com` shows a response with Caddy's `via`/`server: Caddy` headers), and the bridge project's Domains list is shrinking.

---

## 16. After the move: monitoring, updates and growth

⏱ *1 hour once · ongoing*

### 16.1 Monitoring that costs nothing

- **Health:** an external free uptime check on `https://www.selfrunbusiness.com/api/health` (for example any free uptime monitor) emailing you if it fails twice. Add one for a customer domain too.
- **CloudWatch alarms** (the first ten are free): CPU > 85% for 10 minutes, **disk used > 80%** (needs the CloudWatch agent: `sudo apt-get install amazon-cloudwatch-agent` and a config with `disk` and `mem`; or watch the volume with `df -h /data` weekly), status-check alarms from Part 2.7.
- **Look at logs:** `sudo docker compose logs --tail 200 web`, `... caddy`, `... mongo`. Container logs rotate automatically (Part 4.5).
- **Backups:** the S3 bucket should show a new file every day; the first thing to check if anything looks off. **Practise a restore every quarter** (Part 6.4).

### 16.2 Updates

- **App:** push to `main`; GitHub builds and deploys (Part 8.4). A few seconds of restart.
- **Server OS:** unattended security updates are on; reboot monthly at a quiet time (`sudo reboot`; everything restarts by itself).
- **MongoDB:** stay on `mongo:7` and update the image when a new 7.x patch appears: `sudo docker compose pull mongo && sudo docker compose up -d mongo` (take a manual backup first: `docker exec selfrun-backup /backup.sh`).
- **Caddy:** `sudo docker compose build --pull caddy && sudo docker compose up -d caddy` every few months.

### 16.3 If the server is lost (rebuild in about 30 minutes)

1. Launch a new instance exactly as in Part 2 (same role, security group, Elastic IP **re-associated**).
2. Run Part 4. Copy `docker-compose.yml`, `Caddyfile`, `caddy/`, `mongo-init.js`, `backup.sh` into `/opt/selfrun`, and the latest `.env` backup from S3 (`aws s3 cp s3://selfrun-backups-<ACCOUNT_ID>/env/<latest> /opt/selfrun/.env`; `chmod 600`).
3. `docker compose up -d mongo`, then restore the latest dump from S3 (Part 13.1's restore command) and, if the EBS volume is gone, the files from the latest **EBS snapshot** (create a volume from it and mount it at `/data`). 
4. `docker compose up -d`. The IP is the same, so DNS needs no change.

Faster: restore the whole **EBS snapshot** (EC2 → Snapshots → *Create volume* → attach to a new instance as `/data`) and everything — database and files — is back as of the last snapshot.

### 16.4 When to grow

| Sign | Do this |
| --- | --- |
| CPU often above 70%, or memory above 80% | Stop the instance, change the type to `t3.large` (or `m6i.large`), start it (about 2 minutes of downtime). Raise `--wiredTigerCacheSizeGB` to a quarter to a third of RAM |
| Disk above 70% | Enlarge the EBS volume (EC2 → Volumes → Modify, no downtime), then `sudo growpart /dev/nvme0n1 1 && sudo resize2fs /dev/nvme0n1p1` |
| Downtime now costs more than a second server | Split MongoDB onto its own instance (same compose file, `mongo` only), then run two app instances behind a load balancer; **only one app instance may have `RUN_SCHEDULER=1`** |
| Hundreds of thousands of files | Move uploads to S3 (the storage code is one file: `src/lib/storage/blob.ts`) |
| You need a no-single-server design | The previous approach (ECS Fargate + ALB + managed database) is the next step; the data, keys and domains you moved here carry over unchanged |

---

## 17. Rollback plan

| Situation | Action |
| --- | --- |
| The new server is broken on cut-over day, **before** step 14.8 | Point DNS back (TTL is 60 s), end maintenance mode. Vercel + Atlas are untouched and have all data up to the freeze. Nothing is lost |
| Broken **after** 14.8, within the first days | (1) Put the **old Vercel project back on the domains** (reverse of 15.3). (2) Dump the new MongoDB and restore it into Atlas (`mongorestore --drop` into the old cluster) so records created after the switch are kept. (3) Copy new files in `/data/uploads` back to Blob (reverse of 13.3). (4) Point DNS back. Decide early: the longer you wait, the more data diverges |
| A bad app release | Deploy the previous image: on the server `docker compose pull` is replaced by editing `image:` to a previous `ghcr.io/<repo>:<sha>` tag and `docker compose up -d web` |
| A corrupted database | Restore the latest nightly dump (Part 6.4's command without the `--nsTo`), or the EBS snapshot |

Keep Atlas, Blob and the old Vercel project **unchanged for 30 days**.

---

## 18. Decommission Vercel and Atlas

After **30 quiet days** and all customer domains moved:

- **18.1** Take a final dump of Atlas and a final copy of Blob (the S3 copy of the dump and the files on disk already are that).
- **18.2** Delete the bridge project and the old project in Vercel; revoke the Vercel API token and the Blob token.
- **18.3** Delete the Atlas cluster and the Blob store (after one more verified backup).
- **18.4** At **Resend**, remove the domain and key (if you moved email to SES). Remove the old DKIM/SPF records for it from DNS.
- **18.5** In the repository: delete `vercel.json`, `src/lib/platform/domains/vercel.ts` (if unused), the `@vercel/blob` dependency; update `README.md` and `.env.example` to point at this guide.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `web` keeps restarting | A variable is missing or MongoDB is unreachable | `docker compose logs web`; compare `.env` with Appendix A; check `MONGODB_URI` (`authSource=selfrun`, user created) |
| `MongoServerError: Authentication failed` | The app user was not created (the init script only runs on an empty `/data/mongo`) | Create it by hand (Part 6.2) |
| Caddy cannot get the wildcard certificate | The Route 53 policy is missing or the hosted zone ID is wrong | Check the instance role policy (Part 2.2) and `docker compose logs caddy`; the zone must be the **live** zone for the domain |
| A customer domain shows a certificate error | The domain's DNS does not point at the server yet, or the app does not know the host | `dig` the domain; check the host exists in `company_domains`; visit `/api/internal/tls-ask?domain=...` from the server |
| First visit to a moved customer domain is slow | Caddy is issuing its certificate | Normal once, a few seconds |
| Customers' own domains show the old/Vercel error after cut-over | They are not yet attached to the bridge project | Part 15.3 |
| "No workspace here" through the bridge | The bridge secret differs, or `X-Bridge-Host` is empty | Same `BRIDGE_SECRET` in Vercel and `.env`; check Caddy's bridge block |
| Uploads fail | `/data/uploads` is not writable by the app | `sudo chown -R 1000:1000 /data/uploads` |
| Old files do not open | The copy is incomplete, or `.type` files are missing | Re-run the copy script (it skips existing files) |
| Emails do not arrive | SES in the sandbox, or DKIM not verified | Part 9 |
| Scheduled jobs did not run | `RUN_SCHEDULER` is not `1` on the running container | Check the `[scheduler]` line in the web log, and Platform Console → Cron jobs (it says what starts the jobs and which are overdue) |
| A job ran twice | Two app containers have the scheduler on, or Vercel crons are still active | One scheduler only; remove Vercel's crons (14.4) |
| Live chat disconnects | Something in front buffers streaming | Caddy has `flush_interval -1`; do not put another proxy in front |
| Disk full | Logs, backups or uploads grew | `df -h /data`; delete old `/data/backups`; enlarge the volume (16.4) |
| Site slow after growth | The 4 GB server is out of memory | Check `free -m`; scale up (16.4) |
| Cannot open a shell | The instance role lacks `AmazonSSMManagedInstanceCore` | Part 2.2; wait a few minutes after attaching |

---

## Appendix A: every environment variable

All of these go in `/opt/selfrun/.env` (Part 5.3).

| Variable | Value / note |
| --- | --- |
| `NODE_ENV` | `production` |
| `SAAS_HOSTS`, `PLATFORM_ROOT_DOMAIN` | `selfrunbusiness.com` (required) |
| `PLATFORM_WILDCARD_SUBDOMAINS` | `1` (the wildcard certificate covers every company address) |
| `NEXT_PUBLIC_APP_URL` | `https://www.selfrunbusiness.com` |
| `DOMAIN_PROVIDER` | `manual` |
| `SERVER_IP`, `EDGE_HOST` | The Elastic IP, `edge.selfrunbusiness.com` (the DNS instructions, A.6) |
| `MONGODB_URI` | `mongodb://selfrun:<pw>@mongo:27017/selfrun?authSource=selfrun` |
| `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD` | For the MongoDB container |
| `UPLOAD_DIR` | `/data/uploads` |
| `RUN_SCHEDULER` | `1` on exactly one app container |
| `CRON_SECRET` | Same as before (the scheduler uses it to call the cron URLs) |
| `PLATFORM_ENCRYPTION_KEY` (plus `HRMS_`, `FMS_`, `DLMS_`, `SMMS_ENCRYPTION_KEY` only if the live platform had set them) | **The same values as on the live platform** |
| `SAAS_ADMIN_EMAIL`, `SAAS_ADMIN_PASSWORD` | First staff account (only when the database has none) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Same pair as before |
| `OPENAI_API_KEY`, `OPENAI_CHATBOT_VECTOR_STORE_ID`, `CHATBOT_CRAWL_BASE_URL` | As today |
| `EMAIL_PROVIDER`, `EMAIL_FROM` | `ses` (or `resend`), the from address |
| `SES_SMTP_HOST`, `SES_SMTP_USERNAME`, `SES_SMTP_PASSWORD` | SES (Part 9) |
| `RESEND_API_KEY` | Only if you keep Resend |
| `HRMS_PAYOUT_PROVIDER` | As today (the Razorpay keys and billing webhook secret live in the database, set in the Platform Console) |
| `WALLET_CRON_SECRET`, `HRMS_API_SECRET`, `LEADS_API_SECRET`, `INDEXING_API_SECRET`, `CHATBOT_ADMIN_API_SECRET` | Only if you use them today |
| `MESSENGER_TURN_URL`, `MESSENGER_TURN_USERNAME`, `MESSENGER_TURN_CREDENTIAL`, `MESSENGER_CALL_MAX` | Only if you use a TURN relay (the same coturn setup can run on this server or a small separate one) |
| `GITHUB_REPOSITORY`, `GITHUB_DISPATCH_TOKEN`, `DESKTOP_BUILD_SECRET`, `DESKTOP_RELEASES_REPO`, `GITHUB_WORKFLOW_FILE`, `GITHUB_WORKFLOW_REF` | Desktop builds: unchanged |
| `META_*`, `GOOGLE_OAUTH_*`, `LINKEDIN_*`, `ELEVENLABS_API_KEY` | As today |
| `SAAS_OFFER_ENDS_AT`, `SAAS_OPERATOR_NAME`, `SAAS_*_EMAIL` | Optional, as today |
| `ACME_EMAIL`, `BRIDGE_SECRET`, `AWS_REGION` | For Caddy / the bridge |
| ~~`BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`~~ | **Removed** (files are on disk) |
| ~~`VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`~~ | **Removed** (Caddy attaches domains) |

---

## Appendix B: files you will touch or create

| Where | What |
| --- | --- |
| `src/lib/storage/blob.ts` + four files that used Blob | Files on the server's disk (A.1) |
| `RUN_SCHEDULER=1` (setting, no file to add) | The in-app scheduler that replaces Vercel Cron (A.2) |
| `src/app/api/internal/tls-ask/route.ts` | Lets Caddy ask which domains are real (A.3) |
| `next.config.ts`, `package.json`, `src/app/api/health/route.ts` | Standalone build, `sharp`, health endpoint (A.4) |
| `src/lib/platform/integrations/resolve.ts` | Add `ses` (A.5, optional) |
| `src/lib/platform/domains/self.ts` (+ where the Domains page builds its instructions) | The new DNS values for customers (A.6) |
| `Dockerfile`, `.dockerignore`, `.github/workflows/deploy-aws.yml` | Build and deploy (Part 8) |
| On the server: `/opt/selfrun/{.env, docker-compose.yml, Caddyfile, caddy/Dockerfile, mongo-init.js, backup.sh}` | The whole runtime (Parts 5 to 8) |
| `selfrun-bridge` repository (temporary) | Keeps customers' own domains working during the move (Part 15) |
| `vercel.json`, `src/lib/platform/domains/vercel.ts` | Removed at the end (Part 18) |
