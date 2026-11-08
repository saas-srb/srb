/**
 * Marketing content of the SaaS product website. Everything here describes the product — what it does for any
 * business that subscribes — and nothing about a particular customer.
 */

export interface Feature {
  title: string;
  body: string;
  icon: IconKey;
}

export type IconKey =
  | "bolt" | "brain" | "users" | "wallet" | "layers" | "shield" | "globe" | "chart" | "workflow" | "chat" | "file" | "target"
  | "cart" | "book" | "megaphone" | "search" | "bot" | "lock" | "clock" | "plug" | "rocket" | "check" | "building" | "graduation";

/** Home + Features page: what the platform gives every business. */
export const CORE_FEATURES: Feature[] = [
  { icon: "layers", title: "Independent products in one suite", body: "Choose from purpose-built products for sales, HR, finance, projects, procurement, training, documents, websites and team chat. Each has its own sign-in and database, and the suite gives you one place to manage them." },
  { icon: "workflow", title: "Automations that run on their own", body: "Build Trigger → Condition → Action workflows with no code. When a lead is won, a leave is approved or an invoice goes overdue, the right people are notified and the right records are updated automatically." },
  { icon: "brain", title: "AI that knows your business", body: "Ask questions in plain language and get answers built from your real records — with the calculation shown. AI assistants, drafting and summaries work across every module and respect each person's access." },
  { icon: "globe", title: "A website that manages itself", body: "Every workspace comes with a complete website builder: pages, blog, forms, SEO, themes and your own domain with automatic SSL — edited by your team, published in one click." },
  { icon: "shield", title: "Built for security and control", body: "Role-based access down to individual actions, a full audit trail, encrypted credentials and strict isolation between businesses. You decide who can see and change what." },
  { icon: "chart", title: "Live numbers, not month-end surprises", body: "Product-specific dashboards give teams a current view of their records. Filter by date, department or owner and export what you need." },
];

export interface ModuleCopy {
  headline: string;
  /** One plain sentence: what the product is. Shown as "In short" and as the product's description. */
  short?: string;
  summary: string;
  capabilities: string[];
  automations: string[];
  outcome: string;
  icon: IconKey;
}

