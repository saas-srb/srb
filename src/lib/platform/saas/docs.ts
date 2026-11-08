/**
 * The documentation library: guides for running a business on SelfRun AI. Each guide is written from what the product really does
 * (its screens, settings and products) and is tied to a real screenshot. No pricing figures, limits or dates are stated here: the
 * pricing page and the workspace's own billing screen are the source for those.
 */
import { RESOURCES } from "@/lib/platform/saas/content";

export type DocCategory = "Getting started" | "Workspace & people" | "Your brand & apps" | "Automation & AI" | "Sales & marketing" | "People & finance" | "Operations" | "Security & admin";

export interface DocSection {
  heading: string;
  body?: string[];
  list?: string[];
  /** A real screen (key under /public/selfrun/screens) shown with this section. */
  shot?: string;
  tip?: string;
}
export interface Doc {
  slug: string;
  title: string;
  summary: string;
  category: DocCategory;
  readMinutes: number;
  /** The screen shown at the top of the guide. */
  shot: string;
  /** Product key the guide belongs to, for linking to its feature page. */
  panel?: string;
  sections: DocSection[];
}

export const DOC_CATEGORIES: { name: DocCategory; blurb: string }[] = [
  { name: "Getting started", blurb: "From a new account to a working business workspace." },
  { name: "Workspace & people", blurb: "Add people, set who can do what, and bring in your data." },
  { name: "Your brand & apps", blurb: "Your logo, web address, themes, notifications and own apps." },
  { name: "Automation & AI", blurb: "Automatic reminders and approvals, and AI that answers questions." },
  { name: "Sales & marketing", blurb: "Leads, your website, social media and search ranking." },
  { name: "People & finance", blurb: "Staff and payroll, invoices and projects." },
  { name: "Operations", blurb: "Buying, training, procedures and documents." },
  { name: "Security & admin", blurb: "Sign-in sessions, activity record, billing and connected services." },
];

const SHOT: Record<string, { shot: string; category: DocCategory; panel?: string }> = {
  "getting-started": { shot: "workspace", category: "Getting started", panel: "workspace" },
  "automation-basics": { shot: "automations", category: "Automation & AI", panel: "workspace" },
  "ask-your-business": { shot: "intelligence", category: "Automation & AI", panel: "intelligence" },
  "your-website": { shot: "cms", category: "Sales & marketing", panel: "cms" },
  "users-and-permissions": { shot: "workspace-users", category: "Workspace & people", panel: "workspace" },
};

const migrated: Doc[] = RESOURCES.map((r) => ({
  slug: r.slug,
  title: r.title,
  summary: r.summary,
  category: SHOT[r.slug]?.category ?? "Getting started",
  readMinutes: r.readMinutes,
  shot: SHOT[r.slug]?.shot ?? "workspace",
  panel: SHOT[r.slug]?.panel,
  sections: r.sections.map((s) => ({ heading: s.heading, body: s.body })),
}));

const d = (doc: Doc): Doc => doc;

