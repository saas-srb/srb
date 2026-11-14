/**
 * Structure of the SRB AI product website: navigation, feature groups, roadmap and legal copy.
 * Everything is drawn from what the product really does (see `content.ts`); where the product has no genuine data yet
 * (releases, posts, customer stories) the list is empty and the page shows its structure with an honest empty state.
 */
import type { IconKey } from "@/lib/platform/saas/content";

export interface NavLink {
  href: string;
  label: string;
  hint: string;
}

/** The header's links: no dropdowns, one click to each place. */
export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home", hint: "What SRB AI is and why companies use it" },
  { href: "/products", label: "Products", hint: "Every product and feature, with a details page for each" },
  { href: "/pricing", label: "Pricing", hint: "Plans, allowances and a details page for each plan" },
  { href: "/docs", label: "Documentation", hint: "A guide for every product and every feature" },
  { href: "/about", label: "About Us", hint: "Who we are, our mission, what we do and success stories" },
  { href: "/contact", label: "Contact Us", hint: "Sales, support and security" },
];

/** Legal pages, shown at the bottom of every page. */
export const LEGAL_LINKS: NavLink[] = [
  { href: "/privacy", label: "Privacy Policy", hint: "How personal information is handled" },
  { href: "/terms", label: "Terms of Service", hint: "The agreement for using the service" },
  { href: "/cookies", label: "Cookie Policy", hint: "Cookies and similar storage we use" },
  { href: "/security", label: "Security & Trust", hint: "Isolation, access, AI safety, reliability and data ownership" },
  { href: "/sla", label: "Uptime SLA", hint: "99.9% monthly uptime, how it is measured and service credits" },
  { href: "/status", label: "System status", hint: "A live check of the website and the database" },
  { href: "/data-policy", label: "Data Policy", hint: "Ownership, isolation, AI and export" },
  { href: "/refund-policy", label: "Refund & Cancellation Policy", hint: "The free plan, cancelling and billing issues" },
  { href: "/dpa", label: "Data Processing Addendum", hint: "How we process personal data for our customers" },
  { href: "/subprocessors", label: "Sub-processors and International Transfers", hint: "The providers we use and how data crosses borders" },
  { href: "/data-requests", label: "Your Data Rights and Requests", hint: "Access, correct, delete or export your information" },
  { href: "/grievance", label: "Grievance Redressal", hint: "Our Grievance Officer, how fast complaints are answered, where to escalate" },
  { href: "/vulnerability-disclosure", label: "Vulnerability Disclosure Policy", hint: "Report a security issue to us privately" },
];

/** The feature groups of the Features page: each lists the module keys (Product Registry keys) it holds. */
export interface FeatureGroup {
  id: string;
  title: string;
  lead: string;
  icon: IconKey;
  modules: string[];
}
export const FEATURE_GROUPS: FeatureGroup[] = [
  { id: "sales-marketing", title: "Sales & marketing", lead: "Find customers, follow up every enquiry and publish where your customers look.", icon: "target", modules: ["lms", "smms", "seo", "cms", "website"] },
  { id: "people-training", title: "People & training", lead: "Hire, welcome, pay, test and train your people, with one record for each person.", icon: "users", modules: ["hrms", "tms", "ots"] },
  { id: "finance-operations", title: "Money & operations", lead: "Deliver projects, control what you spend and keep your accounts up to date.", icon: "wallet", modules: ["fms", "pms", "prms"] },
  { id: "documents-knowledge", title: "Documents & knowledge", lead: "Procedures, agreements and passwords that stay up to date and protected.", icon: "file", modules: ["sop", "lpms", "dlms"] },
  { id: "ai-intelligence", title: "AI & answers", lead: "Ask questions about your business and build assistants on your own documents.", icon: "brain", modules: ["intelligence", "aibots"] },
  { id: "collaboration-portals", title: "Teamwork, client pages & support", lead: "Keep your team, customers and students in the loop without another app.", icon: "chat", modules: ["messenger", "portal", "support"] },
  { id: "control-center", title: "Control center", lead: "One place for reports, users, access, activity records and automations.", icon: "bolt", modules: ["workspace"] },
];

/** Example automations, each phrased from the automations the product lists for its modules. */
export interface Flow {
  id: string;
  area: string;
  trigger: string;
  condition: string;
  action: string[];
}
export const FLOWS: Flow[] = [
  { id: "lead", area: "SRB DealFlow AI", trigger: "A new lead is created", condition: "Matches your assignment rule", action: ["Assign the lead to its owner", "Notify the owner", "Send a welcome message"] },
  { id: "deal", area: "SRB DealFlow AI → SRB SprintOS", trigger: "A deal is won", condition: "Always", action: ["Create the client record", "Notify the account team"] },
  { id: "leave", area: "SRB TalentOS", trigger: "A leave request is filed", condition: "Needs approval", action: ["Notify the manager", "Track the approval"] },
  { id: "invoice", area: "SRB CashFlow AI", trigger: "An invoice goes overdue", condition: "Past the reminder date", action: ["Send a payment reminder", "Notify finance"] },
  { id: "task", area: "SRB SprintOS", trigger: "A task is assigned or overdue", condition: "Always", action: ["Notify the assignee"] },
];