/** Long-form copy per module, keyed by the Product Registry key. Names and short descriptions come from the registry itself. */
export const MODULE_COPY: Record<string, ModuleCopy> = {
  lms: {
    icon: "target",
    short: "A customer and sales list that makes sure every enquiry gets an owner, a follow-up date and a reply.",
    headline: "Turn enquiries into customers, without missing a single one",
    summary: "Your customer and sales list. Every enquiry from your website, forms, campaigns or a spreadsheet lands in one place with an owner and a follow-up date. You move each one through the steps of a sale, from first contact to won or lost, and nobody forgets to reply.",
    capabilities: ["Collect enquiries from your website forms, ads and spreadsheets", "Move each lead through the steps of a sale, with an owner, a due date and notes", "Message leads and customers back and forth in one place", "Track campaigns, offers and coupons, and see which ones bring in money", "Run referral and reward-credit programs for your customers", "Receive job applications and follow each applicant"],
    automations: ["Give each new lead to the right person by rule, and tell them", "Remind the owner when a follow-up is late", "Send a welcome message as soon as a lead arrives", "Create the client record when a deal is won"],
    outcome: "You reply faster, your sales steps stay tidy, and you can see which campaigns really bring in money.",
  },
  hrms: {
    icon: "users",
    short: "One place for your staff: their records, attendance, leave, hiring and payroll.",
    headline: "Hiring, attendance, leave and payroll in one place",
    summary: "Your staff records in one place: employee details and documents, attendance, leave, hiring and payroll. Employees check their own attendance, leave and payslips, and managers approve requests, so HR stops answering the same questions.",
    capabilities: ["Staff directory with documents and the organisation chart", "Daily attendance, with a monthly calendar and reports", "Leave types, balances, requests and approvals", "Hiring, from application to offer", "Payroll runs, salary changes and payslips", "A page for each employee: their attendance, leave, salary and documents"],
    automations: ["Tell the manager when someone asks for leave", "Create the employee record when an offer is accepted", "Warn HR before documents or probation periods end", "Pass payroll results to accounts automatically"],
    outcome: "HR saves hours every week, and employees always know where they stand.",
  },
  fms: {
    icon: "wallet",
    short: "Your invoices, bills, payments, bank accounts and financial reports in one place.",
    headline: "Accounts, invoices and cash flow you can trust",
    summary: "Everything about money coming in and going out: invoices, bills, payments, bank accounts and financial reports. It is connected to the rest of the software, so salaries, supplier payments and project billing arrive without anyone typing them again.",
    capabilities: ["Invoices, credit notes, bills and debit notes", "Receipts, payment links and payouts", "Bank and cash accounts, checked against your statements", "Chart of accounts, general ledger and trial balance (the books your accountant uses)", "Profit and loss, balance sheet, cash flow and tax reports", "Approvals, advances, expenses and invoice numbering rules"],
    automations: ["Send payment reminders for overdue invoices", "Send large expenses to an approver", "Record salary and supplier payments coming from SelfRun TalentOS and SelfRun SpendIQ", "Tell finance when a payment link has been paid"],
    outcome: "Your accounts are ready sooner, customers pay faster, and your accountant can use the reports as they are.",
  },
  pms: {
    icon: "layers",
    short: "A place to plan client projects, give out tasks, track hours and see profit.",
    headline: "Deliver projects on time and on budget",
    summary: "Run your client work: clients, projects, tasks and the hours your team works. See everything as boards, timelines and calendars, and know whether a project is making money before it ends.",
    capabilities: ["Clients with their contacts and project history", "Projects as boards, task lists and timelines", "Timesheets that managers approve", "Budget, cost and profit for every project", "My tasks and my projects for each team member", "Project documents and discussion"],
    automations: ["Tell a person when a task is given to them or is late", "Raise an invoice when a project step is finished", "Warn the manager when a project is close to its budget"],
    outcome: "Everyone knows what they own, projects finish when planned, and you see the profit before the project ends.",
  },
  prms: {
    icon: "cart",
    short: "A place to request, approve, order, receive and pay for everything your business buys.",
    headline: "Control what you spend, from request to payment",
    summary: "Everything about buying in one place: purchase requests, price quotes, orders, deliveries, supplier invoices, stock and the things your business owns. Every step has an approval, so nothing is bought or paid without a check.",
    capabilities: ["Purchase requests that follow an approval chain", "Price quotes from suppliers, compared side by side", "Purchase orders, delivery records and a three-way check of order, delivery and invoice", "Supplier list and subscription tracking", "Stock, with every movement recorded", "A register of assets and equipment, and employee expense claims"],
    automations: ["Send each request to the right approver, based on the amount", "Warn before a subscription renews", "Create a bill to pay in SelfRun CashFlow AI when an invoice matches its order"],
    outcome: "Spending is approved, tracked and checked, with no surprise invoices.",
  },
  tms: {
    icon: "graduation",
    short: "A place to run training courses, from enrolment through certificates.",
    headline: "Run training from enrolment to certificate",
    summary: "For institutes and business training teams: courses (programs), batches, classes, students, assignments, fees and certificates. Students get their own page, and anyone can check that a certificate is genuine.",
    capabilities: ["Programs, batches and class timetables", "Applications and student records", "Attendance, assignments and projects", "Fees and payments", "Certificates that can be verified", "A page for each student, and tools for mentors"],
    automations: ["Tell students about upcoming classes", "Issue a certificate when a program is completed", "Remind students about pending fees"],
    outcome: "Well-organised batches, students who stay engaged, and certificates issued without manual work.",
  },
  messenger: {
    icon: "chat",
    short: "Team chat, announcements, meetings and calls, built into your workspace.",
    headline: "Team chat that stays next to the work",
    summary: "Chat for your team inside your workspace: channels, direct messages, announcements, meetings and calls. Conversations sit next to the project or record they are about, so you do not need a separate chat app.",
    capabilities: ["Channels and direct messages, with files", "Business announcements that show who has read them", "Meetings and group calls", "Search across messages and files", "See who is online, and get notifications"],
    automations: ["Post the results of an automation into a channel", "Tell a channel when a deal is won or a task is late"],
    outcome: "One less app, fewer lost conversations, and decisions that stay linked to what they were about.",
  },
  sop: {
    icon: "book",
    short: "A library of your written procedures, with proof of who has read each one.",
    headline: "Write down how your business runs, and prove people follow it",
    summary: "Write your standard procedures (SOPs), keep every version, give each procedure to the right people and see who has read it. Reviews are scheduled, so no procedure goes out of date unnoticed.",
    capabilities: ["A library of procedures with categories, owners and versions", "A simple editor with ready-made templates", "Give procedures to people, teams, departments or roles", "See who has read each one, with compliance reports", "Review and expiry dates", "A full record of changes"],
    automations: ["Tell people about new or updated procedures", "Chase overdue read confirmations", "Remind owners before a review is due"],
    outcome: "Work is done the same way every time, new people learn faster, and you can show an auditor your records.",
  },
  lpms: {
    icon: "file",
    short: "A place to create, approve, sign and keep your business documents and agreements.",
    headline: "Create documents and agreements, and track every one",
    summary: "Build document templates, create documents from them, send them for approval and signature, and keep a register of every document with its status and history. Certificates are included.",
    capabilities: ["Templates made of reusable blocks", "Document types, each with its own approval steps", "A register of every document, with status and history", "Signatures and approvals", "Categories and a record of changes"],
    automations: ["Create documents from templates", "Send documents for approval and signature", "Tell people when a document is issued or about to expire"],
    outcome: "Professional documents in minutes, with a clear record of who approved what.",
  },
  dlms: {
    icon: "lock",
    short: "An encrypted vault for passwords, files and client documents.",
    headline: "A safe place for passwords, files and client documents",
    summary: "Keep passwords, files, links and notes in encrypted vaults: one for your business and one for each client. You choose who can open each record, and you get a reminder before anything expires.",
    capabilities: ["A vault for your business and one for each client", "Passwords and documents stored encrypted, with version history", "Access set record by record", "Expiry reminders", "A record of who opened or changed what"],
    automations: ["Warn owners before a document or password expires", "Tell people when a record is shared or changed"],
    outcome: "Important documents are easy to find, protected and never expire by surprise.",
  },
  ots: {
    icon: "check",
    short: "Online tests for hiring, staff and students, with automatic marking.",
    headline: "Test candidates, staff and students online",
    summary: "Build question banks, run timed online tests, get automatic marking and issue certificates. Use it for hiring, staff assessment and training exams, with simple results and reports.",
    capabilities: ["A question bank with categories and bulk import", "Timed tests with sections and random question order", "Assign tests to candidates, employees and students", "Automatic marking, and manual marking when needed", "Results, reports and certificates"],
    automations: ["Assign a test when an application reaches a certain step", "Tell the marker when answers are waiting", "Issue a certificate when someone passes"],
    outcome: "Hiring and training decisions based on the same fair test for everyone.",
  },
  aibots: {
    icon: "bot",
    short: "AI assistants that answer questions from your own documents.",
    headline: "Build AI assistants that know your business",
    summary: "Create AI assistants with your own instructions and documents, for your staff, your customers or both. Everyone chats with the assistant that fits them, every conversation is saved, and you can see how much each assistant is used.",
    capabilities: ["Assistants with your own instructions and knowledge files", "Chat for your team and for your customers", "Saved conversations and a record of changes", "Usage and cost tracked for each assistant", "Choose who may use each assistant"],
    automations: ["Answer customer questions around the clock", "Hand over to a person when the assistant is not sure"],
    outcome: "Quick, consistent answers for staff and customers, based on your own material.",
  },
  intelligence: {
    icon: "brain",
    short: "A way to ask questions about your business in plain English and get answers from your records.",
    headline: "Ask your business anything",
    summary: "Type a question in plain English, such as “Which invoices are more than 30 days overdue?”, and get an answer worked out from your own records. Answers come as tables or charts, with a clear explanation of how each number was calculated.",
    capabilities: ["Ask questions about your records in plain English", "Answers worked out from live data, never guessed", "Tables, charts and key numbers", "A “How this was calculated” explanation for every answer", "Each person only gets answers from data they are allowed to see"],
    automations: ["Turn a question you ask often into a regular summary"],
    outcome: "Managers get answers in seconds instead of waiting for someone to build a report.",
  },
  smms: {
    icon: "megaphone",
    short: "A calendar for planning, writing, approving and publishing social media posts, with AI help.",
    headline: "Plan, write and publish social media posts with AI",
    summary: "Plan campaigns, write posts for each social network, create images with AI, send posts for approval and publish them from one calendar. Afterwards you can see how each post performed.",
    capabilities: ["Campaign briefs, with an AI-suggested plan", "Posts adapted for each social network", "AI-written text and AI-made images", "An approval step before anything is published", "A calendar, and results for each post"],
    automations: ["Send posts for approval", "Publish on schedule", "Report on how a campaign performed"],
    outcome: "A steady, on-brand presence on social media without a big content team.",
  },
  seo: {
    icon: "search",
    short: "Tools that show why people can or cannot find your website on Google, and what to fix.",
    headline: "Get found on Google, and know what to fix",
    summary: "Check your website for problems that hurt your search ranking, track the keywords you care about and your position for each, watch who links to you, and manage your sitemap. You get a ranked list of what to fix next.",
    capabilities: ["Website checks, with the most important problems first", "Page and content analysis", "Keyword groups and ranking tracking", "Backlink monitoring (other websites linking to you)", "Sitemap and search-engine settings", "Fix tasks and reports"],
    automations: ["Turn problems found in a check into tasks for people", "Warn you when rankings or indexing change"],
    outcome: "More people find you on search, and you always know what to fix next.",
  },
  cms: {
    icon: "globe",
    short: "A website builder for your pages, blog and forms, with themes and your own web address.",
    headline: "Your website, fully in your control",
    summary: "A complete website builder. Build and edit pages, write a blog, add forms, upload images, set menus and pick a theme, all without a developer. Changes stay as drafts until you publish, and you can use your own web address.",
    capabilities: ["A drag-and-drop page builder, with draft and publish", "A blog, other content and forms", "A library for images and files", "Themes you can preview live", "Menus and footer", "Your own web address, with a secure (HTTPS) connection set up for you"],
    automations: ["Send form submissions to SelfRun DealFlow AI and to your email", "Tell the team when a page is waiting for approval"],
    outcome: "A professional website your team can change any day, without a developer.",
  },
  portal: {
    icon: "building",
    short: "A private page where customers, students and applicants see their own information.",
    headline: "A page of their own for customers, students and applicants",
    summary: "Give people outside your business one place, with your branding, to see what concerns them: their projects, invoices, tests, certificates and messages. They sign in, see only their own records and stop emailing you for updates.",
    capabilities: ["Dashboards for clients, students and applicants", "Invoices, payments and documents", "Tests and certificates", "Messages with your team", "Rewards and referrals"],
    automations: ["Tell portal users about new invoices, messages and tests"],
    outcome: "Fewer status-update emails and a better experience for the people you serve.",
  },
  support: {
    icon: "chat",
    short: "Built-in help: an AI assistant, a help center and a request desk.",
    headline: "Get answers from AI first, and from a person when you need one",
    summary: "Built-in help for your team: an AI assistant that knows which screen you are on, a help center you can search, and a request desk where you can attach files and follow a request until it is solved.",
    capabilities: ["AI help chat that knows the screen you are on", "Help articles you can search", "Support requests with attachments", "Status tracking and notifications"],
    automations: ["Create a support request directly from an AI conversation"],
    outcome: "Answers in seconds, and a clear route to a person when it matters.",
  },
  workspace: {
    icon: "bolt",
    short: "The control center where you set up your business, manage people and see everything at once.",
    headline: "The home of your business",
    summary: "The control center of SelfRun AI. From here you open every product, set up your business, invite your team, decide who can do what, switch on automations and see how the whole business is doing.",
    capabilities: ["A main dashboard, plus reports for each product", "Users, roles and permissions for each person", "A record of who did what, across every product", "Automations: when this happens, do that", "Import your data from spreadsheets", "Your brand, web address and billing"],
    automations: ["Build your own “when this happens, do that” automations"],
    outcome: "You see and control the whole business from one screen.",
  },
  website: {
    icon: "globe",
    short: "Your public website, running on your own web address.",
    headline: "A public website on your own web address",
    summary: "Publish your business website on your own web address, with a secure (HTTPS) connection set up for you. You edit it with the website builder, and every enquiry from it goes straight into your sales list.",
    capabilities: ["Your own web address, or one of ours", "A secure (HTTPS) connection, set up automatically", "Maintenance mode while you make changes", "Forms that capture enquiries"],
    automations: ["Put every enquiry straight into SelfRun DealFlow AI"],
    outcome: "A live website without hosting, plug-ins or developers to manage.",
  },
};

