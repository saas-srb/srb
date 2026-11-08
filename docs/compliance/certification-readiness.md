# Certification readiness

Nothing here is certified and the website does not say so. This lists what each certification needs beyond the code.

| Certification | What the code already gives | What is still needed (owner) |
| --- | --- | --- |
| ISO/IEC 27001 | Technical controls, policies in [policies/](./policies/) | Scope statement, risk assessment and treatment plan, Statement of Applicability, internal audit, management review, stage 1 and 2 audits by an accredited body |
| ISO/IEC 27701 | Privacy pages, DPA, DSR process, data inventory | An ISMS first, then privacy-specific controls and audit |
| SOC 2 (Type I, then II) | Access control, logging, change control via CI | Auditor, defined system description, 3–12 months of evidence, HR and vendor evidence |
| PCI DSS | Hosted checkout, no card data | Yearly SAQ A with the acquirer/provider |
| CSA STAR | Self-assessment answers can be built from [standards-mapping.md](./standards-mapping.md) | Complete the CAIQ and submit |
| Cyber Essentials (UK) | Patching and access controls | Application via an assessment body for the office/devices in scope |
| India CERT-In empanelled audit | Security controls | Engage an empanelled auditor |
| Independent penetration test | CI scanning, ZAP baseline | Commission a test, fix findings, retest; do this before enterprise sales |

Order of effort that fits a small team: penetration test → SOC 2 Type I → ISO 27001.