export type RoadmapStatus = "Completed" | "In Progress" | "Planned" | "Future";
export interface RoadmapItem {
  title: string;
  body: string;
  status: RoadmapStatus;
}
/** Only genuine roadmap information: items the product itself marks as upcoming. */
export const ROADMAP: RoadmapItem[] = [
];

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: { type: "New" | "Improved" | "Fixed"; text: string }[];
}
/** No versioned releases are published yet. Entries added here appear on /changelog, newest first. */
export const CHANGELOG: ChangelogEntry[] = [];

export type { BlogPost } from "./blog-posts";
export { POSTS } from "./blog-posts";

export interface SuccessStory {
  slug: string;
  company: string;
  summary: string;
  results: string[];
  /** Optional approved story details; only add facts the featured customer has approved for publication. */
  industry?: string;
  quote?: string;
  challenge?: string;
  approach?: string[];
}
/** Only real, permitted customer stories belong here. */
export const STORIES: SuccessStory[] = [];

export interface LegalDoc {
  slug: string;
  title: string;
  description: string;
  intro: string;
  sections: { heading: string; body?: string[]; list?: string[] }[];
  /** Three short points shown "at a glance" above the document. */
  highlights?: { title: string; text: string; icon: IconKey }[];
}

const SERVICE = "SRB AI";