export interface AiCapability {
  title: string;
  body: string;
  icon: IconKey;
}

export const AI_CAPABILITIES: AiCapability[] = [
  { icon: "brain", title: "Ask your business anything", body: "Type a question like “Which customers owe us money for more than 30 days?” The AI looks through your own records, using only what you are allowed to see, and answers with a table or chart and an explanation of how it got there." },
  { icon: "bot", title: "AI assistants that know your business", body: "Create assistants with your own instructions and documents, for your staff or your customers. Every conversation is saved, and you can see how much each assistant is used." },
  { icon: "megaphone", title: "Marketing content in seconds", body: "Turn one idea into posts for each social network, create images and change the tone with one sentence. Nothing is posted until the approval step you choose." },
  { icon: "chat", title: "Help that knows where you are", body: "The help assistant knows which screen you are on, answers “how do I…” questions from the help center and can turn a chat into a support request." },
  { icon: "search", title: "Better search ranking", body: "Website checks explain why a problem matters and what to change, and score each page against what people search for." },
  { icon: "workflow", title: "AI inside your automations", body: "Add AI steps to automatic workflows: summarise a conversation, draft a reply or sort an enquiry. Keep a person in the loop wherever you want one." },
];

export interface Step {
  title: string;
  body: string;
}

export const HOW_IT_WORKS: Step[] = [
  { title: "Sign up and pick a plan", body: "Go to Sign up, enter your work email and confirm it from the email we send you. You start on the free plan, which has every feature, and no card is needed. You can move to a paid plan later, only when your team grows." },
  { title: "Set up your business", body: "A short guided setup asks for your business name and details, creates your departments, lets you invite your team by email and lets you switch products on or off. If you already have lists of customers or staff in a spreadsheet, you can import them here." },
  { title: "Add your website, AI and automations", body: "Pick a website theme and publish your website, connect the email address you send from and the AI features, and switch on the automatic reminders and approvals you want. Nothing is locked: you can change any setting later." },
  { title: "Run your business from one place", body: "Your team opens the products they need every day, such as leads, projects, invoices or leave requests. Reminders and automatic steps take care of follow-ups, and dashboards show how the business is doing. Each product still works on its own." },
];

