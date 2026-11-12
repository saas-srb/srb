# Moving to another Vercel account (bina kuch kiye)

The database stays the same. A deployment needs only **`MONGODB_URI`** and **`SAAS_HOSTS`**; everything else is found in the database or worked out by the app.

## The whole flow: push code, deploy, open Console, paste one token

**Once, before the first move (in the CURRENT Vercel project):** push this code and let the current project deploy it. On its first start it copies every setting that lives only in that project's environment variables (Blob token, email, AI, voice, Razorpay, GitHub, desktop-build secret, the legacy HR/Finance/Vault/Social keys, the Vercel token of that account and its project id as the "previous project") into the database, encrypted by the database keyring. Most of those variables are Vercel "sensitive" (unreadable after creation), so running the new code inside the old project is the only way to adopt them. Console, Health shows "Adopted from environment: N settings" and has an "Import from environment" button to repeat it. It never overwrites a value already in the database.

**Every move after that (any new Vercel account or project):**

1. New Vercel project from the same repository, add `MONGODB_URI` and `SAAS_HOSTS` (the only two), deploy. Nothing else is set.
2. Open the Console. The deployment finds everything by itself: keys, settings, platform admin, its own project id, the platform hosts (root, www, app, wildcard, derived from `SAAS_HOSTS`), and starts attaching every business and customer domain.
3. Paste **one** API token created in the new Vercel account (Integrations, Domains & hosting). That is the only unavoidable manual item, together with DNS authority (below).
4. Done. Console, Dashboard / Health lists anything still open.

## What is automatic and what stays manual