export const LEGAL_EXTRA: Record<"security" | "sla", LegalDoc> = {
  sla: {
    slug: "sla",
    title: "Uptime SLA",
    description: `${SERVICE}'s availability commitment: 99.9% monthly uptime on paid plans, how it is measured, what is excluded and the service credits if we miss it.`,
    intro: `This page states how available ${SERVICE} will be for paying customers, how that is measured, and what we give you if we fall short. It is the same commitment most business software makes: 99.9% of each month.`,
    highlights: [
      { icon: "clock", title: "99.9% monthly uptime", text: "About 43 minutes of downtime allowed in a 30-day month, on every paid plan." },
      { icon: "wallet", title: "Service credits", text: "Miss the target and you get 10%, 25% or 50% of that month's fee back as a credit." },
      { icon: "check", title: "Live status", text: "The System status page checks the website and the database whenever it is opened." },
    ],
    sections: [
      {
        heading: "Our commitment",
        body: [`${SERVICE} will be available for at least 99.9% of the minutes in each calendar month (the "Monthly Uptime Percentage"). This applies to the web app, every product and the APIs of a workspace on a paid plan (Starter, Growth and Business). Enterprise customers can agree different terms in writing. The Free plan is provided on a best-effort basis and is not covered by credits.`],
      },
      {
        heading: "What 99.9% allows",
        list: [
          "99.9% in a 30-day month: about 43 minutes of downtime.",
          "99.0%: about 7 hours 12 minutes. 95.0%: about 36 hours.",
          "Every minute below the target counts, whether it comes in one outage or many.",
        ],
      },
      {
        heading: "How it is measured",
        body: ["Monthly Uptime Percentage = (minutes in the month − minutes of downtime) ÷ minutes in the month × 100."],
        list: [
          "Downtime: a minute in which a paid workspace cannot be opened or signed in to because of a fault on our side, as shown by our monitoring and the System status page.",
          "Partial problems: a fault in one product counts as downtime for that workspace when it stops the product from loading at all.",
          "Records: our monitoring and the incident history on the System status page are the source of truth; if you disagree you can send us your own logs with a claim and we will look at both.",
        ],
      },
      {
        heading: "What is not counted",
        list: [
          "Planned maintenance: announced in the product at least 24 hours ahead and kept within 4 hours a month.",
          "Outside services: failures of your own network, device, DNS or custom domain, of payment gateways, email and messaging providers, social networks, and of the AI provider. When the AI service is down, AI features are paused with a message; that is not website downtime.",
          "Your own account state: a workspace that is suspended, read-only for an unpaid renewal, or over a plan limit.",
          "Misuse and abuse: traffic or actions that break the Terms of Service, and attacks we have to block to protect other customers.",
          "Beta features and anything we label as such.",
          "Events beyond our reasonable control: natural disaster, war, government action, and failures of the internet backbone or of our hosting and database providers' own regions.",
        ],
      },
      {
        heading: "Service credits",
        body: ["If the Monthly Uptime Percentage of your workspace is below 99.9%, you can claim a credit on that month's subscription fee, excluding taxes:"],
        list: [
          "Below 99.9% but at least 99.0%: a credit of 10%.",
          "Below 99.0% but at least 95.0%: a credit of 25%.",
          "Below 95.0%: a credit of 50%.",
          "Credits are applied to your next invoice or added as free time on your subscription. They are never paid out in cash, and they are your sole remedy for downtime.",
        ],
      },
      {
        heading: "How to claim",
        list: [
          "Open a request in the Help & Support product (type Other) with the title \"SLA credit\", the dates and times you saw the problem, and what you could not do.",
          "Send it within 30 days after the end of the month in which the downtime happened.",
          "We review it against our records and answer in the request. If we confirm the downtime we apply the credit.",
        ],
      },
      {
        heading: "Changes",
        body: ["We may improve this SLA at any time. If a change makes it less favourable to you we will tell you at least 30 days before it applies, and it never applies to a month that has already started."],
      },
    ],
  },
  security: {
    slug: "security",
    title: "Security & Trust",
    description: `How ${SERVICE} separates every company's data, controls access, keeps AI and automation inside your permissions, and lets you export your data or leave.`,
    intro: `This page describes how ${SERVICE} works today: how each company's data is kept apart, who can see what, how the AI and automations are held in check, what happens when something fails, and how you take your data with you. It is written for the person who has to answer "is it safe to run the business on this?"`,
    highlights: [
      { icon: "shield", title: "Separate per company", text: "The platform scopes every database query to one company, so a page cannot ask for another company's data." },
      { icon: "brain", title: "AI proposes, you approve", text: "Assistants work with the asker's permissions; any change they propose waits for approval and is logged." },
      { icon: "check", title: "Your data stays yours", text: "Export tables, import from CSV, cancel and still read your workspace, or ask for permanent deletion." },
    ],
    sections: [
      {
        heading: "Each company's data is separate",
        list: [
          "Isolation: every record belongs to one company, and the platform adds that company to every database query itself. A page, report or export cannot ask for another company's rows by mistake.",
          "Own address: a company works on its own workspace address or custom domain. Signing in on one company's address never opens another's.",
          "Own settings and keys: branding, domains, plan limits, integrations and API keys are kept per company.",
          "Platform staff: the Platform Console is separate from company workspaces, and what platform staff do is recorded in a platform audit log.",
        ],
      },
      {
        heading: "Who can see and do what",
        list: [
          "Roles per product: each product has its own roles, and on top of a role you can grant or remove a single permission for one person.",
          "Custom roles: build a role from the permissions you choose and give it to people, instead of making everyone an administrator.",
          "Sensitive areas: payroll, salaries, bank details, finance statements and stored credentials need their own permission, even for managers.",
          "Delegated administrators: an administrator who is not a Director cannot grant a role they do not hold themselves, cannot raise their own access and cannot change a Director's account.",
          "Checked on the server: permissions are enforced on pages, actions, APIs and exports, not only by hiding buttons.",
          "Plans: a product opens only if the company's plan includes it, and a suspended or unpaid workspace becomes read-only instead of being switched off.",
          "Audit log: sign-ins and failed sign-ins are recorded with their device and place, changes are recorded in each product's activity log, and the central Audit log brings the products' activity and the company's business events together for administrators to filter.",
        ],
      },
      {
        heading: "Sign-in and account protection",
        list: [
          "Passwords: stored only as salted hashes. Five wrong attempts lock the account for 15 minutes.",
          "Two-step sign-in: each person chooses it for their own account, either an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password) or a six-digit code sent to their email. A password alone then does not sign in: the code is needed too. Codes work once, wrong codes count towards the same lock-out, the app method comes with ten single-use recovery codes, and a Director can reset it for someone who lost their phone or mailbox.",
          "Sessions: a signed-in session is tied to the browser and network it started on. If the session token is copied somewhere else it is revoked and the owner signs in again.",
          "Devices: each person can see their signed-in devices and sign-in history, and sign a device out.",
          "Abuse protection: sign-in, forms, AI calls and exports are rate-limited, scripted clients are refused on the API, and requests from other websites are rejected.",
          "Browser protection: pages are served over HTTPS only with strict transport security, clickjacking protection and a content policy on API responses.",
        ],
      },
      {
        heading: "Encryption and files",
        list: [
          "Secrets: credentials, API keys, bank details and vault documents are encrypted at rest with keys that are held outside the database.",
          "Files: uploads are kept in private storage and served only to people who are allowed to open them.",
          "Upload safety check: every file is checked before it is stored. Programs and scripts (even renamed), documents with macros, web pages, images that carry script, archives that hold them or are built to blow up, and PDFs that launch programs are refused with the reason shown. Optionally a file's fingerprint is checked against VirusTotal's database of known malware. This is a safety check, not a full antivirus scan.",
          "Payments: payment webhooks must carry a valid signature, and each payment is recorded once, so a repeated delivery cannot create a second invoice.",
        ],
      },
      {
        heading: "AI that stays inside your permissions",
        list: [
          "Your data only: assistants answer from your own company's workspace, with the permissions of the person asking. An assistant cannot read what that person cannot open.",
          "Read-only questions: business questions are answered with read-only queries. The numbers in an answer come from the query result, not from the model's memory, and the answer shows how it was calculated.",
          "Changes need approval: when an assistant proposes to create, edit or delete something, nothing happens until the person approves it. Deletes ask for a second confirmation. A proposal expires after 30 minutes, can be used once and only by the person it was made for.",
          "Documents are data: instructions found inside documents, files or records are treated as content, never as commands.",
          "Logged: every action an assistant takes on someone's behalf is recorded with who asked, what changed and when.",
          "No cost surprises: AI use is metered against the plan. When the allowance is used up, AI pauses with a clear message and the rest of the product keeps working; the same happens if the AI service itself is unavailable.",
        ],
      },
      {
        heading: "Automations you can follow",
        list: [
          "Run history: every automation run is recorded with its outcome and kept for 90 days.",
          "No loops or floods: an automation cannot set off another automation, and a bulk CSV import is recorded but never runs automations, so a 1,000-row file cannot send 1,000 emails.",
          "Failure alerts: administrators are told once when an automation starts failing, not on every failed run.",
          "Test before you trust: \"Send test\" runs an automation's actions once with sample data, so you can see what it would do.",
          "Safe messages: values from your records are escaped before they are placed in an email.",
        ],
      },
      {
        heading: "Finance and payroll",
        list: [
          "Finance: invoices, credit notes, bills, receipts, payment links, bank and cash accounts with reconciliation, and a chart of accounts. Changes are kept in a finance audit trail.",
          "Restricted views: financial statements, banking and payroll figures are limited by role, so a project manager does not see them by default.",
          "Payroll rules: PF and ESI rates and wage ceilings are configurable, and income tax follows the Indian new-regime slabs for FY 2025-26 with the standard deduction, the section 87A rebate and cess. A manual TDS override is available where a case needs one.",
          "Your tax rates: tax rates used on invoices are a list you maintain, so a change in a rate is a setting, not a software update.",
        ],
      },
      {
        heading: "Reliability",
        list: [
          "Managed infrastructure: the product runs on managed cloud hosting with a managed MongoDB Atlas database, not on a single server.",
          "Availability commitment: 99.9% monthly uptime on paid plans, with service credits if we miss it. See the Uptime SLA.",
          "Live status and history: the System status page checks the website and the database each time it is opened, lists open and past incidents of the last 90 days with every update, and shows uptime worked out from that record.",
          "Scheduled jobs: renewals, reminders, expiry checks and other recurring work run on schedule without anyone clicking.",
          "Failed payments: a failed renewal starts a grace period; after it the workspace becomes read-only. Your data is not deleted, and paying brings everything straight back.",
          "AI outages: if the AI service is unavailable, AI screens say so in plain words and the rest of the product keeps working.",
        ],
      },
      {
        heading: "When something goes wrong",
        body: ["We watch the service, and when an incident is confirmed we contain it, fix it and tell affected customers without undue delay, with what happened, what was affected and what we are doing. Open incidents appear on the System status page. We report cyber security incidents to CERT-In within 6 hours of noticing them, as its directions of 28 April 2022 require, and keep system logs for 180 days. If an incident affects personal data, we tell the customer without undue delay so that it can meet its own duty under the Digital Personal Data Protection Act, 2023 to inform the Data Protection Board of India and the people concerned."],
      },
      {
        heading: "Reporting a vulnerability",
        body: ["If you find a security problem, tell us privately. Our Vulnerability Disclosure Policy explains how, what is in scope, and how we treat good-faith research, and our security.txt file lists the contact."],
      },
      {
        heading: "Your data is yours: export, import and leave",
        list: [
          "Ownership: the records, files and content a company puts in its workspace belong to that company.",
          "Backups: every week the platform saves a backup of each workspace (the last eight are kept) and the Director can make one any time. Every backup stays in a history you can download from, and what you download is the very file that is stored (Settings → Backups & data). Passwords, tokens and saved API keys are never in a backup, and uploaded files stay in their products.",
          "Restore: the workspace can be put back to any backup, after a multi-step confirmation (the exact company name, a phrase, your password and your two-step code). The system first saves a safety copy of what you have, kept for 30 days, and every restore is recorded in its own history.",
          "Export by table: tables in the products can be exported to CSV or Excel, and documents such as invoices and payslips can be downloaded as PDF.",
          "Import: leads, clients and employees can be imported from CSV, with a sample file and a preview before anything is saved.",
          "Cancelling: you can cancel any time. The workspace then stays readable so you can download what you need.",
          "Delete all my data: removes every record and file in the workspace but keeps the company, its accounts and its subscription so you can start again. A safety copy of the records is kept for 30 days.",
          "Delete the company: schedules permanent deletion of the whole company and all its data in 30 days. It is read-only meanwhile, and until the last day you can cancel and bring the account back. Both deletions need the same multi-step confirmation as a restore, and both are recorded.",
        ],
      },
      {
        heading: "Support",
        list: [
          "Help & Support: a help center, an AI help assistant that knows the product, and support requests that you can follow from open to resolved, with attachments and notifications.",
          "Contact: write to us through the contact page for billing, migration or security questions.",
        ],
      },
      {
        heading: "Privacy and compliance",
        list: [
          "Published policies: the Privacy Policy, Data Policy, Terms of Service, Cookie Policy, Refund & Cancellation Policy, Data Processing Addendum and Grievance Redressal page are public and linked from every page, with the name of our Grievance Officer.",
          "No advertising cookies and no selling of data.",
          "Tools for your own duties: role-based access, an audit log, export and deletion on request help a company meet its own obligations as a Data Fiduciary under the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000 and the other laws that apply to it.",
          "Security questions: if your organisation needs a security questionnaire answered, send it through the contact page.",
        ],
      },
      {
        heading: "Questions teams ask before they switch",
        list: [
          "Too many products for us?: Use only the products you need. Each product runs independently with its own sign-in and database, and the suite gives you one place to find product links, guides and help.",
          "Hard for new people to learn?: Company setup walks through the profile, departments and invitations, and the documentation has step-by-step walkthroughs for the common jobs.",
          "Same on a phone and a laptop?: Yes. The installable web app and the Android, iOS, Windows, macOS and Linux apps open the same workspace, so every screen and feature is the same everywhere. Each app carries your company's name and icon and is always current.",
          "Will one busy company slow the others?: Each company's AI, storage, email and voice use is capped by its plan, requests are rate-limited per session and address, and the product runs on hosting that scales out.",
          "Will AI costs run away?: No. AI is metered against the plan, shown per person and per feature on the Usage page, and paused with a clear message when the allowance is used up.",
          "Can people abuse the free plan?: The Free plan is limited to one person and has its own AI, storage, email and voice allowances, enforced on the server.",
          "What if an outside service fails?: Connections under Settings → Integrations have a test button, automations alert administrators when they start failing, and if the AI service is unavailable the AI screens say so while everything else keeps working.",
          "How do I move in from other tools?: Import leads, clients and employees from CSV with a sample file and a preview, then connect your own domain, payment account, email and social accounts with your own keys.",
          "Are we locked in?: No. You can export every table to CSV or Excel, download documents as PDF, and take one archive of the whole workspace at any time.",
          "What if we stop using it?: Cancel from billing. The workspace stays readable so you can export, and you can ask for permanent deletion of the company's data.",
          "Is the website builder enough?: It has pages, a blog, products, forms, themes with live preview, menus, SEO tools, tracking and verification scripts, your own domain with automatic SSL, and an AI chatbot, all under your brand.",
          "How deep is the SEO product?: Site audits, technical and on-page checks, keywords, rankings, competitors, internal links, backlinks, sitemap, robots.txt and structured data, with Google Search Console and PageSpeed connections.",
          "How does social media work?: Campaigns, scheduled posts with an approval workflow, a media library, AI drafting and analytics for the Facebook, Instagram, LinkedIn and YouTube accounts you connect.",
          "How are documents protected?: Digi Locker keeps credentials and documents encrypted at rest with per-record access, expiry alerts and an activity log. Legal & Documents adds approvals, signatures, document history and an audit trail, and SOPs keep version history and acknowledgement tracking.",
          "Can a mistake in the AI hit our books?: An assistant cannot change a record until the person approves its proposal, and finance, payroll and bank views are limited by role.",
        ],
      },
      {
        heading: "Moving in and connecting other services",
        list: [
          "Moving in: bring leads, clients and employees in from CSV. Your own website and domain connect with automatic SSL.",
          "Connections: payments (Razorpay), email (SMTP, Resend, SendGrid), messaging (Twilio, WhatsApp Business), AI and voice (OpenAI, ElevenLabs) and your social accounts are connected per company in Settings → Integrations, with your own keys.",
          "Devices: web, installable app, and apps for Android, iOS, Windows, macOS and Linux that carry your company's name and icon.",
        ],
      },
    ],
  },
};