export interface UseCase {
  slug: string;
  title: string;
  summary: string;
  /** A product-grounded workflow narrative, not a claim about a named customer. */
  narrative: string;
  problem: string;
  solution: string[];
  modules: string[];
  result: string;
}

export const USE_CASES: UseCase[] = [
  { slug: "lead-to-cash", title: "Lead to cash", summary: "From first enquiry to paid invoice without re-entering a single detail.", narrative: "A sales team captures an enquiry from its website or a campaign and follows it through each step of the sale in DealFlow. When the deal is marked won, the connected workflow creates the client and project records. As project work reaches a completed project step that can be billed, the team raises an invoice, shares a payment link and records the payment in finance.", problem: "Sales, delivery and finance live in different apps. Deals are won but the invoice is raised late, and nobody sees the full picture.", solution: ["Capture enquiries from your website and campaigns into SelfRun DealFlow AI, where every lead is followed through each step of the sale", "Create the client and project automatically when a deal is won", "Raise the invoice when a project step is finished and send a payment link", "Remind the client automatically and record the receipt in your accounts"], modules: ["lms", "pms", "fms"], result: "Shorter sales cycles, faster payments and revenue you can trace from the campaign to the cash." },
  { slug: "hire-to-retire", title: "Hire to retire", summary: "Every people process, from the job post to the final settlement.", narrative: "A hiring process begins with a job published on the business website. Applicants move through recruitment and assessment; when an offer is accepted, the employee record and assigned onboarding procedures are created. The same people workspace then supports attendance, leave requests, approvals and payroll, with self-service for employees.", problem: "Hiring, onboarding, attendance, leave and payroll are spread across spreadsheets and email, so HR spends its time chasing instead of helping.", solution: ["Publish jobs on your website and track applicants through stages", "Test candidates online and issue offers", "Create the employee record and onboarding procedures on acceptance", "Run attendance, leave and payroll with employee self-service"], modules: ["hrms", "ots", "sop", "cms"], result: "A smooth employee experience and an HR team that works on people, not paperwork." },
  { slug: "procure-to-pay", title: "Procure to pay", summary: "Approved, matched and paid — with a full trail.", narrative: "A purchase starts with a request and follows the configured approval chain. The team compares supplier quotes, issues a purchase order and records goods received. Finance can check the supplier invoice against the order and the delivery, then carry the bill into CashFlow AI for payment and accounting.", problem: "Purchases happen over chat and email, invoices arrive without a purchase order and approvals are hard to prove.", solution: ["Raise purchase requests with approval chains by amount", "Compare supplier quotes and issue purchase orders", "Check the invoice against the order and the delivery before paying", "Record the bill and the payment in SelfRun CashFlow AI"], modules: ["prms", "fms"], result: "Controlled spend, no duplicate payments and a clean audit trail." },
  { slug: "training-operations", title: "Training operations", summary: "Run programs, batches and certificates at scale.", narrative: "An institute receives applications, enrolls learners into programs and batches, then manages class schedules, attendance and assignments in one flow. Fee links and reminders support collections; completion can trigger a verifiable certificate for the learner.", problem: "Institutes juggle enrolments, schedules, fees and certificates across several apps and manual follow-ups.", solution: ["Take applications and enrol students into batches", "Schedule classes and track attendance and assignments", "Collect fees with payment links and reminders", "Issue verifiable certificates automatically"], modules: ["tms", "ots", "portal", "fms"], result: "Organised batches, on-time fees and certificates without manual work." },
  { slug: "always-on-marketing", title: "Always-on marketing", summary: "A website, social presence and SEO that keep working.", narrative: "A marketing team publishes website pages and enquiry forms, plans social content with review steps and tracks search performance. When a visitor submits an enquiry, it enters DealFlow so sales can follow up and connect the opportunity to its source.", problem: "Marketing depends on agencies and apps that do not talk to sales, so nobody knows which effort brings customers.", solution: ["Publish and update your website without a developer", "Plan campaigns and social posts with AI and approvals", "Track rankings and fix SEO issues from audit tasks", "Capture every enquiry into SelfRun DealFlow AI and measure campaign results"], modules: ["cms", "smms", "seo", "lms"], result: "Consistent marketing that is measured against real enquiries and revenue." },
  { slug: "compliance-and-documents", title: "Compliance and documents", summary: "Procedures, agreements and records that stand up to an audit.", narrative: "A team publishes controlled procedure versions, assigns them to the right people and tracks read confirmations. Agreements are written in Playbook AI, while credentials and important files are kept in the document vault with expiry alerts to prompt review.", problem: "Policies live in shared drives, nobody can prove who read what, and documents expire unnoticed.", solution: ["Publish procedures with versions and assign them to teams", "Track read confirmations and chase the overdue", "Store credentials and documents with expiry alerts"], modules: ["sop", "lpms", "dlms"], result: "Audit-ready records and a team that knows the current way of working." },
  { slug: "client-onboarding-and-delivery", title: "Client onboarding and delivery", summary: "A consistent handoff from a won deal to active project work.", narrative: "After a deal is marked won, the client and project records are created for the delivery team. The team coordinates tasks and milestones in the project workspace, shares relevant updates and documents through the client portal, and carries completed project step that can be billeds into invoicing.", problem: "Sales handoffs, project updates and client documents are scattered across inboxes, so delivery teams repeat setup and clients have to ask for status.", solution: ["Create the client and project record from a won deal", "Break delivery into assigned tasks and milestones", "Give clients a portal for project updates, invoices and documents", "Raise invoices from completed completed project step that can be billeds"], modules: ["lms", "pms", "portal", "fms"], result: "A traceable handoff and a shared view of delivery, communication and billing." },
  { slug: "customer-support-to-resolution", title: "Customer support to resolution", summary: "Give customers a clear self-service path with a human handoff when needed.", narrative: "A customer starts with a knowledge-grounded assistant or searchable help content. If the question needs a person, the conversation can become a support request with attachments and status tracking, while the support team works from a queue and keeps the customer updated.", problem: "Customers repeat the issue across channels and have no clear way to see whether support is working on it.", solution: ["Make help content searchable and available in context", "Let an assistant answer from the product knowledge you provide", "Create a support request with its attachments when escalation is needed", "Track request status and send customer notifications"], modules: ["aibots", "support", "portal"], result: "A consistent support path from self-service to a tracked human response." },
  { slug: "leadership-live-answers", title: "Leadership answers from live records", summary: "Explore product-specific business data with traceable answers and access controls.", narrative: "A manager asks a business question in plain language. SelfRun Intelligence queries the records available to that product and returns a table, chart or KPI with an explanation of the calculation. Leaders can review the source logic instead of relying on a hand-built report with unknown filters.", problem: "Leaders wait for reports, compare different spreadsheets and cannot easily check how a number was calculated.", solution: ["Ask a question in plain language about available records", "Receive an answer computed from current records", "Review the calculation and applied filters", "Keep access aligned with the signed-in person's permissions"], modules: ["intelligence", "workspace"], result: "Faster exploration with an answer that people can inspect and verify." },
  { slug: "contract-review-and-records", title: "Contract review and records", summary: "Move agreements from reusable template to approval and secure storage.", narrative: "A team prepares an agreement in Playbook AI, routes it through review and approval, and keeps a register of the agreement with its status, dates, version and activity history.", problem: "Teams reuse outdated agreement files and lose track of approvals.", solution: ["Start from a reusable document template in Playbook AI", "Route the agreement through review and approval", "Keep the record with its status, dates and history", "Store related files securely"], modules: ["lpms", "dlms"], result: "A more controlled agreement lifecycle with a retrievable record of review." },
];

