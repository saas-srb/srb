# Legal applicability and compliance register: India

The product is a business-to-business software service sold in India (a customer company signs up, its people use it). It takes payment
through Razorpay's hosted checkout, runs AI features at the customer's request, and lets each customer put its own website, portal and
apps under its own brand. Applicability below is the engineering assessment from that shape; **counsel confirms each row** before launch.

Columns: **Applies** = Yes / Likely / Conditional (depends on a fact stated) / No. **Where it is met** points to the page or code. **Owner** items need a decision or action outside the code.

The public policies are built in `src/lib/platform/saas/legal-india.ts` from the operator's profile (Platform Console → **Legal & compliance**: legal entity, registered office, registration number, Grievance Officer, courts, effective date; legal name and GSTIN come from **Tax & invoicing**). A field not entered is left out of the pages and listed in the Console checklist; nothing is invented. `npm run test:legal` checks that no policy carries placeholder text, names the Indian law it rests on and ends with the Grievance Officer.

## Data protection and the internet

| Law | Applies | What it needs | Where it is met | Owner |
| --- | --- | --- | --- | --- |
| Digital Personal Data Protection Act, 2023 and the Rules made under it (notified in phases) | Yes: the operator is a Data Fiduciary for its own visitors, sign-ups and customers; a Data Processor for customers' workspace data | Notice, consent and withdrawal, purpose limits, rights (ss. 11-14), grievance redressal, security safeguards (s. 8(5)), breach intimation to the Board and people (s. 8(6)), erasure (s. 8(7)), children (s. 9), cross-border (s. 16), processor contract (s. 8(2)) | `/privacy`, `/data-requests`, `/dpa`, `/subprocessors`, `/grievance`; erasure and export tools; audit log | Re-check each provision's commencement date as the Rules phase in; decide whether the operator could become a Significant Data Fiduciary |
| Information Technology Act, 2000: s. 43A, s. 79, s. 69 | Yes | Reasonable security practices; intermediary safe harbour conditions; lawful interception and blocking orders | `/privacy`, `/security`, `/terms` (acceptable use, content removal on order); security controls in [standards-mapping.md](./standards-mapping.md) | Name who receives government and court orders |
| IT (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 | Yes while in force | Published privacy policy, consent for sensitive data, Grievance Officer, security practices | `/privacy` (sensitive personal data section), `/grievance` | |
| IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 | Conditional: the operator hosts content that customers publish | Rules and terms stating prohibited content, Grievance Officer, acknowledge in 24 hours and resolve in 15 days, takedown on order | `/terms` (acceptable use), `/grievance` | Keep the Grievance Officer current in the Console |
| CERT-In Directions, 28 April 2022 | Yes | Report cyber incidents within 6 hours; keep ICT logs 180 days; synchronise clocks to NIC/NPL time | [policies/incident-response.md](./policies/incident-response.md); 180-day sign-in and event logs; `/security`, `/vulnerability-disclosure` | Register the CERT-In point of contact; confirm logs are held as the Directions require |
| Telecom Commercial Communications Customer Preference Regulations, 2018 (TRAI) | Conditional: customers sending commercial SMS or calls through the product | DLT registration of sender IDs and templates; consent and preference registers | `/terms` ("Messages you send through the service") puts the duty on the customer | |

## Consumers, commerce and tax

| Law | Applies | What it needs | Where it is met | Owner |
| --- | --- | --- | --- | --- |
| Indian Contract Act, 1872 | Yes | Valid electronic acceptance; competent parties | `/terms` (eligibility, electronic record), sign-up acceptance | |
| Consumer Protection Act, 2019 | Conditional: the service is for businesses; applies if any buyer is a consumer | Fair terms, redress | `/terms`, `/refund-policy`, `/grievance` (National Consumer Helpline, e-Daakhil) | |
| Consumer Protection (E-Commerce) Rules, 2020 | Conditional: the operator sells to Indian buyers online | Seller identity and address, Grievance Officer, acknowledge in 48 hours and resolve in one month, price and refund disclosure | `/terms`, `/refund-policy`, `/grievance` (24 hours and 15 days, stricter than the Rules) | Enter the operator identity in the Console |
| CGST Act, 2017 and GST Rules | Yes | Registration, tax invoice with GSTIN and SAC, credit notes (s. 34), e-invoicing above the notified threshold, returns | Invoicing in `lib/platform/billing/gst.ts` and `invoices.ts`; `/terms` and `/refund-policy` describe tax invoices and credit notes | File returns; check whether e-invoicing (IRN) applies at the current turnover |
| Income-tax Act, 1961 (TDS) | Yes | Handling of TDS deducted by customers | `/terms` ("Tax deducted at source") | Reconcile Form 26AS |
| Payment and Settlement Systems Act, 2007; RBI directions on payment aggregators and on recurring payments (e-mandates) | Yes through Razorpay | The operator never handles card data; pre-debit notification and authorisation for recurring charges | Razorpay hosted checkout; no card fields in the code; `/terms`, `/refund-policy` | Keep the Razorpay merchant KYC current |
| Companies Act, 2013 / LLP Act, 2008 | Conditional: depends on the operator's constitution | Registered name, number and address disclosed; books kept | Legal & compliance profile (constitution, registration number, registered office) shown on `/terms` and `/privacy` | Enter them |
| Arbitration and Conciliation Act, 1996 | Yes | Valid arbitration clause | `/terms` (governing law and disputes) | Choose the city whose courts and seat apply |
| Aadhaar Act, 2016 and UIDAI rules | Conditional: customers storing Aadhaar numbers | Only permitted use; masking | `/terms` ("Identity numbers") | |
| Persons covered by sector law (RBI, SEBI, IRDAI, health) | Conditional: depends on the customer | Sector rules on data location and audit | Not offered as a sector-regulated service; enterprise customers state their requirements | Ask enterprise customers |
| PCI DSS | Conditional | Card data never touches our systems | Razorpay hosted checkout | Complete the SAQ A each year |

## Claims we must be able to prove

Site copy describes only what is built: no invented stories, discounts or certifications (`/success-stories`, `/security`). Do not claim ISO 27001, SOC 2 or STQC certification until it is held.