/** White label: everything a customer's team, clients and visitors see carries the customer's brand. Each item is a real setting. */
export interface BrandPoint {
  key: string;
  title: string;
  text: string;
  icon: IconKey;
  /** Screenshot under /public/selfrun/screens. */
  shot: string;
}
export const YOUR_BRAND: BrandPoint[] = [
  { key: "branding", title: "Your logo, name & colours", text: "Set once — applied across every product, email and PDF your business sends.", icon: "target", shot: "branding" },
  { key: "apps", title: "Your own apps", text: "Your business's own apps for phones and for Windows, macOS and Linux — generated with one button each, with your name and icon.", icon: "rocket", shot: "apps" },
  { key: "domains", title: "Your own domain", text: "Your website and workspace on your own web address, with a secure (HTTPS) connection set up automatically.", icon: "globe", shot: "domains" },
  { key: "themes", title: "Multiple themes", text: "Pick and customise website themes with live preview — colours, fonts and layouts.", icon: "layers", shot: "cms-theme" },
  { key: "push", title: "Your push notifications", text: "Reach your team and your website visitors on their devices, in your name.", icon: "megaphone", shot: "cms-push" },
  { key: "website", title: "Your website", text: "A complete website builder with pages, blog, forms and SEO — published under your brand.", icon: "book", shot: "cms" },
];