export interface Industry {
  slug: string;
  name: string;
  summary: string;
  needs: string[];
  modules: string[];
}

export const INDUSTRIES: Industry[] = [
  { slug: "it-and-software", name: "IT & software businesses", summary: "Run client projects, track the hours your team works, bill clients and hire people, without moving data between apps.", needs: ["Project delivery with timesheets and costing", "Client billing from milestones", "Recruitment and online assessments", "A website and SEO that bring in enquiries"], modules: ["pms", "fms", "hrms", "ots", "cms"] },
  { slug: "education-and-training", name: "Education & training institutes", summary: "Run courses and batches, keep student records and attendance, collect fees and give out certificates, with a page where students see their own progress.", needs: ["Applications and enrolment", "Batch schedules and attendance", "Fee collection and receipts", "Certificates and a page where students follow their progress"], modules: ["tms", "ots", "portal", "fms"] },
  { slug: "agencies-and-consultancies", name: "Agencies & consultancies", summary: "Keep track of every possible client, deliver the work on time, record hours and see whether each engagement is making money.", needs: ["A customer list, sales steps and proposals", "Projects, tasks and approvals", "Time tracking and profitability", "Marketing and social content"], modules: ["lms", "pms", "fms", "smms"] },
  { slug: "trading-and-distribution", name: "Trading & distribution", summary: "Control what you buy, what is in stock, what you owe suppliers and what customers still owe you.", needs: ["Purchase requests, orders and deliveries", "Inventory and stock movements", "Supplier invoices and payments", "Customer invoicing and collections"], modules: ["prms", "fms", "lms"] },
  { slug: "professional-services", name: "Professional services", summary: "Keep agreements, documents, client records and billing in order, with a secure place for sensitive files.", needs: ["Document templates and approvals", "Secure document vault", "A page of their own for clients", "Time and billing"], modules: ["lpms", "dlms", "portal", "fms"] },
  { slug: "growing-smes", name: "Growing small & medium businesses", summary: "Start with the few products you need today, add more as the business grows, and manage them all from one place.", needs: ["Start with the products you need today", "Start with the products you need", "Add products as you grow", "Affordable monthly pricing"], modules: ["workspace", "lms", "hrms", "fms"] },
];

export interface Faq {
  q: string;
  a: string;
  /** Group shown on the FAQ page. */
  topic?: string;
}

export const FAQS: Faq[] = [
  { q: "What is SelfRun AI?", a: "SelfRun AI is one online system for running a business. It brings your customers and sales, staff and payroll, invoices and accounts, projects, purchasing, training, documents, website and team chat into one place. AI and automatic reminders and approvals work across it. You open it in a web browser or in your own apps, and it carries your business name and logo." },
  { q: "Do I need to use every part?", a: "No. Switch on only the products you need during setup. For example, you can begin with customers and invoices and add staff records or projects later. You can turn products on or off at any time from your workspace settings." },
  { q: "Is there a free plan?", a: "Yes. The free plan is free forever and includes every feature, with no card needed. Paid plans are for bigger teams: they allow more people and give you more storage and more AI, email and voice usage." },
  { q: "How long does setup take?", a: "A guided setup takes a few minutes. It asks for your business details, creates your departments, invites your team and lets you choose the products you want. If you already keep lists of leads, clients or employees in a spreadsheet, you can import them from a CSV file." },
  { q: "Can I use my own domain for my website?", a: "Yes. On plans that include a custom domain you can use your own web address, such as yourbusiness.com, and the secure (HTTPS) certificate is set up for you automatically. Every workspace also gets its own address from the start, so you can begin before you connect a domain." },
  { q: "How does the AI use my data?", a: "The AI only looks at your own business's records, and only at what the person asking is allowed to see. Its answers show how they were worked out, so you can check them. AI usage is counted per plan, so there are no surprises." },
  { q: "Is my business's data kept separate from other businesses?", a: "Yes. Every record belongs to one business, and the platform itself limits every request to that business. This is not left to individual screens. One business can never see another business's data." },
  { q: "Who can see what inside my business?", a: "You decide. Give each person a role, such as Manager or Accountant, and choose what that role may see and do in each tool. Important actions are recorded in a log, so you can see who did what and when." },
  { q: "Can I import my existing data?", a: "Yes. Leads, clients and employees can be imported from a CSV (spreadsheet) file. The importer checks each row and tells you exactly what needs fixing before anything is saved." },
  { q: "What happens if I cancel?", a: "You can cancel from your billing page. After the plan ends your workspace stays readable for a period, so you have time to export everything you need." },
  { q: "How is pricing calculated?", a: "Pricing is per business workspace. The plan you choose sets how many people can use it and how much storage and AI, email and voice usage you get. Prices are shown in your currency and do not include taxes." },
  { q: "Can I get a demo?", a: "Yes. Ask for a demo and we will walk you through the platform using examples from your own business. Or start free and explore on your own." },
];