const added: Doc[] = [
  d({
    slug: "brand-your-workspace", title: "Brand your workspace: logo, name and theme", summary: "Make every product, email and PDF carry your business's identity.", category: "Your brand & apps", readMinutes: 4, shot: "branding", panel: "workspace",
    sections: [
      { heading: "Where branding lives", body: ["Open Workspace → Branding. One screen controls how your business appears across every product, the emails the platform sends for you and the PDFs it generates."] },
      { heading: "Logo and name", body: ["Upload your logo (square images work best; PNG, JPG or WebP) and set your business name. The optional accent part lets you colour half of a two-part name, the way a wordmark often is."], list: ["The logo appears in the sidebar of every product and in your installable and downloadable apps", "The name is used in page titles, emails and notifications", "A live preview shows how it will look before you save"] },
      { heading: "Choose a theme", body: ["Pick a theme from the library — colours, fonts and corner style apply to your website and to every product. You can switch at any time and customise any theme further from the Website → Themes screen."], shot: "cms-theme", tip: "Branding changes apply to the whole business at once, so decide on them early and the rest of your setup inherits them." },
      { heading: "What it affects", list: ["All products your team works in", "Your public website", "Emails, push notifications and PDFs", "Your installable app, mobile apps and desktop app"] },
    ],
  }),
  d({
    slug: "your-own-apps", title: "Your own apps: install, Android, iPhone and desktop", summary: "Give your team a web app, phone apps and a desktop app — all with your name and icon.", category: "Your brand & apps", readMinutes: 6, shot: "apps", panel: "workspace",
    sections: [
      { heading: "Three ways to take the workspace with you", body: ["Workspace → Apps & downloads gives your business its own apps. Nothing about SelfRun is built into them: each app asks your workspace who it is — your name, icon and colours — every time it starts."] },
      { heading: "Installable web app", body: ["The fastest route. Open your workspace address in a browser and install it to the home screen or desktop. It works on Android, iPhone and iPad, Windows, macOS, Linux and ChromeOS, opens in its own window and supports push notifications."], list: ["Android and Chrome-based browsers: use the browser's Install or Add to Home screen option", "iPhone and iPad (Safari): Share → Add to Home Screen", "Desktop browsers: use the install icon in the address bar", "The Apps screen shows a QR code so people can open the address from their phone"] },
      { heading: "Mobile apps (Android and iOS)", body: ["For a presence in the stores, the platform generates your Android and iOS apps from your branding. Android produces an installable APK and an Android Studio project you can sign and publish to Google Play. iOS produces an Xcode project that you open in Xcode, sign with your own Apple Developer team and submit to the App Store — iPhone apps cannot be installed without Apple signing."] },
      { heading: "Desktop app (Windows, macOS, Linux)", body: ["The desktop app is the same workspace in its own window, with native notifications and a system-tray icon. Download the installer for each operating system from the Apps screen."] },
      { heading: "Keeping them current", body: ["Because the apps load your workspace, changes to branding, products and features appear without reinstalling anything."], tip: "Start with the installable app for the whole team; add store apps when you want a store listing." },
    ],
  }),
  d({
    slug: "custom-domain", title: "Connect your own web address (domain) with a secure connection", summary: "Put your website and workspace on your own address.", category: "Your brand & apps", readMinutes: 5, shot: "domains", panel: "website",
    sections: [
      { heading: "Your addresses", body: ["Every business starts with its own workspace address. Under Workspace → Custom domains you can also put your website on your own domain — for example www.yourbusiness.com — and your products on an app address such as app.yourbusiness.com."] },
      { heading: "Connect a domain", list: ["Type your domain and choose Add domain", "Copy the DNS records the screen shows (a verification TXT record and the address records for your website and products)", "Add them at your domain provider's DNS settings", "Return and verify — the platform checks ownership and issues the secure (HTTPS) certificate automatically"], shot: "domains", tip: "DNS changes can take a little while to spread. If verification does not succeed at once, try again later." },
      { heading: "Good to know", list: ["Your free workspace address keeps working while you set up", "One screen lists every domain with its status", "Certificates renew on their own"] },
    ],
  }),
  d({
    slug: "import-your-data", title: "Import leads, clients and employees from a spreadsheet (CSV)", summary: "Bring existing records in with validation that tells you what to fix.", category: "Workspace & people", readMinutes: 4, shot: "workspace", panel: "workspace",
    sections: [
      { heading: "What you can import", body: ["Workspace → Import data brings leads, clients and employees in from CSV files — the fastest way to start with real records instead of an empty system."] },
      { heading: "How it works", list: ["Choose what you are importing and download the template", "Fill it in your spreadsheet and save as CSV", "Upload it — every row is validated before anything is saved", "Fix the rows the importer lists, then import the rest"] },
      { heading: "Safe by design", body: ["Imports never trigger workflows, so bringing in existing records will not flood anyone with notifications. Each import is recorded in the audit log."] },
    ],
  }),
  d({
    slug: "invite-your-team", title: "Invite your team and choose what each person can do", summary: "Roles per product, fine-grained permissions and seat limits.", category: "Workspace & people", readMinutes: 4, shot: "workspace-users", panel: "workspace",
    sections: [
      { heading: "Invitations", body: ["Invite each person to the products they need. Each product has its own sign-in and access settings; use its invitation flow to give someone access."] },
      { heading: "Roles and permissions", body: ["Each product has its own roles — for example administrator, manager and employee. On top of a role you can grant or remove a single permission for one person, such as exporting reports or approving payments."], shot: "workspace-users" },
      { heading: "Seats", body: ["The plan sets how many people your business can have. The Users screen and Usage show how many seats you have used."] },
      { heading: "Review regularly", body: ["The audit log shows who changed what, so you can review access as the team changes."] },
    ],
  }),
  d({
    slug: "first-automations", title: "Build your first three automations", summary: "Start from templates: new-lead alerts, invoice-paid emails and leave routing.", category: "Automation & AI", readMinutes: 5, shot: "automations", panel: "workspace",
    sections: [
      { heading: "Start from a template", body: ["Open Workspace → Automations. The “Start from a template” list holds ready-made workflows — new lead notifies sales, invoice paid emails finance, a completed task notifies project managers, a leave request notifies HR. Choose Add and adjust."], shot: "automations" },
      { heading: "Three to switch on first", list: ["New lead → notify the owner, so no enquiry waits", "Invoice paid → email finance, so receipts and the ledger are never forgotten", "Leave requested → notify HR or the manager, so approvals move"] },
      { heading: "Trigger, condition, action", body: ["Every workflow has a trigger (what happened), optional conditions (only when it matters) and actions (notify, email, call a signed webhook). Switch a workflow off without deleting it, and use the run history to see what happened and why."] },
      { heading: "Stay in control", body: ["Use approvals and notifications rather than automatic changes wherever a person should decide — especially for money and customer messages."] },
    ],
  }),
  d({
    slug: "leads-and-pipeline", title: "Capture leads and run your pipeline", summary: "From a website form to a won deal, with owners and due dates.", category: "Sales & marketing", readMinutes: 5, shot: "lms", panel: "lms",
    sections: [
      { heading: "Where leads come from", body: ["Leads arrive from your website forms, campaigns, manual entry and CSV import. Each one lands in SelfRun DealFlow AI with its source, so you can see what brings enquiries in."] },
      { heading: "Work the pipeline", list: ["Every lead has an owner, a status (New, In progress, Completed, Rejected) and a due date", "Notes and two-way messages keep the history on the lead", "Pending-task alerts flag leads untouched for several days", "Saved filters segment by category, status, source and date range"], shot: "lms-leads" },
      { heading: "Measure what works", body: ["The dashboard shows pipeline health, campaign spend, attributed leads, cost per lead, qualified leads, won deals, revenue and ROI. Export the current view to CSV at any time."] },
      { heading: "When a deal is won", body: ["Marking a lead won can create the client record, so projects and invoices start without re-entering details."] },
    ],
  }),
  d({
    slug: "publish-website", title: "Build and publish your website", summary: "Pages, blog, forms, themes, menus and the publish flow.", category: "Sales & marketing", readMinutes: 6, shot: "cms-pages", panel: "cms",
    sections: [
      { heading: "A site from minute one", body: ["Every new business starts with a neutral starter website that is already live. Website → Pages lists every page; edit them in the builder."] },
      { heading: "Pages and content", list: ["Compose pages from sections; changes are saved as drafts", "Blog posts, services, careers and products are managed as content", "Forms send enquiries straight to your CRM and to the inboxes you choose", "The media library keeps images and files"], shot: "cms-pages" },
      { heading: "Look and feel", body: ["Website → Themes shows the theme library with live preview. Customise colours, fonts and components, then set up Menus, the Footer and Site identity (brand, contact and social details)."], shot: "cms-theme" },
      { heading: "Publish safely", body: ["Review pages that are waiting, then publish. Maintenance mode lets you work on the site without visitors seeing half-finished changes."] },
    ],
  }),
  d({
    slug: "ai-chatbot-website", title: "Put an AI chatbot on your website", summary: "Answer visitors around the clock from your own knowledge base.", category: "Automation & AI", readMinutes: 5, shot: "chatbot", panel: "cms",
    sections: [
      { heading: "How it works", body: ["The website chatbot answers visitors from a knowledge base you control. Under Website → AI Chatbot you add your content, set the chatbot's behaviour in AI Config, and review every conversation."], shot: "chatbot" },
      { heading: "Set it up", list: ["Add your knowledge: the pages, FAQs and documents the chatbot may answer from", "Set tone and limits in AI Config", "Switch it on for your website", "Review conversations and improve the knowledge base from real questions"] },
      { heading: "Voice conversations", body: ["Conversation AI adds voice: choose a voice and behaviour in the voice configuration, and every call is logged alongside chats."] },
      { heading: "Stay in control", body: ["The chatbot answers only from what you gave it, every conversation is stored for review, and AI usage counts against your plan's allowance."] },
    ],
  }),
  d({
    slug: "ai-assistants", title: "Create AI assistants for your team and customers", summary: "Bots with your instructions and knowledge files, with access rules and cost tracking.", category: "Automation & AI", readMinutes: 5, shot: "aibots", panel: "aibots",
    sections: [
      { heading: "What an assistant is", body: ["An assistant is a bot with its own instructions and knowledge files. Use one for staff questions, another for customers — each answers from its own material."] },
      { heading: "Create and share", list: ["Create a bot: name, instructions and knowledge files", "Choose who can use it: the team, customers, or only certain people", "People start a chat from Start new chat or Find a bot", "Managers review All chats"], shot: "aibots-bots" },
      { heading: "Track usage and cost", body: ["Usage and cost are tracked per bot, and every change is in the audit trail."] },
    ],
  }),
  d({
    slug: "invoices-and-payments", title: "Send invoices and get paid online", summary: "Invoices, payment links, receipts and your accounts, kept in step automatically.", category: "People & finance", readMinutes: 6, shot: "fms", panel: "fms",
    sections: [
      { heading: "The money-in flow", body: ["Finance → Invoices creates and sends invoices. Each can carry a payment link, so the customer pays online; the receipt and the ledger update on their own."], shot: "fms-invoices" },
      { heading: "Everything around the invoice", list: ["Credit notes adjust an invoice cleanly", "Receipts and refunds keep a trail", "Receivables shows everything customers owe", "Payment links can also be created for a student fee or a client project"] },
      { heading: "Connect your payment account", body: ["To collect through your own gateway account, connect it under Workspace → Payment account (it is the same account used for paying salaries)."] },
      { heading: "Chase what is overdue", body: ["Switch on the overdue-invoice automation to remind customers and notify your finance team."] },
    ],
  }),
  d({
    slug: "run-payroll", title: "Run payroll and give employees self-service", summary: "Attendance, leave, salary revisions, payslips and payouts that post to Finance.", category: "People & finance", readMinutes: 6, shot: "hrms-payroll", panel: "hrms",
    sections: [
      { heading: "Set up people first", body: ["Add employees (or import them), then departments and reporting lines. Leave types, balances and holidays are configured in SelfRun TalentOS."] },
      { heading: "Set up payroll once", body: ["In Payroll → Settings choose which registrations your company has (PF, ESI, professional tax, labour welfare fund), how paid days are counted, overtime and the default tax regime. Add each employee's PAN, UAN and salary structure. Tax slabs and statutory rates are kept by SelfRun for every company, so you do not enter them."] },
      { heading: "Run a payroll month", list: ["Add one-off bonuses, recoveries, loans and exits under Payroll items", "Create the run: paid days come from attendance, approved leave and holidays", "Read the checks at the top and the notes on each payslip; hold a salary if something is unresolved", "Approve the run, then download the PF, ESI, professional tax and TDS files", "Pay salaries — payouts post to SelfRun CashFlow AI automatically"], shot: "hrms-payroll" },
      { heading: "Overtime, partial leave and expenses", body: ["Employees ask under My Requests: overtime they worked, a partial leave (a few hours off, two a month by default) and money they spent on work (equipment, subscriptions, internet, travel) with the bill number. Managers approve under Requests. Approved overtime and claims are paid in payroll automatically; a claim is repaid without tax."] },
      { heading: "Pay salaries through Razorpay", body: ["Connect your Razorpay account in Settings → Payments, turn on RazorpayX payouts and add the RazorpayX account number. After approving a run, select the salaries and choose Pay with Razorpay: each employee is paid from your RazorpayX balance and the salary shows as paid, with its UTR, when the bank confirms. Top up RazorpayX from your current account and record the top-up under Payroll → Company bank account so the books agree."] },
      { heading: "Pay the government", body: ["Payroll → Government payments shows what is owed to PF, ESI, income tax and the state for each approved month, with due dates. Pay on the government portals from your current account, then record the challan against that account so late payments are visible and its balance is right. Razorpay cannot pay these."] },
      { heading: "Income tax", body: ["Employees choose their regime and declare investments under My Tax; HR verifies the proofs in Payroll → Tax declarations. Tax is deducted monthly from the estimated yearly tax, and the last month settles the balance."] },
      { heading: "Employee self-service", body: ["Employees check in, request leave, and view their salary, payslips and documents themselves, so HR stops answering the same questions."] },
    ],
  }),
  d({
    slug: "projects-and-timesheets", title: "Deliver projects with tasks, timesheets and costing", summary: "Boards, timelines, approved hours and profit per project.", category: "People & finance", readMinutes: 5, shot: "pms", panel: "pms",
    sections: [
      { heading: "Plan the project", body: ["Create a project with milestones and tasks. See them as a board, a task list or a timeline, and on the calendar."], shot: "pms-projects" },
      { heading: "Track time and cost", list: ["Team members log time on a timesheet", "Managers approve timesheets", "Costing compares cost with budget so you see profitability before the project ends"] },
      { heading: "Bill from milestones", body: ["When a milestone completes it can raise the invoice in SelfRun CashFlow AI, so billing never waits for someone to remember."] },
    ],
  }),
  d({
    slug: "procurement-and-assets", title: "Control purchases, suppliers and business assets", summary: "Purchase requests, approvals, price quotes, orders, deliveries, invoices and a register of what you own.", category: "Operations", readMinutes: 5, shot: "prms", panel: "prms",
    sections: [
      { heading: "From request to payment", list: ["An employee raises a purchase request; it follows the approval chain for its amount", "Run an RFQ and compare vendors, then issue the purchase order", "Record the goods receipt, then match order, receipt and invoice", "The matched invoice becomes a payable in SelfRun CashFlow AI"], shot: "prms-purchase-orders" },
      { heading: "Assets and subscriptions", body: ["Register hardware and assign it to people, track software subscriptions with renewal alerts, and keep infrastructure and inventory in one place."] },
      { heading: "Self-service", body: ["Employees raise and follow their own requests and expense claims from My requests and My expenses."] },
    ],
  }),
  d({
    slug: "run-training", title: "Run training programs, batches and certificates", summary: "Applications, batches, classes, fees, assignments and verifiable certificates.", category: "Operations", readMinutes: 5, shot: "tms", panel: "tms",
    sections: [
      { heading: "Programs and batches", body: ["Create programs, then batches with a schedule, mentors and capacity. The batch calendar shows them all together."], shot: "tms-students" },
      { heading: "Students", list: ["Applications arrive as a list or a board", "Accepted students join a batch and get their own portal", "Track attendance, assignments and live projects", "Collect fees with reminders, and issue certificates that can be verified publicly"] },
      { heading: "Assessments", body: ["Pair training with SelfRun EvalIQ for exams and automatic evaluation."] },
    ],
  }),
  d({
    slug: "write-and-assign-sops", title: "Write procedures (SOPs) and track who has read them", summary: "Versions, assignments, read confirmations and review reminders.", category: "Operations", readMinutes: 4, shot: "sop", panel: "sop",
    sections: [
      { heading: "Write once", body: ["Create a procedure with the block editor or a template. Every change creates a new version, so the history is always there."], shot: "sop-library" },
      { heading: "Assign and prove", list: ["Assign to people, teams, departments or roles", "People acknowledge what they have read; overdue acknowledgements escalate", "Compliance reports show who is up to date", "Review and expiry schedules remind owners before a procedure goes stale"] },
    ],
  }),
  d({
    slug: "documents-and-vault", title: "Generate documents and keep credentials safe", summary: "A register of agreements with approvals — and an encrypted vault for what must not be lost.", category: "Operations", readMinutes: 5, shot: "lpms", panel: "lpms",
    sections: [
      { heading: "Documents from templates", body: ["Write documents in Playbook AI. ContractFlow keeps a register of agreements with status, owner, dates, approvals and history."], shot: "lpms-documents" },
      { heading: "A vault for credentials and files", body: ["SelfRun CyberVault holds business and per-client vaults for credentials, documents, links and notes. Records are encrypted and shared record by record; expiry alerts warn before anything lapses."], shot: "dlms-credentials" },
    ],
  }),
  d({
    slug: "social-media-and-seo", title: "Plan social media with AI and improve your SEO", summary: "Campaigns, AI drafts, approvals — and audits, rankings and fix tasks.", category: "Sales & marketing", readMinutes: 6, shot: "smms", panel: "smms",
    sections: [
      { heading: "Social media", list: ["Write a campaign brief and let AI suggest a strategy", "Turn one idea into posts adapted for each platform, with generated images", "Choose the approval step before anything publishes", "Schedule posts and track performance"], shot: "smms-posts" },
      { heading: "SEO", list: ["Audit the site for technical, on-page and content issues", "Track keywords, rankings, competitors and backlinks", "Turn issues into tasks with owners", "Manage the sitemap and robots.txt that drive your live website"], shot: "seo-keywords" },
    ],
  }),
  d({
    slug: "security-sessions-audit", title: "Sessions, devices and the audit log", summary: "See where you are signed in and who did what across every product.", category: "Security & admin", readMinutes: 4, shot: "workspace-audit", panel: "workspace",
    sections: [
      { heading: "Your sessions and devices", body: ["Open Profile & Settings from the user block at the bottom of the sidebar and choose Sessions & Devices. Every signed-in device is listed with where it signed in from; log out one, all others, or everywhere."] },
      { heading: "Free plan: one device at a time", body: ["On the Free plan you can stay signed in on one device at a time. If you sign in somewhere new while another device is signed in, you are asked first. The screen shows which device would be signed out, and nothing changes until you confirm. Paid plans have no limit on devices."] },
      { heading: "Sign-in history", body: ["Sign-ins, failed attempts and sign-outs are kept for 180 days, with an alert flag when a sign-in comes from a country the account has not used before."] },
      { heading: "The audit log", body: ["Workspace → Audit log is the one place for who did what, and when — across every product. Filter by product, action and date, and export to CSV."], shot: "workspace-audit" },
    ],
  }),
  d({
    slug: "plans-and-billing", title: "Plans, usage and billing", summary: "How plans work, what is included and how to change.", category: "Security & admin", readMinutes: 4, shot: "workspace", panel: "workspace",
    sections: [
      { heading: "What a plan sets", body: ["Every plan includes every product and every feature. A plan sets the number of people and the allowances for storage, AI, email and voice. The Free plan is free forever. The Free plan lets each person stay signed in on one device at a time; paid plans have no limit."] },
      { heading: "See what you use", body: ["Workspace → Usage shows seats, AI, email, voice and storage against your plan."] },
      { heading: "Change plan or cancel", body: ["Upgrade or move down at any time from Plan & billing. Invoices, credit notes and payments for your subscription are under Invoices & payments."] },
      { heading: "When the free trial ends", body: ["If the trial ends and no plan has been bought, the workspace is locked: every page leads to a “Subscribe to continue” screen and changes are refused. Nothing is deleted. You can still sign in and open Plan & billing, and the moment a plan is subscribed everything is available again, exactly as you left it."], tip: "Subscribe before the trial ends and your team never notices a break." },
    ],
  }),
  d({
    slug: "integrations-and-webhooks", title: "Connect other services: payments, email, AI and alerts", summary: "Connect your payment account, email sender and AI key, and send secure alerts to other software.", category: "Security & admin", readMinutes: 4, shot: "workspace", panel: "workspace",
    sections: [
      { heading: "What you can connect", list: ["A payment gateway account to collect invoice payments and pay salaries", "Your own email sender for workflow and transactional emails", "Your own AI provider key, so AI usage runs on your account", "WhatsApp, voice, web-push keys for your installed app, social and advertising accounts, Google Search and Analytics, and call servers", "Signed webhooks from any workflow to the systems you already use"] },
      { heading: "Your keys first, SelfRun's as the fallback", body: ["Whatever you connect is used by your workspace only. Anything you leave unconnected keeps working on SelfRun's own account and counts against your plan's allowance. As soon as you connect your own key, your workspace uses it instead, and if you disconnect it, SelfRun's account takes over again without a gap."] },
      { heading: "Where to find them", body: ["Workspace → Integrations lists every connection in sections — Email, Push notifications, WhatsApp, AI & Voice, Social & Advertising, Search & Analytics, Calls & Realtime and Payments — with a search box and the status of each. Some are set up on their own screens (Sender email, Payment account, Custom domains) and are linked from here. Workspace → Automations is where webhooks are used as workflow actions."] },
      { heading: "Keys stay private", body: ["Keys you save are stored encrypted, are never shown again in full, and belong to your workspace alone; no other business can use or see them."] },
    ],
  }),
  d({
    slug: "client-and-student-portal", title: "Give clients, students and applicants a portal", summary: "One branded place for projects, invoices, tests, certificates and messages.", category: "Operations", readMinutes: 4, shot: "workspace", panel: "portal",
    sections: [
      { heading: "Who it is for", body: ["The portal is where people outside your business see what concerns them: clients follow projects and pay invoices, students follow their program and download certificates, applicants track their application and take assessments."] },
      { heading: "How people join", body: ["People register themselves or you invite them. Each person sees only their own records, and your team manages portal users from the Workspace."] },
      { heading: "Keep them engaged", body: ["Rewards, referrals and a wallet are built in, so the portal gives people a reason to come back."] },
    ],
  }),
  d({
    slug: "notification-center", title: "Notification center: every email, in-app and push message", summary: "See every notification your workspace sends, change its wording, switch channels on or off and send your own announcements.", category: "Your brand & apps", readMinutes: 6, shot: "workspace", panel: "workspace",
    sections: [
      { heading: "One list for everything that is sent", body: ["Workspace → Notification center lists every email, in-app notification and push notification your workspace sends, grouped by product. Nothing is hidden: if the system sends it, it is on this list, with who receives it and when it is sent."] },
      { heading: "Turn channels on or off", list: ["Each notification has its own switches for email, in-app and push", "Security and billing emails cannot be switched off, so important messages always arrive", "If SelfRun has turned a notification off for every business, the screen says so"] },
      { heading: "Change the wording", body: ["Open any notification to see its subject and message exactly as they are sent, already filled in. Edit the text, use the values shown in curly braces such as {name} or {amount} to insert details that change each time, and preview the result before saving. Reset puts the original wording back."] },
      { heading: "Send your own announcements", list: ["Choose New announcement to open the form in a side panel", "Write the title and message, and choose email, in-app, push or any mix", "Send to everyone, to a role, or to specific people you pick from the list", "Send now, or schedule a date and time; scheduled announcements can be edited or cancelled until they go out", "The Custom tab lists every announcement you created, with its status"] },
      { heading: "See what was delivered", body: ["The activity view lists recent notifications with channel, recipient and outcome, so you can answer “did they get it?” without asking anyone."] },
    ],
  }),
  d({
    slug: "documents-and-pdf-library", title: "Documents & PDFs: every PDF your workspace makes", summary: "A library of invoices, receipts, certificates, payslips and reports, with a preview in your own letterhead.", category: "Your brand & apps", readMinutes: 4, shot: "workspace", panel: "workspace",
    sections: [
      { heading: "What the library shows", body: ["Workspace → Documents & PDFs lists every kind of PDF the system produces for your business — invoices, receipts, certificates, payslips, reports and more — grouped by product. For each one you can see what is on it, when it is made, where your team uses it and how it reaches people (download, email or both)."] },
      { heading: "Preview in your own letterhead", body: ["Choose Preview to see a sample in your own logo, name and colours. Previews use made-up figures, so nothing real is ever shown or sent."], tip: "Change your logo or colours under Branding and every preview follows." },
      { heading: "Find and track", list: ["Search by name, or filter by product and by category", "Each PDF shows how many your workspace has produced recently and when one was last made", "It also shows who can open it and which notifications tell people about it"] },
      { heading: "If SelfRun switches one off", body: ["SelfRun can turn a kind of PDF off for every business. It is then marked as turned off, and anyone who tries to produce it is told so instead of getting an error."] },
    ],
  }),
  d({
    slug: "scheduled-jobs", title: "Scheduled jobs: what runs by itself, and when", summary: "Backups, reminders, notifications, billing checks and more — with their schedules in your time zone.", category: "Security & admin", readMinutes: 3, shot: "workspace", panel: "workspace",
    sections: [
      { heading: "Nothing runs in secret", body: ["Workspace → Scheduled jobs lists the things your workspace does on its own: backups, reminders, notification sweeps, billing and trial checks, domain checks, reports, social and SEO routines, and announcements you scheduled."] },
      { heading: "What each row tells you", list: ["What the job does for your workspace, in plain words", "When it runs — shown in your own time zone as well as UTC, which is what the schedules use", "When it last ran, and a status: On schedule, Delayed, Not run yet or Paused by SelfRun", "A link to the setting that controls it, for example the Notification center for reminders", "Your scheduled announcements, with their date and time"] },
      { heading: "Who controls the schedule", body: ["The platform runs and supervises these jobs, and can pause one or change its schedule for everyone. Your view is read-only, so you always know what is happening without being able to break it."] },
    ],
  }),
  d({
    slug: "ai-prompts", title: "AI prompts: change how your assistants write and behave", summary: "Reword the instructions behind your AI assistants for your workspace only, with every version kept and security rules always applied.", category: "Automation & AI", readMinutes: 6, shot: "aibots", panel: "workspace",
    sections: [
      { heading: "What a prompt is", body: ["A prompt is the set of instructions behind an AI feature: how the Ask AI assistant answers, how the workspace assistant speaks, how social posts and contract drafts are written. Workspace → AI prompts lists every prompt in the system, grouped by area."] },
      { heading: "Which ones you can change", body: ["Prompts that shape tone and content — the Ask AI assistant, the workspace assistant, contract drafting and the social-media writers — can be reworded for your business. The rest decide what an assistant may talk about, how it handles each language and what data it can reach, so SelfRun keeps them the same for everyone. They are listed with a Locked badge so you can see exactly what exists."] },
      { heading: "Edit, preview and test", list: ["Open a prompt to see its full text, already filled in, in a side panel", "Tap a variable, such as {{brand}}, to insert a value the system fills in each time; variables that carry rules, language and identity must stay", "Preview shows how the text reads with example values, together with the security rules around it", "Compare shows your wording against the standard line by line", "Test run tries your draft on a sample message without saving anything"] },
      { heading: "Every version is kept", body: ["Each save, restore, reset and on/off switch is a new numbered version. Nothing is ever deleted: open History, pick any version and restore it — that creates a new version, so you can always go forward again as well as back. Reset returns to the standard wording."] },
      { heading: "Your wording stays yours — and stays safe", body: ["Your changes apply to your workspace only and never to another business. Whatever you write, SelfRun's fixed security rules are added before and after it on every request: the assistant works with your company's information only, never reveals its instructions or any other business's information, treats text from people and documents as data rather than orders, and never outputs secrets. Wording that tries to get around this, or that mentions other companies, secrets or the database, cannot be saved."], tip: "Start small: add one or two lines about tone or terms to use, test, then build from there." },
    ],
  }),
  d({
    slug: "company-settings-map", title: "Company settings: where everything lives", summary: "A map of every screen under Workspace → Company settings, by what you want to do.", category: "Getting started", readMinutes: 4, shot: "workspace", panel: "workspace",
    sections: [
      { heading: "Organization", list: ["Company setup and Organization profile — your name, country, currency, time zone and which products your team uses", "People & access — everyone who can sign in, their status and access in every product", "Designations & permissions — the jobs in your company and what each may do"] },
      { heading: "Billing & plan", list: ["Plan & billing — your plan, payments, coupons and GST details; this stays open even if a trial has ended", "Invoices & payments — tax invoices, credit notes and every payment for your subscription", "Usage & limits — seats, AI, storage, email, voice and domains against your plan"] },
      { heading: "Branding & domains", list: ["Branding — logo, name and colours across products, emails and PDFs", "Default domain and Custom domains — your addresses, with automatic SSL", "Sender email — send from your own address", "Apps & downloads — your own phone and desktop apps"] },
      { heading: "Connections & automation", list: ["Integrations — your own email, AI, voice, WhatsApp, push, social, Google and payment keys, with SelfRun's as the fallback", "Payment account — your own gateway for invoices and salaries", "Notification center — every email, in-app and push message, and your announcements", "Documents & PDFs — every PDF with a preview in your letterhead", "AI prompts — the wording behind your AI assistants", "Scheduled jobs — what runs by itself, and when", "Automations — when something happens, notify, email or call a webhook"] },
      { heading: "Data and security", list: ["Import data — bring leads, clients and employees in from CSV", "Backups & data — weekly backups to download and restore, and deleting your data", "Audit log — who did what, across products", "Security — your sign-in, password, sessions and accounts that need attention"] },
    ],
  }),
];

export const DOCS: Doc[] = [...migrated, ...added];
export const docBySlug = (slug: string) => DOCS.find((x) => x.slug === slug);
