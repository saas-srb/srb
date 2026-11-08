# Compliance and security: what is in place, what is not, and what only the owner can do

This folder is the working record of how SelfRunBusiness meets the requirements in *International Compliance and Security Requirements*,
read for the market the product is sold in: India (see [legal-applicability-register.md](./legal-applicability-register.md)). It is written to be checked: every statement points
at the code, page or procedure it rests on.

> **No system can guarantee 100% security, and a code review cannot make a company "compliant".** What this folder shows is the technical and
> documentary side, kept honest. Whether a law applies, a certification is worth pursuing, or a clause is acceptable is a decision for the owner
> and their legal adviser; those items are marked **Owner**.

## How to read the status words

| Word | Meaning |
| --- | --- |
| **Done** | Built, working and verifiable in this repository |
| **Partial** | Built, but one part of the requirement still needs work, stated next to it |
| **Gap** | Not built; the remediation is listed |
| **Owner** | Needs a decision, a contract, a certificate or an action outside the code |

## The documents

| Deliverable (section 9 of the requirements) | Where |
| --- | --- |
| Country-wise legal applicability and compliance register | [legal-applicability-register.md](./legal-applicability-register.md) |
| International security standards mapping | [standards-mapping.md](./standards-mapping.md) |
| Application security gap assessment, code-level remediation plan | [gap-assessment.md](./gap-assessment.md) |
| Data inventory and data-flow documentation | [data-inventory.md](./data-inventory.md) |
| Privacy policies and consent workflows | The public pages below, and `docs/compliance/policies/consent-and-marketing-records.md` |
| Data retention, deletion and data-subject request procedures | [policies/data-retention-deletion.md](./policies/data-retention-deletion.md), [policies/dsr-procedure.md](./policies/dsr-procedure.md) |
| Security testing reports and remediation evidence | [gap-assessment.md](./gap-assessment.md) (section "Testing and release gates"), CI runs of `.github/workflows/security.yml` |
| Incident response and disaster recovery documentation | [policies/incident-response.md](./policies/incident-response.md), [policies/business-continuity-dr.md](./policies/business-continuity-dr.md) |
| Certification readiness assessment | [certification-readiness.md](./certification-readiness.md) |
| Production security acceptance criteria and ongoing monitoring | [release-acceptance-criteria.md](./release-acceptance-criteria.md) |

The other policies of section 4 of the requirements: [information-security](./policies/information-security.md),
[access-control-and-passwords](./policies/access-control-and-passwords.md), [vulnerability-management](./policies/vulnerability-management.md),
[vendor-risk](./policies/vendor-risk.md), [international-transfer-register](./policies/international-transfer-register.md).

## The public pages

| Page | Requirement it serves |
| --- | --- |
| `/privacy` | Privacy Policy |
| `/terms` | Terms and Conditions |
| `/cookies` | Cookie Policy |
| `/refund-policy` | Refund and Cancellation Policy |
| `/data-policy` | Data retention and deletion, ownership, export |
| `/security`, `/sla`, `/status` | Security and trust, availability, incidents |
| `/dpa` | Data Processing Agreement (addendum) |
| `/subprocessors` | Vendor list and international transfers |
| `/data-requests` | Data Subject Request Procedure (with the request form) |
| `/vulnerability-disclosure`, `/.well-known/security.txt` | Vulnerability reporting |

## What the owner must supply or decide (nothing in the code can do this)

1. The legal entity that operates the product (`SAAS_OPERATOR_NAME`), its registered address, and the governing law and courts for the Terms.
2. A named person for privacy (a Data Protection Officer where UK/EU/UAE rules require one, and the grievance officer India's DPDP Act requires), and the
   privacy mailbox (`SAAS_PRIVACY_EMAIL`, default `privacy@<domain>`) actually being read.
3. Counsel's review of every legal text above, in particular the DPA, the retention periods, and the cross-border transfer statements.
4. Signed data processing terms with each provider on the sub-processor list, and the regions the database and hosting run in.
5. An independent penetration test before launch and yearly, a decision on ISO/IEC 27001 and SOC 2, and a PCI DSS self-assessment (SAQ A) for the payment flow.
6. Platform settings: branch protection and required reviews on GitHub, a WAF/rate rules on the edge, a retained log destination, and the secrets listed in
   [gap-assessment.md](./gap-assessment.md).

Keep this folder current: when a control, a page or a provider changes, change the matching document in the same commit.