/** More answers, grouped by topic on the FAQ page. */
export const FAQS_MORE: Faq[] = [
  { topic: "Data & security", q: "Can one business see another business's data?", a: "No. Every record belongs to one business and the platform adds that business to every database query itself, so a page, report or export cannot ask for another business's rows. See Security & Trust." },
  { topic: "Data & security", q: "Can the AI change my data on its own?", a: "No. Business questions use read-only queries with the asker's permissions. When an assistant proposes to create, edit or delete something, nothing happens until the person approves it, deletes ask for a second confirmation, and every action is logged." },
  { topic: "Data & security", q: "Can I export my data or leave?", a: "Yes. Tables can be exported to CSV or Excel and documents downloaded as PDF. If you cancel, the workspace stays readable so you can export, and you can ask for permanent deletion of your business's data." },
  { topic: "Data & security", q: "Who can see salaries, payroll and financial statements?", a: "Only people with the specific permission for them. Payroll, salary, bank and statement views are limited by role, even for managers, and every export and change is recorded in the audit log." },
  { topic: "Support", q: "How do I get support?", a: "Inside the product the Help & Support product has a help center, an AI help assistant and support requests you can follow from open to resolved, with attachments and notifications. You can also write to us through the contact page." },
  { topic: "Plans & pricing", q: "What does the Free plan include?", a: "Every feature, free forever. Paid plans add more people and bigger storage, AI, email and voice allowances." },
  { topic: "Plans & pricing", q: "Are any features locked behind a higher plan?", a: "No. Every plan includes every feature. Plans differ only by team size and by allowances." },
  { topic: "Plans & pricing", q: "Can I change plans later?", a: "Yes. You can upgrade as your team grows or move down when you need less. Your data stays in place." },
  { topic: "Plans & pricing", q: "Are prices shown with tax?", a: "No. Prices exclude applicable taxes, and invoices show the tax separately." },
  { topic: "Your brand", q: "Will my team and clients see SelfRun's brand?", a: "No. Your logo, name, colours, domain, emails and apps carry your business's identity. SelfRun stays in the background." },
  { topic: "Your brand", q: "Can I have my own mobile and desktop apps?", a: "Yes. The platform generates your installable app, Android and iOS apps and Windows, macOS and Linux desktop apps from your branding. For the stores you sign the Android and iOS projects with your own developer accounts." },
  { topic: "Your brand", q: "Can I use more than one website theme?", a: "Yes. The theme library lets you preview, activate and customise themes — colours, fonts and components — and switch whenever you like." },
  { topic: "Your brand", q: "Do push notifications come from my business?", a: "Yes. Push notifications reach your team and your website visitors in your name, on the devices where they have allowed them." },
  { topic: "AI & automation", q: "What can I ask the AI?", a: "Anything about your business data in plain language — for example overdue invoices, leads by source, who is on leave or which projects are late. It answers with text, a table or a chart and shows how it calculated the answer." },
  { topic: "AI & automation", q: "Can the AI change my data?", a: "No. Questions are answered with read-only queries, and the AI only uses data the person asking is allowed to see." },
  { topic: "AI & automation", q: "Do I need to write code to automate things?", a: "No. Workflows are built from a trigger, optional conditions and actions on a settings screen, starting from ready-made templates." },
  { topic: "AI & automation", q: "Can I build an AI assistant on my own documents?", a: "Yes. Create a bot with your instructions and knowledge files, choose who can use it, and track its usage and cost." },
  { topic: "AI & automation", q: "Can AI answer my website visitors?", a: "Yes. The website chatbot answers from a knowledge base you control, and Conversation AI adds voice. Every conversation is logged for review." },
  { topic: "Apps & devices", q: "Which devices are supported?", a: "The web app works in any modern browser. You can install it on Android, iPhone and iPad, Windows, macOS, Linux and ChromeOS, and generate Android, iOS and desktop apps." },
  { topic: "Apps & devices", q: "Do the apps need updating when you add features?", a: "No. The apps load your workspace, so new features and branding changes appear without reinstalling." },
  { topic: "Data & security", q: "Can I export my data?", a: "Yes. You can export records and reports at any time, and after a plan ends your workspace stays readable for a period so you can take what you need." },
  { topic: "Data & security", q: "How do I see who did what?", a: "Each product keeps its own activity records and sign-in history. Open that product's audit tools to review and export the activity available there." },
  { topic: "Data & security", q: "How are passwords and credentials protected?", a: "Credentials, API keys and vault documents are encrypted at rest, and business data is isolated from every other business at the data layer." },
  { topic: "Setup", q: "How do I get my existing data in?", a: "Import leads, clients and employees from CSV. Every row is validated and the importer tells you exactly what to fix. Imports never trigger workflows." },
  { topic: "Setup", q: "Can I use my own domain?", a: "Yes. Add your domain, publish the DNS records shown, and the platform verifies it and issues the SSL certificate automatically." },
  { topic: "Setup", q: "Do I have to use every product?", a: "No. Choose the products you need. Each product runs independently with its own sign-in and database; add other products whenever you are ready." },
  { topic: "Support", q: "Where do I get help?", a: "Signed-in users have an AI help assistant that knows the screen they are on, a searchable help center and a request desk with status tracking. You can also contact the team from this website." },
];

export interface Integration {
  name: string;
  body: string;
  icon: IconKey;
}