/** SRB AI against the usual way of running a business: a separate tool for each job. No competitor is named or priced. */
export const COMPARISON: { row: string; us: string; them: string }[] = [
  { row: "Software", us: "One software with a product for every department", them: "A different business for every job" },
  { row: "Your data", us: "Your records stay with your business, kept apart from every other business's", them: "Data spread across unrelated businesses" },
  { row: "AI", us: "AI built into every product, working with that product's data", them: "AI, if any, added on separately" },
  { row: "Automation", us: "Set up automatic steps between the products you choose", them: "Connectors to buy and maintain between apps" },
  { row: "Website", us: "Website builder with themes, AI chatbot, voice AI and search tools", them: "A separate website builder, hosting and plug-ins" },
  { row: "Mobile apps", us: "Your own Android and iPhone apps, made for you", them: "Each business's app, in their name" },
  { row: "Desktop apps", us: "Your own Windows, macOS and Linux apps", them: "Usually browser only" },
  { row: "Install like an app", us: "Add it to any device in one tap, with your icon", them: "Depends on the tool" },
  { row: "Notifications", us: "To your team and your website visitors, in your name", them: "Separate in each app, under that business's brand" },
  { row: "Your brand", us: "Your logo, colours, domain, emails and PDFs", them: "Each business's brand in front of your people" },
  { row: "Control", us: "Switch products on or off and choose who can see and do what", them: "Different admin settings in every app" },
  { row: "Record of actions", us: "A log of who did what, and sign-in history, in each product", them: "Scattered logs, if available" },
  { row: "Customer portal", us: "Built in for customers, students and job applicants", them: "Another app to buy" },
  { row: "Features", us: "Every feature on every plan", them: "Features locked behind higher plans in each app" },
  { row: "Pricing", us: "Free forever to start; one plan by team size after", them: "Many subscriptions to track and renew" },
  { row: "Setup", us: "Guided setup in minutes, with spreadsheet (CSV) import built in", them: "Separate setup, training and support for each app" },
];