| Item | How |
| --- | --- |
| Encryption keys (Console secrets, bank / vault / social fields) | Automatic: keyring in the database (below). |
| Platform admin and sign-in | Automatic: existing staff are never overwritten; env only seeds when no staff exists; empty database shows `/setup`. |
| Scheduled jobs without `CRON_SECRET` | Automatic: see "Cron" below. |
| Vercel project id / team id | Automatic (system variable `VERCEL_PROJECT_ID`; team found by asking the token). |
| Domain attach for every business and customer domain | Automatic once a token exists (Domain sync). |
| Wildcard `*.<root>` detection | Automatic (seen by Domain sync; `PLATFORM_WILDCARD_SUBDOMAINS` stays as an override, `0` forces it off). |
| Platform hosts (bare domain redirecting to www, `www`, `app`, wildcard) | Automatic: derived from `SAAS_HOSTS`, attached by Domain sync, status shown in Domains & SSL. |
| Settings that only lived in the old project's environment | Automatic: adopted into the database (see above). |
| Files (resumes) | Automatic: stored in the database (GridFS); old Blob files are copied in. |
| **DNS authority of the root domain** | Manual, once (see below). |
| **An API token from the new Vercel account** | Manual, once (needed to attach customer domains; the earlier account's token is kept only to release hosts and copy DNS). |
| TXT records of customer domains still owned by another account | Manual by the domain owner (listed in Console and on the company's Domains page). |

## Environment variables: audit

Every non-`NEXT_PUBLIC` variable read in `src` (plus `instrumentation`, `proxy`, cron, crypto, config store, integrations), by class.

| Class | Variables | Why |
| --- | --- | --- |
| **Bootstrap (the only required two)** | `MONGODB_URI`, `SAAS_HOSTS` | Needed before the database can be read; they also derive the key-encryption key. |
| Derivable from the database | `PLATFORM_ENCRYPTION_KEY` (keyring), `CRON_SECRET` (optional; DB copy or Vercel-cron fallback), `PLATFORM_ROOT_DOMAIN` (Console, or the production domain), `PLATFORM_WILDCARD_SUBDOMAINS` (detected), `VERCEL_API_TOKEN` / `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` (Console / detected), `RESEND_API_KEY`, `EMAIL_*`, `DOMAIN_PROVIDER` (Console), every AI / voice / push / Twilio / storage key in the Console server-keys store (`BLOB_READ_WRITE_TOKEN`, `VAPID_*`, ...), Razorpay keys and webhook secrets (Console, Payments) | Saved encrypted in the database. |
| First-start seed only | `SAAS_ADMIN_EMAIL`, `SAAS_ADMIN_PASSWORD` | Only used when no platform staff exist; otherwise ignored. |
| Per-deployment optional (safe to be absent or different) | `VERCEL`, `VERCEL_URL`, `VERCEL_API_URL`, `NODE_ENV`, `PORT`, `NEXT_RUNTIME`, `RUN_SCHEDULER`, `SESSION_BIND_IP`, `SECURITY_STRICT`, `REQUIRE_PRIVILEGED_MFA`, `TWO_STEP_*`, `PAYMENT_CODE_DISABLED`, `ALLOW_LOCAL_APP_BUILDS`, `FFMPEG_PATH`, `*_FONT_DIR`, `META_*_VERSION`, `LINKEDIN_API_VERSION`, `WEBSITE_AI_*`, `PANEL_AI_MODEL`, `AI_WEBSITE_ON_SIGNUP`, `SAAS_*` contact / brand texts, `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `SMMS_PUBLIC_BASE_URL`, `CHATBOT_CRAWL_BASE_URL`, `MESSENGER_CALL_MAX`, `HRMS_PAYOUT_PROVIDER` | Tuning or branding with defaults. |
| Per-deployment secrets for optional machine endpoints | `LEADS_API_SECRET`, `HRMS_API_SECRET`, `PMS_API_SECRET`, `INDEXING_API_SECRET`, `CHATBOT_ADMIN_API_SECRET`, `DESKTOP_BUILD_SECRET`, `GITHUB_*`, `WALLET_CRON_SECRET`, `API_TRANSPORT_SECRET` | Each is only for that integration; absent = that endpoint stays closed (bearer never matches) or uses the keyring-derived secret (`API_TRANSPORT_SECRET`). Set again in the new project only if you use them. |
| Legacy fallbacks (never needed) | `SMMS_/DLMS_/FMS_/HRMS_ENCRYPTION_KEY`, `*_PREVIOUS`, `CHATBOT_IP_SALT`, `RAZORPAY_*`, `TWITTER` ... | Old per-module keys: still honoured if set, for data sealed with them. |

Session cookies are random ids stored in the database (no signing secret). Signed values (media URLs, public-agent tokens, the encrypted-transport key, email OTP hashes, phone-number hashes) derive from the keyring, so they are the same on every deployment. Values that must stay comparable forever (phone hashes) use the oldest key version.


## The encryption key must be VERIFIED before a cutover (and what to do when the alert shows)

Moving to a new project is safe only if the deployment's `PLATFORM_ENCRYPTION_KEY` is the ORIGINAL one, or the original has been adopted into the database first. A wrong key (for example a local development key) cannot damage anything, but it cannot open what the real key sealed (authenticator secrets, saved keys). The app therefore checks every key against the encrypted data that already exists:

- **verified**: opens at least one existing encrypted value, or was created on a database that had none.
- **unverified**: an environment key that opens none of the existing encrypted data. It is stored (decrypt-only) but never made the active key silently; the Console shows a persistent **Encryption key mismatch** alert with the count of values that cannot be opened.
- When the original key arrives later (any deployment's environment, or Console, Health, **Add previous encryption key**, which only accepts a key that really opens existing data) it is verified and becomes active; the unverified one stays decrypt-only. Nothing is ever deleted or overwritten, and a keyring that cannot be unwrapped with the current database URI / `SAAS_HOSTS` is never written to (read-only "locked" mode with a clear error).

**Before the cutover:** check Console, Health in the OLD project (or run `npm run portability:check` against a throwaway copy): "Encryption keys" must show no mismatch. Deploy the new code in the old project once so it adopts the key into the database. **If the alert shows on the new project:** deploy this code once in the old project, or paste the original key under "Add previous encryption key". Meanwhile nobody is locked out (below).

## Customers never see any of this

The key alerts live ONLY in the staff Platform Console (Health, Setup status, the dashboard card, a Console notification and the audit log). The sign-in page, the product screens, the public site and every customer-visible message use calm wording with no mention of keys, servers, deployments, Vercel or environment variables (`scripts/test-no-infra-leak.ts` fails if that changes, and also that the alert component is mounted only under the staff Console layout). A deployment with a different or missing `PLATFORM_ENCRYPTION_KEY` after the keyring holds a verified key produces no alert and no visible effect: the extra key is simply recorded decrypt-only.

When a person's authenticator can't be checked they see only "We couldn't verify this code" with the other ways in. Quietly, a "Two-step reset needed" item (who/when) is queued for staff (Console, Health, with a one-click reset, a Console notification, an audit event, and an email to staff when a provider exists). The owner tool `npm run twofactor:doctor` lists everyone whose two-step secret NO key can open (masked email and company; read-only by default); `-- --apply` (and typing the database name) clears only those people's `twoFactor`/`twoFactorPending` fields after writing a JSON backup, audits it and sends a notice when possible. It refuses when the keyring is locked or has no verified key and never touches anyone whose secret opens with any key.

## Second step with several methods, step-up re-authentication and policy

- **Methods:** every account can have any mix of an authenticator app, an email code and recovery codes (older `twoFactor` / `twoFactorEmail` documents work unchanged; new data is in `secondStep`). After the password the preferred method is asked first and "Try another way" lists the others with masked destinations; switching needs no new password. A method that fails or is unavailable (unreadable authenticator, email down, lost phone) surfaces the others in customer-safe words and is never counted as a failed login. Wrong codes are rate-limited per method (10 per 10 minutes).
- **Manage methods:** Security settings and the profile panel (`TwoStepSettings`): set up or replace the authenticator (QR and key), turn email codes on or off, make new recovery codes (shown once, copy/download/print), choose the preferred method, remove trusted devices. The last method can't be removed when a second step is required.
- **Step-up re-authentication:** one mechanism (`ReAuthGate`, `useReAuth`, `reauthAction`): password plus any method the person has, valid for N minutes (default 10, Console, Health, policy). It is a signed cookie bound to the user and session. Method changes, the key backup / rotation / add-key actions, and the danger-zone confirmation use it.
- **Policy (Console, Health):** email codes allowed (default yes), second step required for admins (default no), "trust this device" (default OFF, hashed token, revocable), re-confirm window; a company can have its own override.
- **Notices:** every change to methods or recovery codes is audit-logged (`second_step.*`) and emailed to the account when a provider exists.

## Sign-in when the authenticator can't be opened (key mismatch)

If a person's two-step secret can't be opened on this deployment, sign-in does NOT say "wrong code", does NOT count a failed attempt and never locks the account. It shows "two-step is temporarily unavailable on this deployment" and offers, in order:

1. a **recovery code** (stored as a hash, works without the key);
2. an **email code** to the account's verified address, when an email provider is configured (rate-limited; a notice email follows);
3. **platform staff only, break-glass:** sign in with this deployment's own `SAAS_ADMIN_EMAIL` and `SAAS_ADMIN_PASSWORD` (exact match, constant-time; only when the secret is unreadable; it never bypasses a readable second step);
4. **company admins:** platform staff reset their two-step in Console, Health, "Reset someone's two-step sign-in" (audited, notice email); a company's own owner can still reset others in the company's Users page.

After any of these, the unreadable secret is removed and setting two-step up again is REQUIRED at once (the new secret is sealed with the active verified key). Events are audit-logged (`two_step.break_glass`, `two_step.recovered_key_mismatch`, `two_step.staff_reset`).

## Key backup, recovery passphrase and rotation (Console, Health)

- **Encryption key backup:** after re-authentication (password plus second step, or break-glass when the authenticator can't be checked) the active key is shown once with a warning and a copy button; the reveal is audit-logged and the Setup status shows "Encryption key backed up (last shown date)".
- **Recovery passphrase (optional):** an extra copy of all keys sealed with a passphrase you keep. If the database URI or `SAAS_HOSTS` ever changes and the old URI is lost: `KEY_PASSPHRASE=... MONGODB_URI=... SAAS_HOSTS=... npm run key:rewrap`.
- **Rotate encryption key (one click, re-authenticated):** a fresh random key becomes the active verified key; all older keys stay decrypt-only; stored secrets are re-sealed in the background (and by the daily job) with progress shown. Show and keep the new key afterwards.

## Encryption keyring (how nothing is lost)

- All key versions are stored in `platform_settings` (`_id: "keyring"`), each wrapped with AES-256-GCM by a key-encryption key (KEK) derived with scrypt from the normalised `MONGODB_URI` (credentials included, host order and options ignored) + `SAAS_HOSTS` + a fixed label.
- Boot cases: env key and no keyring, it is escrowed as version 1. No env key, keyring present, it is unwrapped. Nothing anywhere and an empty database, a key is generated. Nothing anywhere but the database holds data, the app **does not generate** (that would orphan data): the Console and the sign-in page show "Provide the old PLATFORM_ENCRYPTION_KEY once"; set it, redeploy, and it is stored. A different env key is added as a NEW version (old versions are kept and still decrypt; new data is sealed with the newest). Ciphertext carries its key id (`k`); older ciphertext without one is tried against every version; values are re-sealed when written again.
- If the MongoDB password is rotated the KEK changes. The Console shows "The stored encryption keys can't be opened". Run once: `OLD_MONGODB_URI=<old> MONGODB_URI=<new> SAAS_HOSTS=<hosts> npm run key:rewrap` (add `--dry` to check first). Set `PLATFORM_ENCRYPTION_KEY` in the environment meanwhile if you still have it.
- **Honest trade-off:** the key is no longer only in the environment. Anyone who has both a copy of the database AND the MongoDB URI (and `SAAS_HOSTS`) can open the keys, so the database is no longer protected against a party that holds the URI. Before, a stolen database dump was useless without the separate key. We accept this for portability. To keep the old strength, keep setting a separate `PLATFORM_ENCRYPTION_KEY` in the environment: a key that is in the keyring but not used as the active one is the weaker spot, so the recommended hardening is to keep the env key AND rotate the MongoDB password if the URI ever leaks. Use a dedicated MongoDB user for this app, with IP allow-listing.

## Cron without CRON_SECRET

Vercel only sends `Authorization: Bearer` when `CRON_SECRET` exists in the project. Without any secret (environment or Console) a job accepts Vercel's own call (user agent `vercel-cron/1.0`, on the site's host) but only if it has not run for half its interval, and the database lease still applies, so a spoofed call cannot cause extra runs. A bearer secret (environment or Console) always works and, once any secret exists, is the only way in.

## Files (resumes and other private files): they travel with the database

Vercel Blob belongs to a Vercel account, so the default file backend is now **MongoDB GridFS in the same database** (collections `storage.files` / `storage.chunks`; the `storageKey` such as `resumes/<uuid>.pdf` is the GridFS file name, so nothing in the data changed). New uploads go there (private-only, upload safety scan, plan storage metering and limits unchanged). Reads look in the database first; a legacy file that is still only in Blob is read with the saved Blob token and copied into the database while it is served. A resumable background copier (driven by the daily `domains` job, Console Health, and first boot) copies the rest, verifies sizes and never deletes from Blob. Console, Health and the Setup status show the backend and "copied x/y". Vercel Blob stays an optional backend: set File backend to `blob` in Integrations, File storage. Backups are stored the same way, so a database copy contains them. Browser-direct uploads for social-media and website images still need a Blob store (an optional feature).

The older Blob-to-Blob "Migrate from another Blob store" tool is still there for people who want to stay on Blob.

## Platform hosts, DNS authority and neutral DNS

Platform hosts are derived from `SAAS_HOSTS` and attached automatically; the bare domain is attached as a redirect to `www`. Domains & SSL shows each one (attached, verified, DNS ok). "Where is the DNS?" reads the root domain's zone location from Vercel and says in plain words what to do:

- **Zone in this Vercel account:** nothing to do.
- **Zone in another Vercel team:** use Vercel's one-click "Transfer to another team" for the domain, or the "Copy DNS records to this account" tool (needs the earlier account's token under Previous Vercel project; reads that zone, creates the missing records here, dry run first, never deletes, skips NS/SOA and records Vercel manages), then move the nameservers.
- **External DNS:** fine; no wildcard attach is needed (Domain sync attaches each company host).
- **Recommended long term (neutral DNS):** keep the DNS zone at the registrar or Cloudflare with `*.root` and the platform hosts as CNAME to `cname.vercel-dns.com`, so DNS never moves with the Vercel account. Domain sync then only has to attach hosts to the project.

## Hobby limits

The production build produces 8 serverless functions (Hobby allows 12; it was 10 before all `maxDuration` values were unified to 300) and `vercel.json` holds only once-a-day cron schedules. `npm run check:functions` repeats this offline (no token, no Vercel API): it builds a temporary copy with a fake project link, counts the distinct functions and fails above 10 or if a cron is more frequent than daily. All `maxDuration` values are 300 so routes do not split into separate functions.

## Domain sync details

Console, Domains & SSL: **Sync all domains now** (tick Dry run to preview). It shows `Sync running x/y`, a log, and cards for total, attached, verified, SSL active, needs DNS, owned elsewhere and failed. Owned elsewhere: Vercel says another project still holds the address (the optional previous-project section releases it automatically), or the owner publishes the TXT record shown. Retry tries one host; Export CSV lists them all. Safe to press repeatedly.

## Checking it works: portability check

`PORTABILITY_MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_portability npm run portability:check` runs, in child processes with a clean environment, an "old deployment" (full env) and a "new deployment" (only `MONGODB_URI` and `SAAS_HOSTS`) against throwaway databases (it refuses any name without `zz_throwaway` or `portability`, never reads `.env.local`, and drops them afterwards). It prints PASS/FAIL for: boot, keyring escrow and unwrap, saved config decrypts, staff sign-in works and is not overwritten, signed tokens verify, cron auth without a secret, fresh database key generation, and refusal to generate a key on a non-empty database. The live version of these checks is on Console, Dashboard / Health ("Setup status").

## Rollback

Nothing is deleted anywhere. To go back, point the old project at the same database (it keeps working: its env key, if different, is just another key version), put the old token in Integrations so Domain sync attaches everything there again, and for files switch the Blob token back. The old Blob store is never touched.