export const INTEGRATIONS: Integration[] = [
  { name: "Payments", body: "Collect payments through your own payment account, with a payment link on every invoice.", icon: "wallet" },
  { name: "Email", body: "Send invoices, reminders and notifications from your own email address.", icon: "chat" },
  { name: "Your AI account", body: "Use your own AI account key, so AI usage runs on your account and under your control.", icon: "brain" },
  { name: "Social platforms", body: "Connect your business pages to plan, approve and publish posts from one calendar.", icon: "megaphone" },
  { name: "Alerts to other software", body: "Send secure alerts from any automatic workflow to the software you already use.", icon: "plug" },
  { name: "Search and website statistics", body: "Connect Google Search Console and your website statistics tags to your website and search tools.", icon: "search" },
  { name: "Spreadsheet import and export", body: "Bring your data in from spreadsheet (CSV) files, with checks, and take reports out whenever you need them.", icon: "file" },
  { name: "Your own web address", body: "Show your website and workspace on your own web address, with a secure (HTTPS) connection set up automatically.", icon: "globe" },
];

export const SECURITY_POINTS: Feature[] = [
  { icon: "lock", title: "Your data stays yours alone", body: "Every record belongs to one business, and every request to the database is limited to that business. One business can never see another's data." },
  { icon: "users", title: "The right access for each person", body: "Choose who can see and do what in each product, so people only get what their job needs." },
  { icon: "file", title: "A record of every action", body: "Sign-ins, changes, exports and admin actions are recorded: who did what, and when." },
  { icon: "shield", title: "Secrets stored encrypted", body: "Passwords, API keys and vault documents are encrypted when stored, with the keys kept outside the database." },
  { icon: "clock", title: "Dependable", body: "Your web address gets a secure (HTTPS) certificate automatically, background jobs run on schedule, and billing gives you a grace period before anything is restricted." },
  { icon: "check", title: "You own your data", body: "Export your records whenever you like. Your data is used to run your workspace and nothing else." },
];

export interface ResourceArticle {
  slug: string;
  title: string;
  summary: string;
  category: "Getting started" | "Automation" | "AI" | "Website" | "Administration";
  readMinutes: number;
  sections: { heading: string; body: string[] }[];
}

export const RESOURCES: ResourceArticle[] = [
  {
    slug: "getting-started",
    title: "Getting started: from sign-up to your first week",
    summary: "The quickest path from a new account to a workspace your whole team is using.",
    category: "Getting started",
    readMinutes: 5,
    sections: [
      { heading: "Before you begin", body: ["You need a work email address and about ten minutes. No technical knowledge is required, and no card is needed: the free plan includes every feature."] },
      { heading: "Create your account", body: ["Register with your work email and choose a plan. We email you a verification link; open it to activate your account. You start on the free plan and move to a paid plan only when your team grows."] },
      { heading: "Complete the guided setup", body: ["The first time you sign in, the setup asks for your business details, creates your departments from a template that fits your industry, lets you invite your team and lets you choose which products to switch on.", "You can skip the setup and return to it later. A banner keeps it one click away until it is done."] },
      { heading: "Invite your team and set roles", body: ["Invite people by email and give each one a role. A role decides which products a person can open and which actions they may take. You can fine-tune the permissions of any single person at any time."] },
      { heading: "Bring in your data", body: ["Import leads, clients or employees from a spreadsheet (CSV file) under Workspace → Import data. The importer checks every row and lists exactly what to fix before anything is saved."] },
      { heading: "Your first week", body: ["Day one: invite the team and import your contacts. Day two: set up one automation, such as notifying the owner of every new lead. Day three: choose a website theme and publish. By the end of the week your team is working inside SelfRun AI and the dashboards are filling with live numbers."] },
      { heading: "If you get stuck", body: ["Every screen has the AI help assistant, which knows which screen you are on, and this documentation covers each feature step by step. You can also write to the team from the Contact page."] },
    ],
  },
  {
    slug: "automation-basics",
    title: "Automation basics: when this happens, do that",
    summary: "How automatic workflows work, and three worth switching on first.",
    category: "Automation",
    readMinutes: 6,
    sections: [
      { heading: "What an automation is", body: ["An automation is a rule that runs by itself. When something happens, the system does something in response. For example: when a new lead arrives, notify the person who owns it. You set the rule once and it works every time."] },
      { heading: "The three parts of every automation", body: ["The trigger is what happened, such as a lead being created. The condition is optional and limits when the rule applies, such as only when the deal value is above a set amount. The action is what the system then does: send an email, notify a person, or send a secure alert (a webhook) to other software you use."] },
      { heading: "Where to find them", body: ["Open Workspace → Automations. You will see your automations and a list of ready-made templates. Each automation can be switched off without deleting it, and a run history shows what happened and why."] },
      { heading: "Three to start with", body: ["Notify the owner when a new lead arrives. Remind the owner when a follow-up is overdue. Email your finance team when an invoice is seven days overdue."] },
      { heading: "Keeping people in control", body: ["An automation can notify someone and ask for approval instead of acting on its own. Use approvals for anything that moves money or changes records that are hard to undo."] },
      { heading: "Good to know", body: ["Importing existing data never triggers automations, so bringing in your records will not flood anyone with notifications."] },
    ],
  },
  {
    slug: "ask-your-business",
    title: "Ask questions about your business with AI",
    summary: "What you can ask, how the answers are produced and how access is respected.",
    category: "AI",
    readMinutes: 4,
    sections: [
      { heading: "Ask in your own words", body: ["Type a question the way you would ask a colleague. The assistant chooses the records to look at, runs a read-only search and answers with text, a table or a chart."] },
      { heading: "Questions to try", body: ["How many leads did we get last month, by source?", "Which invoices are more than 30 days overdue?", "Who is on leave this week?", "Which projects are running late?"] },
      { heading: "Answers you can check", body: ["Every answer includes a “How this was calculated” section that lists the data used and the filters applied, so you can verify the number instead of trusting it blindly."] },
      { heading: "Access is respected", body: ["The assistant can only use data the signed-in person is allowed to see. Sensitive fields are never offered to it, and because it only reads, it can never change your data."] },
    ],
  },
  {
    slug: "your-website",
    title: "Publish your website and use your own web address",
    summary: "Themes, pages, forms and your own domain, with a secure connection set up for you.",
    category: "Website",
    readMinutes: 5,
    sections: [
      { heading: "Choose a theme", body: ["Pick a theme in Website → Themes and preview it live before you apply it. A theme controls colours, fonts, corner style and the layout of the header, footer and sections."] },
      { heading: "Edit pages and content", body: ["The page builder lets you add, reorder and edit sections. Changes are saved as drafts and go live when you publish, so you can prepare a whole update before visitors see any of it."] },
      { heading: "Forms that feed your sales list", body: ["Contact and enquiry forms send each submission straight into your sales list (SelfRun DealFlow AI) and to the inboxes you choose, with spam protection built in."] },
      { heading: "Connect your own web address", body: ["In Workspace → Custom domains, add your domain and publish the DNS records shown at your domain provider. The platform then checks that you own the domain and sets up the secure (HTTPS) certificate automatically. Until then your website stays available on your workspace address."] },
    ],
  },
  {
    slug: "users-and-permissions",
    title: "Users, roles and permissions",
    summary: "Give every person exactly the access their job needs.",
    category: "Administration",
    readMinutes: 4,
    sections: [
      { heading: "Why it matters", body: ["Not everyone should see everything. A salesperson needs leads, an accountant needs invoices, and only a few people should see salaries. Roles and permissions let you decide this once and keep it tidy."] },
      { heading: "Roles", body: ["Each product has its own roles, for example administrator, manager and employee. A person can hold a role in several products at once."] },
      { heading: "Fine-grained permissions", body: ["On top of a role you can give or remove a single permission for one person, such as the right to export reports or to approve payments."] },
      { heading: "Review activity", body: ["The audit log shows sign-ins, changes and exports across your workspace, and you can filter it by person, area and date."] },
    ],
  },
];