/** Everything included, grouped: the platform-wide capabilities a customer gets on day one. All of them exist in the product. */
export const CAPABILITIES: { title: string; icon: IconKey; items: string[] }[] = [
  { title: "AI", icon: "brain", items: ["Ask AI in every product", "Ask questions about your business in plain English", "AI assistants on your knowledge", "AI website chatbot", "Voice AI conversations", "AI social content & images", "AI-assisted SEO", "AI help assistant"] },
  { title: "Automation", icon: "workflow", items: ["Automatic steps: when this happens, do that", "Ready-made templates", "Email and in-app notifications", "Approvals and reminders", "Secure alerts to your other software", "A history of every automatic run"] },
  { title: "Your brand", icon: "target", items: ["Logo, name and colours", "Your own web address, with a secure connection", "Branded emails and PDFs", "Multiple website themes", "Your own push notifications", "Your own app icon and name"] },
  { title: "Every device", icon: "rocket", items: ["Web app on any browser", "Install it like an app from your browser", "Android and iOS apps", "Windows, macOS and Linux apps", "Push notifications", "Works on phone, tablet and desktop"] },
  { title: "Control", icon: "shield", items: ["Switch products on or off", "Choose who can see and do what", "A record of who did what", "Sign-in history", "Your data kept apart from every other business's", "Passwords and keys stored encrypted"] },
  { title: "Data & insight", icon: "chart", items: ["Live dashboards in every product", "Insights from your own records", "Saved filters", "Import from spreadsheets (CSV), with checks", "Export to spreadsheets", "Search inside each product"] },
  { title: "Website & growth", icon: "globe", items: ["Drag-and-drop page builder", "Blog, careers and products", "Website forms feed straight into your sales list", "Offers, coupons and referrals", "Wallet and reward credits", "SEO audits and rank tracking"] },
  { title: "People & portals", icon: "users", items: ["Employee self-service", "Client & student portal", "Team chat and meetings", "Announcements", "Help center and support desk", "Online tests and certificates"] },
];

/** What an AI-powered business gains, in the platform's own terms. */
export const AI_BENEFITS: { title: string; text: string; icon: IconKey }[] = [
  { title: "Hours back every week", text: "Reminders, follow-ups and approvals happen on their own.", icon: "clock" },
  { title: "Decisions from real numbers", text: "Ask a question and get the answer from your own records, with the working shown.", icon: "brain" },
  { title: "Nothing slips through", text: "Overdue leads, unpaid invoices, pending leave and late tasks are flagged and chased for you.", icon: "check" },
  { title: "Grow without extra paperwork", text: "Add more people and more of the software without adding more admin work.", icon: "rocket" },
  { title: "Works around the clock", text: "Automations and AI assistants keep going nights, weekends and holidays.", icon: "bolt" },
  { title: "Safe by design", text: "The AI only sees what the person asking is allowed to see, and every action is recorded.", icon: "shield" },
];

