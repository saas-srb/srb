# International security standards mapping

How the controls in this repository line up with each standard in section 2 of the requirements. These are **mappings, not certificates**: none of
these standards is claimed as achieved anywhere on the website. Their applicability depends on the business model and customer contracts.

## ISO/IEC 27001:2022 (Annex A themes)

| Theme | How it is covered | Status |
| --- | --- | --- |
| Organizational (policies, roles, suppliers, incidents, continuity, legal) | [policies/](./policies/), [vendor-risk](./policies/vendor-risk.md), [incident-response](./policies/incident-response.md), [business-continuity-dr](./policies/business-continuity-dr.md), [legal register](./legal-applicability-register.md) | Documents done; **Owner** to adopt them formally, assign roles and hold management review |
| People | Roles and least privilege inside the product; MFA for privileged accounts | **Owner** for HR screening, training and agreements |
| Physical | Provided by the cloud hosting provider | **Owner** to review the provider's attestation |
| Technological (access, cryptography, logging, secure development, network, backup) | [gap-assessment.md](./gap-assessment.md) sections 5 and 6 | Mostly done; open items listed there |

Certification needs an ISMS with a risk register, internal audit, management review and an accredited audit: see [certification-readiness.md](./certification-readiness.md).

## ISO/IEC 27701:2025 (privacy information management)

| Clause | How it is covered |
| --- | --- |
| Controller obligations | `/privacy`, consent records, `/data-requests`, retention ([policies/data-retention-deletion.md](./policies/data-retention-deletion.md)) |
| Processor obligations | `/dpa`, `/subprocessors`, instructions and sub-processor controls, breach notice |
| Records of processing | [data-inventory.md](./data-inventory.md), [international-transfer-register.md](./policies/international-transfer-register.md) |

## OWASP ASVS 5.0

| Area | Coverage |
| --- | --- |
| Authentication, credentials, MFA, recovery | scrypt, password policy, lock-out, mandatory MFA for privileged accounts, emailed single-use reset |
| Session management | httpOnly/secure/sameSite cookies, hashed tokens, binding, revocation, expiry |
| Access control | Server-side roles and permissions, per-company scoping, tested (`test-tenancy-isolation.ts`) |
| Validation, encoding, injection | Operator-key rejection, output escaping, SSRF guard, upload checks |
| Cryptography, secrets | AES-GCM for stored secrets, TLS and HSTS, secret scanning |
| Error handling and logging | Generic errors, audit logs, redaction |
| Data protection, privacy | Private file storage, retention, deletion, consent |
| Communications, files, API, configuration | Headers and CSP, upload scanner, rate limits, signed webhooks |
| Verification | CodeQL, dependency audit, ZAP baseline, independent test (**Owner**) |

## OWASP Top 10 (2021)

| Risk | Control |
| --- | --- |
| A01 Broken access control | Deny-by-default gate, server-side permissions, tenant scoping |
| A02 Cryptographic failures | TLS/HSTS, encrypted secrets, scrypt |
| A03 Injection | Operator-key rejection, no string-built queries, output escaping |
| A04 Insecure design | Threat-driven controls (session binding, lock-out, upload rules) |
| A05 Security misconfiguration | Headers, CSP, no powered-by header; platform settings are **Owner** items |
| A06 Vulnerable components | npm audit, dependency review |
| A07 Authentication failures | Policy, lock-out, MFA, session controls |
| A08 Integrity failures | Signed webhooks, locked dependencies, CI gates |
| A09 Logging and monitoring failures | Audit logs, status page; central alerting is an **Owner** item |
| A10 SSRF | `safe-fetch` for server-side requests |

## NIST Cybersecurity Framework 2.0

| Function | Where |
| --- | --- |
| Govern | [policies/information-security.md](./policies/information-security.md), this register |
| Identify | [data-inventory.md](./data-inventory.md), [vendor-risk.md](./policies/vendor-risk.md) |
| Protect | Section 5 controls |
| Detect | Audit logs, status page, CI scanning, ZAP |
| Respond | [incident-response.md](./policies/incident-response.md) |
| Recover | Backups, restore, [business-continuity-dr.md](./policies/business-continuity-dr.md) |

## CIS Critical Security Controls

Inventory of software (lockfiles, dependency tracking) · data protection (encryption, retention) · secure configuration (headers, CSP) · account and access
management (roles, MFA) · vulnerability management (audit, CodeQL) · audit log management (audit logs, 180-day sign-in records) · email and
browser protections (secure cookies, headers) · data recovery (backups) · application software security (the SDLC gates). Network, malware-defence and
penetration-test controls are infrastructure or **Owner** items.

## PCI DSS 4.0.1

Card data is entered on Razorpay's hosted checkout and never reaches the application, its logs or its database, which puts the payment flow in the
simplest self-assessment (SAQ A). The application serves the page that loads the provider's script from the provider's own domain; keeping that page
free of third-party script is part of the requirement. **Owner:** complete and file the yearly SAQ A.

## SOC 2

The security, availability and confidentiality criteria map to the same controls. A SOC 2 Type II report needs a period of operating evidence and an
independent auditor: [certification-readiness.md](./certification-readiness.md).