/** Home page overview: the questions a first-time visitor has, answered without jargon. */
export const SIMPLE_ANSWERS: { title: string; text: string; icon: IconKey; points: string[] }[] = [
  { title: "What is it?", icon: "layers", text: "SelfRun AI is a website you open in your browser. It handles the daily office work of a business: customer lists, staff records, invoices, projects, purchases, training, documents and your public website. Everything is in one place instead of in many different apps.", points: ["Nothing to install to get started", "Works on a phone and on a computer", "Each person on your team has their own sign-in"] },
  { title: "What does it do for me?", icon: "bolt", text: "It keeps your information in one place, reminds people when something needs doing, asks the right person for approval and shows you live reports. The AI inside can answer questions about your business and help you write.", points: ["Keeps records of customers, staff, money and projects", "Reminds and follows up for you", "Shows live reports, so you do not build them by hand", "AI answers questions and drafts text"] },
  { title: "Who is it for?", icon: "users", text: "Any business with a team and paperwork to manage: IT and software businesses, training institutes, agencies and consultancies, traders and distributors, professional firms and growing small and medium businesses.", points: ["You do not need an IT team", "Start with a few products and add more as you grow", "Each person sees only what their role allows"] },
  { title: "Do I need technical skills?", icon: "rocket", text: "No. A short guided setup asks for your business details, creates your departments and helps you invite your team. You can bring in your existing lists from a spreadsheet (CSV file), and a help center and an AI help assistant explain each screen.", points: ["Guided setup takes minutes, not weeks", "Import customers, clients and staff from a spreadsheet", "Help center and AI help inside the product"] },
  { title: "What does it cost?", icon: "wallet", text: "Starting is free, and the free plan includes the whole software with every feature. You pay only when your team grows. Paid plans differ by team size and usage limits, not by features, and no card is needed to start.", points: ["Free to start, no card needed", "No features locked behind a higher plan", "The Pricing page shows every plan"] },
  { title: "Will it look like my business?", icon: "target", text: "Yes. Your logo, name, colours, web address, emails and apps carry your business's identity, so your team and customers see your business and not SelfRun.", points: ["Your own logo and colours everywhere", "Your own web address for your website", "Your own mobile and desktop apps, made when you press Generate"] },
];

/** The words used on the home page, in plain language. */
export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "CRM", meaning: "A list of your customers and possible customers, with every conversation, follow-up and deal in one place, so nobody forgets to reply. In SelfRun this is the sales product, SelfRun DealFlow AI." },
  { term: "Lead", meaning: "A person or business that has shown interest in what you sell but has not bought yet." },
  { term: "Pipeline", meaning: "The steps a sale goes through, for example enquiry, meeting, quote, won. It shows where every deal stands right now." },
  { term: "Payroll", meaning: "Working out each person's pay for the month and giving them a payslip." },
  { term: "Invoice", meaning: "A bill you send to a customer for work or goods, showing what they owe and how to pay it." },
  { term: "Automation (workflow)", meaning: "A rule that says “when this happens, do that”. For example, when an invoice is overdue, send a reminder. You set it once and it runs by itself." },
  { term: "Dashboard", meaning: "One screen of live numbers and charts, such as sales this month or unpaid invoices." },
  { term: "Portal", meaning: "A private page where your customers, students or job applicants can see their own information, such as invoices, tests or certificates." },
  { term: "Role and permission", meaning: "A role is a type of job, such as Manager or Accountant. Permissions say what each role may see and do, so people only get what they need." },
  { term: "Audit log", meaning: "A record of who did what and when, so you can check any change later." },
  { term: "Web address (domain)", meaning: "Your website's name, such as yourbusiness.com. You can use your own instead of ours." },
  { term: "Push notification", meaning: "A short message that appears on a phone or computer, even when the app is closed, for example “A new lead was assigned to you”." },
  { term: "CSV file", meaning: "A simple spreadsheet file. You can use one to bring your existing lists into SelfRun, or to take your data out." },
  { term: "Your brand (white label)", meaning: "Software that carries your business name, logo and colours instead of its maker's. Your customers see your brand, not SelfRun." },
  { term: "AI assistant", meaning: "A chat helper that answers questions from your own records and documents and helps you write. It only shows what the person asking is allowed to see." },
  { term: "Installable web app", meaning: "A website you add to the home screen of your phone or computer so it opens like a normal app, without going through an app store." },
];

/** Everyday-language names for the use cases, for the home page. */
export const USE_CASE_PLAIN_TITLES: Record<string, string> = {
  "lead-to-cash": "From first enquiry to payment",
  "hire-to-retire": "Hiring and looking after your staff",
  "procure-to-pay": "Buying from suppliers and paying them",
  "training-operations": "Running training courses",
  "always-on-marketing": "Marketing that keeps working",
  "compliance-and-documents": "Policies, procedures and documents",
  "client-onboarding-and-delivery": "Starting and delivering client work",
  "customer-support-to-resolution": "Helping customers",
  "leadership-live-answers": "Answers for managers, from real numbers",
  "contract-review-and-records": "Agreements and contracts",
};