/** The kinds of software a business usually buys separately, and the product that replaces each one. */
export const REPLACES: { software: string; panel: string; icon: IconKey }[] = [
  { software: "CRM & lead management", panel: "lms", icon: "target" },
  { software: "HR & payroll software", panel: "hrms", icon: "users" },
  { software: "Accounting & invoicing", panel: "fms", icon: "wallet" },
  { software: "Project management", panel: "pms", icon: "layers" },
  { software: "Purchasing & asset tracking", panel: "prms", icon: "cart" },
  { software: "Course & training management", panel: "tms", icon: "graduation" },
  { software: "Team chat & meetings", panel: "messenger", icon: "chat" },
  { software: "Policy & procedure manager", panel: "sop", icon: "book" },
  { software: "Agreement register", panel: "lpms", icon: "file" },
  { software: "Password & file storage", panel: "dlms", icon: "lock" },
  { software: "Online tests", panel: "ots", icon: "check" },
  { software: "AI chatbot builder", panel: "aibots", icon: "bot" },
  { software: "Reports & business analysis", panel: "intelligence", icon: "brain" },
  { software: "Social media scheduler", panel: "smms", icon: "megaphone" },
  { software: "Website ranking tools", panel: "seo", icon: "search" },
  { software: "Website builder & hosting", panel: "cms", icon: "globe" },
  { software: "Client & student portal", panel: "portal", icon: "building" },
  { software: "Help desk", panel: "support", icon: "chat" },
  { software: "Workflow automation", panel: "workspace", icon: "workflow" },
];

/** Every way a business's people can use its workspace — each one carrying the business's own name and icon. */
export const DEVICES: { title: string; text: string; platforms: string[] }[] = [
  { title: "Web app", text: "Works in any modern browser, on any device — nothing to install.", platforms: ["Chrome", "Safari", "Edge", "Firefox"] },
  { title: "Installable web app", text: "Add it to your phone or computer from the browser in one tap, with your icon and notifications.", platforms: ["Android", "iOS", "iPadOS", "Windows", "macOS", "Linux", "ChromeOS"] },
  { title: "Mobile apps", text: "Your business's own Android and iPhone apps, made from your branding, that you can publish on Google Play and the App Store.", platforms: ["Android", "iOS"] },
  { title: "Desktop apps", text: "Your own app for Windows, Mac and Linux, with desktop notifications and a tray icon.", platforms: ["Windows", "macOS", "Linux"] },
];

/** How the whole business runs itself, in four layers. */
export const RUNS_ITSELF: { title: string; text: string; icon: IconKey; points: string[] }[] = [
  { title: "Enter it once", text: "Information comes in from wherever your work starts.", icon: "target", points: ["Website forms and campaigns", "Spreadsheet (CSV) imports", "Customer and student portal", "Apps on every device"] },
  { title: "Connect what you need", text: "Each product works on its own. Link only the steps you want connected.", icon: "layers", points: ["Create a customer when a deal is won", "Raise an invoice when a milestone is done", "Pass approved payroll on to finance", "Send secure alerts to your other software"] },
  { title: "Let it follow up", text: "The rules you set take care of the follow-up.", icon: "workflow", points: ["Starts when something happens in any product", "Sends emails and notifications", "Asks for approval and sends reminders", "Alerts your other software automatically"] },
  { title: "Get answers", text: "AI turns your records into answers.", icon: "brain", points: ["Ask in plain English", "See how each answer was worked out", "AI helps write content and answer customers", "Live dashboards in every product"] },
];

/** Extra screens captured per product (desktop, tablet and mobile), shown under the product's feature list. */
export const EXTRA_SCREENS: Record<string, { key: string; title: string }[]> = {
  lms: [{ key: "lms-leads", title: "Leads" }],
  hrms: [{ key: "hrms-employees", title: "Employee directory" }, { key: "hrms-payroll", title: "Payroll" }],
  fms: [{ key: "fms-invoices", title: "Invoices" }, { key: "fms-profit-and-loss", title: "Profit & loss" }],
  pms: [{ key: "pms-projects", title: "Projects" }],
  prms: [{ key: "prms-purchase-orders", title: "Purchase orders" }],
  tms: [{ key: "tms-students", title: "Students" }],
  sop: [{ key: "sop-library", title: "SOP library" }],
  seo: [{ key: "seo-keywords", title: "Keywords" }],
  smms: [{ key: "smms-posts", title: "Social media posts" }],
  cms: [{ key: "cms-pages", title: "Pages" }, { key: "cms-theme", title: "Themes" }],
  messenger: [{ key: "messenger-channels", title: "Team channels" }],
  dlms: [{ key: "dlms-credentials", title: "Credential vault" }],
  ots: [{ key: "ots-tests", title: "Tests" }],
  aibots: [{ key: "aibots-bots", title: "AI assistants" }],
  lpms: [{ key: "lpms-documents", title: "Document library" }],
  workspace: [{ key: "workspace-users", title: "Users, roles & seats" }, { key: "workspace-audit", title: "Audit log" }],
};

/**
 * A suggested growth path for a company using the platform, phase by phase. It is a guide, not a promise: every company moves at its own
 * pace and switches on only the products it needs. Each phase names real products and what they change; no figures are claimed.
 */
