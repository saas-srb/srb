# Application security gap assessment and remediation plan

Assessed against section 5 (code-level controls), section 6 (testing and release) and section 4 (documents) of the requirements. Each row says
what the code does today, where to verify it, and what is still open. Status words are explained in [README.md](./README.md).

Last review covered the whole `src/` tree, `next.config.ts`, `src/proxy.ts`, the build and CI configuration, and the dependency lockfile.

## 5. Code-level security controls

| # | Area | Status | What is in place (verify here) | What is still open |
| --- | --- | --- | --- | --- |
| 1 | **Authentication** | **Done** | Passwords: salted scrypt at the OWASP cost (N=2^15, r=8, p=3), parameters stored in each hash so the cost can be raised; old hashes still verify and are re-hashed at the next sign-in (`src/lib/security/password.ts`, `scripts/test-password.ts`). Policy for every new password: 10 to 200 characters, not a common password, not the email (`passwordPolicyError`, applied at sign-up, invitations and every change-password). Brute force: lock-out after 5 wrong passwords for 15 minutes, a generic error that does not reveal which accounts exist, IP rate limits on sign-in (`src/lib/hub-auth.ts`, `src/lib/security/gate.ts`). Two-step sign-in is each person's own choice (Profile & Settings): an authenticator app (encrypted secret, single-use codes, recovery codes, replay protection) or a 6-digit code sent to their email (10 minutes, single use, keyed hash, 5 tries, 30 s between codes, 5 an hour; `src/lib/security/two-factor.ts`, `email-otp.ts`). **MFA is required for Platform Console users** (sent to `/commandos/two-factor-setup` until it is on, unless `REQUIRE_PRIVILEGED_MFA=0`); company Super Admins choose for themselves unless the operator sets `REQUIRE_PRIVILEGED_MFA=1`. Account recovery goes through emailed, expiring links; a changed password ends the account's other sign-ins | Passwords of the older per-product sign-in modules are upgraded when the person next signs in through the central sign-in or changes the password. **Owner:** set `PLATFORM_ENCRYPTION_KEY` in production (the authenticator-app method needs it) and decide whether to set `REQUIRE_PRIVILEGED_MFA=1` for company Super Admins |
| 2 | **Authorization** | **Done** | Deny-by-default front door for every `/api/*` request and server action; roles and per-action permissions checked on the server in every page and action; per-company data scoping at the database layer so a query cannot leave its company (`src/lib/security/gate.ts`, `src/lib/platform/tenancy/scoped-db.ts`, `scripts/test-tenancy-isolation.ts`, `scripts/test-workspace-access.ts`) | Object-level checks live in each product's actions; a periodic review of new actions is part of [release-acceptance-criteria.md](./release-acceptance-criteria.md) |
| 3 | **Session security** | **Done** | `HttpOnly`, `Secure` (production), `SameSite=Lax` cookies; random 256-bit tokens stored only as SHA-256; 7-day expiry with database expiry; a new token on every sign-in; a session bound to the browser and network it first used (a copied cookie is revoked); the person can list and end sessions, sign out everywhere, and a changed password ends the other sign-ins (`src/lib/security/sessions.ts`, `session-bind.ts`) | None |
| 4 | **Data encryption** | **Partial** | In transit: HTTPS everywhere, HSTS with preload (`next.config.ts`). At rest: connection secrets, two-step secrets and vault documents are encrypted by the platform with AES-GCM under `PLATFORM_ENCRYPTION_KEY` (`src/lib/platform/crypto.ts`); files are stored private. | Database encryption at rest is the database provider's (Atlas) and must be confirmed in its settings. **Owner:** keep the key in the host's secret store, document the rotation procedure (see [policies/information-security.md](./policies/information-security.md)) |
| 5 | **API security** | **Done** | Origin and fetch-metadata checks (no CORS is ever sent), scripted-client refusal in production, per-IP and per-session rate limits with tighter limits on sign-in, forms and exports, signed webhooks (Razorpay HMAC) and bearer-protected cron, request validation, body size caps (`gate.ts`, `rate-limit.ts`, `safe-json.ts`) | The rate limiter fails open if the database is unreachable, by design, so an outage of the limiter does not take the site down |
| 6 | **Input validation** | **Done** | Request bodies on public endpoints reject any key starting with `$` or containing `.` (NoSQL operator injection) and cap size and depth; React escapes output; the few `dangerouslySetInnerHTML` uses are the company's own tracking snippets, theme CSS the platform generates, and JSON-LD produced by `jsonForScript`; server-side URL fetches go through `safe-fetch` (SSRF guard); uploads are checked by name and by content | A company's custom tracking code is trusted by design (it is the company's own site); it now loads only after consent |
| 7 | **Web security** | **Partial** | HTTPS, HSTS (2 years, subdomains, preload), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, COOP, and a Content-Security-Policy on every response: `frame-ancestors 'self'`, `base-uri`, `form-action https`, `object-src 'none'`, `upgrade-insecure-requests` (production); API responses carry `script-src 'none'` (`next.config.ts`) | **A `script-src` is not set on pages.** Companies add their own tracking scripts and chat widgets on their websites, which a fixed script policy would break, and Next's inline scripts need nonces. Planned: a nonce-based `script-src` for the product's own website and the signed-in apps (where no company code runs), starting in report-only mode |
| 8 | **Database security** | **Partial** | Every query is scoped to its company; connection string only from the environment; indexes and TTLs created in code | Least-privilege database user and the network allow-list are Atlas settings. **Owner:** an application user limited to the application's database, no `0.0.0.0/0` allow-list (the Vercel docs describe the safe setup) |
| 9 | **Secrets management** | **Partial** | No secrets in the repository (`npm run security:scan` runs on every change; `.env*` is ignored); production secrets live only in the host's environment; per-company integration keys are encrypted in the database | Rotation is by procedure, not automated. **Owner:** rotate on the schedule in the information-security policy; use the host's secret store (Vercel environment variables or a vault) |
| 10 | **File upload security** | **Partial** | Every upload passes `src/lib/storage/upload-scan.ts`: type verified by name and bytes, programs, scripts, macro documents, dangerous PDFs/SVG/HTML and archive bombs refused, size limits, EICAR detection, optional VirusTotal hash lookup; files stored private and served only through permission-checked routes (`scripts/test-upload-scan.ts`) | It is not a full antivirus engine for unknown malware. Planned: an optional ClamAV/commercial scanning step before storage when the platform runs on its own server |
| 11 | **Privacy engineering** | **Done** | Data minimisation in forms; consent: companies' websites ask before loading analytics or advertising tags, record the choice with a version and date, and let the visitor change it (`SiteConsent.tsx`, `/api/consent`, `site_consent_records`); data-subject requests: public page and form with a reference, a 30-day due date stored with the request and an acknowledgement email (`/data-requests`, `saas_inquiries` with `kind: "privacy"`); retention and deletion: 30-day company deletion with restore, 30-day safety copies, backup rotation, 180-day sign-in records, three-year consent evidence; export of company data | The platform's own marketing site sets no analytics or advertising cookies. **Owner:** answer privacy requests inside 30 days ([policies/dsr-procedure.md](./policies/dsr-procedure.md)) |
| 12 | **Logging and monitoring** | **Partial** | Audit logs of sign-ins, changes, exports and administrative actions per company, and a platform audit log of every Platform Console change (secret-free by design); sign-in and security events kept 180 days; the AI agent's record reader redacts secret-looking fields; a public status page and incident notices | Alerting is by the status page and the host's logs. **Owner:** ship logs to a destination that keeps them 180 days (India's CERT-In directions) and set alerts on error rates and failed sign-ins |
| 13 | **Infrastructure security** | **Owner** | The application assumes a managed edge (Vercel): TLS, DDoS absorption, no open database port; headers and rate limits as above | **Owner:** enable the edge firewall/WAF rules in the host's dashboard, restrict the database network, least-privilege cloud IAM for the deployment token |
| 14 | **Backup and recovery** | **Done** | Scheduled and manual backups per company, retention (eight scheduled, ten manual), restore with a safety copy, wipe and delete with a 30-day grace (`src/lib/products/commandos/backups.ts`, `data-lifecycle.ts`, `scripts/test-backups.ts`) | **Owner:** run the restore test in [policies/business-continuity-dr.md](./policies/business-continuity-dr.md) on a schedule and keep the result |
| 15 | **Secure development lifecycle** | **Partial** | CI runs on every change and weekly: CodeQL static analysis, `npm audit` of production dependencies (fails on high or critical), dependency review on pull requests, secret scan (`.github/workflows/security.yml`); `SECURITY.md` and `security.txt` for reporting | **Owner:** turn on branch protection with required reviews and required status checks for `main` (GitHub → Settings → Branches), and enable secret scanning push protection |

## Testing and release gates (section 6)

| # | Assessment | Status | How it is covered |
| --- | --- | --- | --- |
| 1 | SAST | **Done** | CodeQL, `security-extended` queries, on every push, pull request and weekly |
| 2 | SCA | **Done** | `npm audit --omit=dev --audit-level=high` and dependency review; the build tools for the desktop and mobile apps are audited too |
| 3 | Secret scanning | **Done** | `scripts/scan-secrets.mjs` over every tracked file in CI |
| 4 | DAST | **Partial** | `.github/workflows/dast.yml` runs an OWASP ZAP baseline scan against the production address when the repository variable `DAST_TARGET_URL` is set |
| 5 | API security testing | **Partial** | Authorization and tenancy are tested by `scripts/test-tenancy-isolation.ts`, `test-workspace-access.ts`, `test-platform-roles.ts`; abuse protections by the gate. **Owner:** include the API in the independent penetration test |
| 6 | Infrastructure and container scanning | **Open** | No repository or image scanner runs in CI (Trivy was removed). **Owner:** scan the production image if the AWS/Docker deployment is used |
| 7 | Privacy workflow testing | **Done** | `scripts/test-privacy.ts` (consent gate rules, request validation) and the retention and deletion tests in `scripts/test-backups.ts` |
| 8 | Independent penetration testing | **Owner** | Before launch and yearly, with remediation and a retest; record in [certification-readiness.md](./certification-readiness.md) |
| 9 | Incident response exercises | **Owner** | A yearly exercise from [policies/incident-response.md](./policies/incident-response.md); `scripts/test-incidents.ts` covers the status-page mechanics |
| 10 | Backup restoration testing | **Owner** | Quarterly, per [policies/business-continuity-dr.md](./policies/business-continuity-dr.md) |

Release rule: a critical or high finding from any gate blocks the release until it is fixed and re-tested ([release-acceptance-criteria.md](./release-acceptance-criteria.md)).

## Documents (section 4)

| # | Document | Status | Where |
| --- | --- | --- | --- |
| 1 | Privacy Policy | **Done** | `/privacy`: controller and contact, lawful bases, international transfers, retention periods, rights by region, children, automated decisions |
| 2 | Terms and Conditions | **Partial** | `/terms`. **Owner:** governing law, courts and the registered entity's address |
| 3 | Cookie Policy and consent mechanism | **Done** | `/cookies` (accurate to the cookies actually set) and the consent banner on companies' websites |
| 4 | Refund and Cancellation Policy | **Done** | `/refund-policy`. **Owner:** counsel to confirm UK consumer rules do not apply to business-only sales |
| 5 | Data Processing Agreement | **Done** | `/dpa`. **Owner:** counsel review and, for enterprise customers, a signed copy |
| 6 | Data Retention and Deletion Policy | **Done** | `/data-policy`, [policies/data-retention-deletion.md](./policies/data-retention-deletion.md) |
| 7 | Data Breach and Incident Response Policy | **Done** | [policies/incident-response.md](./policies/incident-response.md), `/security`, `/status` |
| 8 | Information Security Policy | **Done** | [policies/information-security.md](./policies/information-security.md) |
| 9 | Vendor and Third-Party Risk Policy | **Done** | [policies/vendor-risk.md](./policies/vendor-risk.md), `/subprocessors` |
| 10 | Business Continuity and DR Plan | **Done** | [policies/business-continuity-dr.md](./policies/business-continuity-dr.md) |
| 11 | Access Control and Password Policy | **Done** | [policies/access-control-and-passwords.md](./policies/access-control-and-passwords.md) |
| 12 | Vulnerability Management Policy | **Done** | [policies/vulnerability-management.md](./policies/vulnerability-management.md), `/vulnerability-disclosure` |
| 13 | Data Subject Request Procedure | **Done** | [policies/dsr-procedure.md](./policies/dsr-procedure.md), `/data-requests` |
| 14 | International Data Transfer Register | **Done** | [policies/international-transfer-register.md](./policies/international-transfer-register.md) (**Owner** to complete the regions and signed terms) |
| 15 | Consent and Marketing Records | **Done** | [policies/consent-and-marketing-records.md](./policies/consent-and-marketing-records.md) |

## Remediation plan, in order

1. **Before launch (blocking):** set `PLATFORM_ENCRYPTION_KEY`; enable branch protection; restrict the database network and user; commission the penetration test; counsel reviews the public legal pages; set the privacy and security mailboxes and the operator name.
2. **First month:** nonce-based `script-src` in report-only mode for the product website and the signed-in apps; ship logs to a 180-day destination with alerts; run the first restore test and the first incident exercise.
3. **First quarter:** enforce the `script-src`; add a scanning engine for uploads if the platform runs on its own server; complete the transfer register with regions and signed terms; decide on ISO/IEC 27001 and SOC 2.
4. **Every release:** the checks in [release-acceptance-criteria.md](./release-acceptance-criteria.md).

## Findings fixed in this review

| Finding | Fix |
| --- | --- |
| Password hashing below the OWASP minimum cost | New cost and self-describing hashes, re-hash at sign-in (`password.ts`) |
| No password policy beyond length (8 in one place) | One policy everywhere, including common-password and email checks |
| MFA optional for privileged accounts | Required for Super Admins and Platform Console users |
| Authenticator app showed "SelfRun" for every company | Shows the company's own name |
| Other sign-ins survived a password change | Ended on change |
| Companies' analytics and advertising tags loaded with no consent | Consent banner, nothing loads before agreement, choice recorded and changeable |
| Cookie and privacy pages claimed "first-party analytics" that did not exist | Corrected |
| Privacy Policy lacked controller contact, lawful bases, transfers, retention periods, regional rights, children | Added |
| No public DPA, sub-processor list, data-request channel or vulnerability policy | Added with a working request form, reference numbers and a 30-day due date |
| No `security.txt`, `SECURITY.md` | Added |
| No dependency, SAST or secret scanning in CI | Added; `shadcn` (build tool) moved out of production dependencies, which cleared the high and critical advisories from the production audit |
| CSP lacked `object-src` and `upgrade-insecure-requests`; HSTS lacked `preload` | Added |
