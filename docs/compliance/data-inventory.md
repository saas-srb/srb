# Data inventory and processing record

Role: for a customer company's people and customers the platform is a **processor** (the company decides why and how); for sign-ups, inquiries, billing
contacts and the platform's own website it is a **controller**. Retention figures are the values in code; "customer-set" means the company controls it.

| Category | Examples | Where | Purpose | Basis (as controller) | Retention | Sub-processors |
| --- | --- | --- | --- | --- | --- | --- |
| Account | name, email, role, password hash (scrypt), 2FA secret (encrypted) | Database, per company | Provide sign-in and access | Contract | While the account exists; deleted on request or at contract end | MongoDB Atlas, Vercel |
| Sessions and sign-in events | session token hash, device, IP, event type | Database | Security, session management, CERT-In logging | Legitimate interest / legal obligation | Sessions until expiry; events 180 days | MongoDB Atlas |
| Business records | CRM, HR, projects, files, messages | Database / private storage, per company | The service the company uses | Processor: company's instructions | Customer-set; removed after contract end | MongoDB Atlas, Vercel |
| Billing | plan, invoices, GST details, Razorpay order/payment IDs (no card data) | Database | Billing and tax records | Contract / legal obligation | Statutory period for tax records | Razorpay |
| Inquiries and privacy requests | name, email, message, request type, reference | Platform database | Reply and handle requests | Legitimate interest / legal obligation | Requests: record kept for accountability; due date 30 days | Resend (email) |
| Website consent records | hashed visitor id, choice, version, time | Database | Prove consent | Legal obligation | 3 years | MongoDB Atlas |
| Website visitors of a company | page views the company's own tools record | Database, per company | Company's analytics | Processor | Customer-set | Company-connected tools |
| AI requests | prompts and outputs the user sends | Sent to the AI provider on request | The AI feature | Processor | Not kept by the platform beyond the record the feature stores | OpenAI |
| Build and app data | app identity (name, icon), build status | Database, GitHub Actions | Generate the company's apps on request | Contract | Until deleted by the company | GitHub |

## Flow

Browser → Vercel (application) → MongoDB Atlas (data), private object storage for files. Optional outbound calls: Resend (email), Razorpay (payment),
OpenAI (AI), GitHub (app builds), and company-connected services (ElevenLabs, Twilio, SMTP, social networks). Each is listed on `/subprocessors`.

## Gaps for the owner

Record the actual hosting region of each provider and the transfer ground for each country pair in
[policies/international-transfer-register.md](./policies/international-transfer-register.md); keep this inventory updated whenever a feature adds a new
category or provider.