export interface GrowthPhase {
  id: string;
  when: string;
  title: string;
  goal: string;
  icon: IconKey;
  /** Product keys (Product Registry keys) to switch on in this phase. */
  panels: string[];
  /** Screen shown beside the phase. */
  screen: string;
  actions: string[];
  /** How the business changes by the end of the phase. */
  outcomes: string[];
  before: string;
  after: string;
}
export const GROWTH: GrowthPhase[] = [
  {
    id: "launch", when: "Day 1", title: "Launch your business workspace", goal: "Be live, branded and ready for your team in minutes, for free.", icon: "rocket", panels: ["workspace"], screen: "workspace",
    actions: ["Register with your work email and start on the free plan", "Complete the guided setup: business profile, departments and the products you want", "Add your logo, name and colours so everything carries your brand", "Invite your team and give each person a role", "Import your leads, clients and employees from a spreadsheet (CSV)"],
    outcomes: ["A branded workspace your team can use today", "Separate access and permissions in each product", "Your existing records, loaded into the product that uses them"],
    before: "Spreadsheets, email threads and apps that do not talk to each other.", after: "One branded software for your whole business.",
  },
  {
    id: "organise", when: "Week 1", title: "Capture and organise", goal: "Keep enquiries and people records organised in the products built for them.", icon: "target", panels: ["lms", "hrms", "cms"], screen: "lms",
    actions: ["Connect your website forms so every enquiry becomes a lead with an owner and a due date", "Set up your sales pipeline and assign leads by rule", "Build your staff directory with departments and documents", "Publish your website on your own web address with a secure connection"],
    outcomes: ["No enquiry without an owner", "A staff directory that HR and managers both trust", "A live website that can send enquiries straight to your sales list"],
    before: "Enquiries in inboxes, staff details in files, a website that needs a developer.", after: "Every lead owned, every person on record, a website your team edits.",
  },
  {
    id: "automate", when: "Month 1", title: "Automate the busywork", goal: "Let the software handle follow-ups, approvals and reminders.", icon: "workflow", panels: ["workspace", "fms", "pms", "hrms"], screen: "automations",
    actions: ["Switch on automations: new-lead alerts, overdue follow-ups, leave approvals and payment reminders", "Send invoices with payment links so customers can pay online", "Run projects with tasks, timesheets and billing by milestone", "Move attendance, leave and payroll onto the software"],
    outcomes: ["Follow-ups and reminders happen without anyone chasing", "Payments can update your accounts automatically, once you set that up", "Automations cut retyping wherever you switch them on"],
    before: "Someone has to remember to chase, approve and retype.", after: "Your automations notify people, ask for approval, remind and record every run.",
  },
  {
    id: "see", when: "Quarter 1", title: "See everything and decide faster", goal: "Use the reports in each product, and ask questions in plain English when you need a wider view.", icon: "brain", panels: ["intelligence", "prms", "sop", "workspace"], screen: "intelligence",
    actions: ["Ask AI questions in plain English and read how each answer was worked out", "Put purchases through approvals and track what you own and what you subscribe to", "Publish procedures and see who has read them", "Review the activity record, sign-in sessions and who has access to what"],
    outcomes: ["Leaders get answers in seconds, not after someone builds a report", "Spending is approved and checked before it is paid", "A written way of working, with proof that people follow it"],
    before: "Decisions wait for someone to build a report.", after: "Ask your business a question and get an answer you can verify.",
  },
  {
    id: "grow", when: "Months 4–6", title: "Grow your reach", goal: "Bring in customers and keep them engaged.", icon: "megaphone", panels: ["smms", "seo", "cms", "portal", "aibots"], screen: "smms",
    actions: ["Plan campaigns and let AI draft posts for each social network, with your approval", "Fix website search problems from a ranked list and track your rankings", "Run offers, coupons, referrals and reward credits from your website", "Give customers, students and applicants a page of their own", "Put an AI chatbot on your website, trained on your own information"],
    outcomes: ["A steady, on-brand presence without a large content team", "Visitors answered around the clock, and their enquiries captured", "Customers who check their own page instead of emailing for updates"],
    before: "Marketing disconnected from sales; customers waiting on email.", after: "Campaigns measured against real leads; customers helped by their own page and by AI.",
  },
  {
    id: "scale", when: "Year 1 and beyond", title: "Scale with your own apps and team", goal: "Grow your team and your business without growing the admin.", icon: "bolt", panels: ["tms", "ots", "lpms", "dlms", "workspace"], screen: "apps",
    actions: ["Roll out your own Android, iPhone, desktop and installable apps in your name", "Hire and train at scale with online tests and training courses", "Create and sign documents from templates, and keep passwords and files in the secure vault", "Move to a bigger plan only when your team size or usage needs it"],
    outcomes: ["Your team and customers use apps that carry your brand", "Hiring, testing and training are kept together", "More people and more products, without more apps or more admin"],
    before: "Every new hire or department means another app to buy and manage.", after: "Add products as you grow and manage everything from one place.",
  },
];
