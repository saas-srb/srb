/**
 * Long-form detail for each product's page: who uses it, how work moves through it and what it connects to. Written from what the
 * product really does (its screens, roles and the automations listed in `content.ts`); nothing here is planned or invented.
 */
export interface PanelDetail {
  /** One sentence that opens the "How it works" section. */
  intro: string;
  audience: { who: string; does: string }[];
  workflow: { title: string; text: string }[];
  connects: { panel: string; text: string }[];
  /** Questions the AI can answer from this product's data (only where AI Intelligence reads it). */
  ask?: string[];
}

export const PANEL_DETAIL: Record<string, PanelDetail> = {
  workspace: {
    intro: "The Workspace is where the business is run from: every product's numbers, every person's access and every automation in one place.",
    audience: [
      { who: "Founders & owners", does: "Watch the whole business on one dashboard and control access, billing and brand." },
      { who: "Administrators", does: "Invite people, assign roles, import data and switch products on or off." },
      { who: "Managers", does: "Open any product's analytics with date, department and owner filters." },
      { who: "Everyone", does: "Get one notification inbox and one place to manage their own sessions and devices." },
    ],
    workflow: [
      { title: "Set up", text: "A guided setup captures your business profile, departments and the products your team uses." },
      { title: "Invite", text: "Invite people by email with a role; verified accounts get access to exactly the products you choose." },
      { title: "Automate", text: "Build “when this happens, do that” workflows from templates or from scratch." },
      { title: "Oversee", text: "Follow every product's live numbers, the audit log, usage against your plan and security." },
    ],
    connects: [
      { panel: "intelligence", text: "Ask questions in plain English about the data across all your products." },
      { panel: "support", text: "Get help and send requests to the support team from inside the Workspace." },
      { panel: "portal", text: "Decide which people outside your business get a portal, and see what they do there." },
    ],
  },
  lms: {
    intro: "Every enquiry enters once, gets an owner and a due date, and moves through clear steps until it is won — or closed with a reason.",
    audience: [
      { who: "Sales & enquiry teams", does: "Work leads, log notes and follow up on time." },
      { who: "Managers", does: "See how the sales steps are going, stale leads and which campaigns bring revenue." },
      { who: "HR & recruiters", does: "Track career applicants with status, notes and resumes." },
      { who: "Marketing", does: "Measure campaign spend, attributed leads and ROI." },
    ],
    workflow: [
      { title: "Capture", text: "Website forms, campaigns and spreadsheet (CSV) imports all create leads in one list." },
      { title: "Assign", text: "A rule gives each lead an owner, who is notified and sees a due date." },
      { title: "Follow up", text: "Notes, two-way messages and reminders keep every lead moving; stale ones are flagged." },
      { title: "Win", text: "When a deal is won the client record is created for you and projects can start." },
    ],
    connects: [
      { panel: "pms", text: "When a deal is won, the client record and the project's starting point are created." },
      { panel: "fms", text: "Invoices can be raised for won clients without retyping their details." },
      { panel: "cms", text: "Website forms send enquiries straight into your sales list." },
      { panel: "smms", text: "Campaign results sit next to the leads they brought in." },
    ],
    ask: ["How many leads did we get last month, by source?", "Which leads have had no follow-up for a week?", "What is our conversion from new to won this quarter?"],
  },
  hrms: {
    intro: "From the job post to the final settlement, every people process lives on one employee record that HR, managers and employees all use.",
    audience: [
      { who: "HR team", does: "Run recruitment, employee records, leave rules and payroll." },
      { who: "Managers", does: "Approve leave and see their team's attendance." },
      { who: "Employees", does: "Check in, request leave, view payslips and documents themselves." },
      { who: "Director", does: "Set permissions and see HR analytics for the whole business." },
    ],
    workflow: [
      { title: "Hire", text: "Applications move through the hiring steps; an accepted offer creates the employee record." },
      { title: "Onboard", text: "Documents, department and reporting line are filled in one place." },
      { title: "Run daily operations", text: "Attendance, leave requests, holidays and approvals flow to the right manager." },
      { title: "Pay", text: "Payroll runs, salary revisions and payslips — and the payout posts to SRB CashFlow AI." },
    ],
    connects: [
      { panel: "fms", text: "Salary payments are passed to accounts automatically." },
      { panel: "ots", text: "Candidates take online tests from inside your hiring process." },
      { panel: "sop", text: "New joiners are given the procedures they need to read." },
      { panel: "messenger", text: "Leave and approval notifications can reach your team channel." },
    ],
    ask: ["Who is on leave next week?", "How many people joined this quarter, by department?", "What is the monthly payroll trend?"],
  },
  fms: {
    intro: "Money in, money out, the bank, your accounts and the reports — all fed by the other products, so the books are never re-typed.",
    audience: [
      { who: "Finance managers", does: "Approve payouts, watch cash flow and close periods." },
      { who: "Accountants", does: "Post, match against bank statements and report from your accounts." },
      { who: "Collections & receivables", does: "Send invoices and payment links and chase what is overdue." },
      { who: "Auditors", does: "Read-only access to reports and the audit trail." },
    ],
    workflow: [
      { title: "Invoice", text: "Create an invoice, send it with a payment link and track it until it is paid." },
      { title: "Collect", text: "Customers pay online; receipts and your accounts update on their own." },
      { title: "Pay out", text: "Supplier bills, expenses, advances and salaries go through approvals before payout." },
      { title: "Match against bank statements & report", text: "Match bank and cash, then read profit & loss, balance sheet, cash flow and tax reports." },
    ],
    connects: [
      { panel: "lms", text: "Clients won in sales become customers you can invoice." },
      { panel: "pms", text: "Finished milestones raise invoices, and project costs feed profit figures." },
      { panel: "hrms", text: "Payroll runs and salary payments arrive from HR." },
      { panel: "prms", text: "Supplier invoices that match an order become bills to pay." },
      { panel: "tms", text: "Student fees and receipts are recorded in accounts." },
    ],
    ask: ["Which invoices are more than 30 days overdue?", "What was our net profit this month?", "Which customers owe us the most?"],
  },
  pms: {
    intro: "Clients, projects, tasks, time and cost on one board, so delivery stays on time and profitable.",
    audience: [
      { who: "Project managers", does: "Plan, assign, track and bill delivery." },
      { who: "Team members", does: "Work from their own task list and log time." },
      { who: "Account managers", does: "Keep the client relationship and project history together." },
      { who: "Leadership", does: "See portfolio health, utilisation and profitability." },
    ],
    workflow: [
      { title: "Plan", text: "Create the project with milestones, tasks, owners and dates on a board and timeline." },
      { title: "Deliver", text: "Team members update tasks and log time; overdue work notifies the assignee." },
      { title: "Control", text: "Timesheets are approved and costs are compared with the budget." },
      { title: "Bill", text: "A completed milestone can raise the invoice in SRB CashFlow AI." },
    ],
    connects: [
      { panel: "lms", text: "Projects start from clients won in SRB DealFlow AI." },
      { panel: "fms", text: "Billing by milestone and profit per project." },
      { panel: "messenger", text: "Every project can have its own discussion channel." },
      { panel: "portal", text: "Customers see progress on their own page." },
    ],
    ask: ["Which projects are overdue?", "What is our team utilisation this month?", "Which project has the lowest margin?"],
  },
  prms: {
    intro: "A purchase is requested, approved, ordered, received, matched to the invoice and paid — with a record at every step.",
    audience: [
      { who: "Employees", does: "Raise purchase requests and expense claims and follow their status." },
      { who: "Approvers", does: "Approve by amount, with budgets in view." },
      { who: "Procurement team", does: "Run RFQs, suppliers, purchase orders and delivery records." },
      { who: "IT & facilities", does: "Keep the asset register, subscriptions and infrastructure." },
    ],
    workflow: [
      { title: "Request", text: "A purchase request goes through the approval chain for its amount." },
      { title: "Source", text: "Run an RFQ, compare suppliers and issue the purchase order." },
      { title: "Receive & match", text: "Record the delivery record, then match order, receipt and invoice." },
      { title: "Pay", text: "The matched invoice becomes a bill to pay in SRB CashFlow AI." },
    ],
    connects: [
      { panel: "fms", text: "Supplier invoices that match an order are passed to accounts as bills to pay." },
      { panel: "pms", text: "Purchases for a project are charged to that project." },
      { panel: "workspace", text: "Subscription renewals and approvals reach the right people." },
    ],
    ask: ["What did we spend on suppliers this month?", "Which subscriptions renew in the next 30 days?", "Which purchase requests are still waiting for approval?"],
  },
  tms: {
    intro: "Programs, batches, students, fees and certificates — for institutes and corporate training teams — with a portal for every student.",
    audience: [
      { who: "Training managers", does: "Design programs and batches and watch enrolment and revenue." },
      { who: "Mentors & trainers", does: "Run classes, review assignments and guide projects." },
      { who: "Admissions", does: "Take applications and enrol students." },
      { who: "Students", does: "Use their own portal for schedule, work, certificates and payments." },
    ],
    workflow: [
      { title: "Enrol", text: "Applications arrive as a list or board; accepted students join a batch." },
      { title: "Teach", text: "Classes, attendance, assignments and live projects run on the batch schedule." },
      { title: "Collect", text: "Fees, instalments and receipts with reminders for pending payments." },
      { title: "Certify", text: "Certificates are issued on completion and can be verified publicly." },
    ],
    connects: [
      { panel: "ots", text: "Students can take tests and exams." },
      { panel: "portal", text: "Students get their own page for classes, work and certificates." },
      { panel: "fms", text: "Student fees and receipts are recorded in accounts." },
      { panel: "messenger", text: "Class and batch announcements go out to the right group." },
    ],
    ask: ["How many students are enrolled per program?", "Which batches have pending fees?", "What is our attendance rate this month?"],
  },
  messenger: {
    intro: "Conversations that stay beside the work: channels, direct messages, announcements and meetings inside your own workspace.",
    audience: [
      { who: "Every employee", does: "Chat, share files and join meetings." },
      { who: "Team leads", does: "Run team and project channels." },
      { who: "Management", does: "Post announcements and see that they were read." },
      { who: "Administrators", does: "Set roles and retention." },
    ],
    workflow: [
      { title: "Talk", text: "Direct messages, groups and team channels with files." },
      { title: "Organise", text: "Project channels sit next to each project; search finds any message or file." },
      { title: "Announce", text: "Business-wide posts with read tracking." },
      { title: "Meet", text: "Start a meeting or group call from the same place." },
    ],
    connects: [
      { panel: "pms", text: "Every project can have its own channel." },
      { panel: "workspace", text: "Results of automatic workflows can be posted into a channel." },
      { panel: "hrms", text: "Business announcements go to all staff." },
    ],
  },
  sop: {
    intro: "Write the procedure once, version it, assign it, and keep proof that people have read it.",
    audience: [
      { who: "Process owners", does: "Create and maintain procedures with versions and review dates." },
      { who: "Managers", does: "Assign procedures to people, teams or departments." },
      { who: "Employees", does: "Read what is assigned and confirm they have read it." },
      { who: "Compliance & audit", does: "Check read confirmation and review reports." },
    ],
    workflow: [
      { title: "Write", text: "Use the block editor or a template; every change creates a new version." },
      { title: "Assign", text: "Assign to people, teams, departments or roles." },
      { title: "Confirm", text: "People read it and confirm; overdue confirmations are chased." },
      { title: "Review", text: "Review and expiry schedules remind owners before a procedure goes stale." },
    ],
    connects: [
      { panel: "hrms", text: "New joiners are given their procedures." },
      { panel: "lpms", text: "Agreements and their approval history." },
      { panel: "messenger", text: "Notify people of new or updated procedures." },
    ],
  },
  lpms: {
    intro: "Keep a register of agreements and policy documents with their status, owner, dates and approval history. Documents are written in Playbook AI.",
    audience: [
      { who: "Legal & admin", does: "Maintain the document register and its approval history." },
      { who: "Document authors", does: "Write documents in Playbook AI." },
      { who: "Approvers", does: "Review and approve." },
      { who: "Everyone else", does: "Read documents shared with them." },
    ],
    workflow: [
      { title: "Register", text: "Existing documents are listed with their status, owner and dates." },
      { title: "Approve", text: "Approvals already started follow the workflow for their type." },
      { title: "Track", text: "Versions and the audit trail show who changed and approved what." },
    ],
    connects: [
      { panel: "hrms", text: "Employment documents are created and tracked here." },
      { panel: "dlms", text: "Keep important originals securely." },
      { panel: "sop", text: "Documents written in Playbook AI." },
    ],
  },
  dlms: {
    intro: "A secure vault for the credentials, documents, links and notes a business must not lose.",
    audience: [
      { who: "Administrators", does: "Own the business vault and its access rules." },
      { who: "Account managers", does: "Keep each client's vault in order." },
      { who: "Employees", does: "Use only the vaults and records shared with them." },
      { who: "Management", does: "Watch expiries and review the activity log." },
    ],
    workflow: [
      { title: "Store", text: "Add credentials, documents, URLs and notes to the business or a client vault." },
      { title: "Protect", text: "Records are encrypted and visible only to those you share them with." },
      { title: "Watch", text: "Expiry reminders warn before a document or credential lapses." },
      { title: "Audit", text: "The activity log shows who opened or changed what." },
    ],
    connects: [
      { panel: "lpms", text: "Agreements and their dates are registered there." },
      { panel: "pms", text: "Client passwords and access details for project work." },
      { panel: "workspace", text: "Expiry alerts reach the right people." },
    ],
  },
  ots: {
    intro: "Build tests from a question bank, assign them, and let evaluation and certificates run themselves.",
    audience: [
      { who: "Test authors", does: "Write questions and build timed tests." },
      { who: "Managers", does: "Assign tests and publish results." },
      { who: "Evaluators", does: "Mark the subjective answers." },
      { who: "Candidates, employees & students", does: "Take tests in their portal and see results." },
    ],
    workflow: [
      { title: "Build", text: "Questions go into categories; tests are timed with products and randomisation." },
      { title: "Assign", text: "Assign to candidates, employees or students — or trigger from a hiring stage." },
      { title: "Evaluate", text: "Objective answers are marked automatically; evaluators are notified of the rest." },
      { title: "Certify", text: "Results and analytics are available, and a certificate is issued on passing." },
    ],
    connects: [
      { panel: "hrms", text: "Screening tests inside your hiring process." },
      { panel: "tms", text: "Exams for students." },
      { panel: "portal", text: "Where candidates take their tests." },
    ],
  },
  aibots: {
    intro: "Create assistants that answer from your own instructions and documents, for your team, your customers, or both.",
    audience: [
      { who: "Bot builders", does: "Write instructions and add knowledge files." },
      { who: "Managers", does: "Review chats and control who can use which bot." },
      { who: "Staff", does: "Chat with the assistants they have access to." },
      { who: "Customers", does: "Get answers from bots set to open access." },
    ],
    workflow: [
      { title: "Create", text: "Name the bot, write its instructions and upload its knowledge." },
      { title: "Share", text: "Choose who can use it: the team, customers, or only certain people." },
      { title: "Chat", text: "Every conversation is logged." },
      { title: "Review", text: "Track usage and cost per bot and audit changes." },
    ],
    connects: [
      { panel: "cms", text: "The website chatbot answers visitors from your knowledge base." },
      { panel: "intelligence", text: "Ask questions of your business data." },
      { panel: "support", text: "Hand over to a person when the bot is unsure." },
    ],
  },
  intelligence: {
    intro: "Ask your business a question in plain language. The AI plans a read-only query, runs it with your permissions and shows its working.",
    audience: [
      { who: "Leadership", does: "Get an answer in seconds instead of waiting for a report." },
      { who: "Managers", does: "Ask about their own team's numbers." },
      { who: "Finance, HR & sales leads", does: "Cross-check figures without exporting." },
      { who: "Anyone", does: "Revisit and refine earlier questions." },
    ],
    workflow: [
      { title: "Ask", text: "Type a question the way you would ask a colleague." },
      { title: "Plan", text: "The AI chooses the records to look at and builds a read-only query." },
      { title: "Answer", text: "You get text, a table or a chart — with “How this was calculated”." },
      { title: "Trust", text: "Only data you may see is used, and sensitive fields are never offered to the AI." },
    ],
    connects: [
      { panel: "workspace", text: "Reads the same live records the dashboards show." },
      { panel: "aibots", text: "Build assistants for specific audiences." },
      { panel: "fms", text: "Finance questions answered from your accounts." },
    ],
  },
  smms: {
    intro: "Plan the campaign, let AI draft the posts and images, get approval, and publish on schedule.",
    audience: [
      { who: "Marketers", does: "Write briefs, plan campaigns and posts." },
      { who: "Content creators", does: "Draft with AI and refine the tone." },
      { who: "Approvers", does: "Review before anything goes live." },
      { who: "Leadership", does: "See campaign and post performance." },
    ],
    workflow: [
      { title: "Brief", text: "Describe the campaign and let AI suggest a strategy." },
      { title: "Create", text: "One idea becomes posts adapted for each platform, with generated images." },
      { title: "Approve", text: "Posts go through the approval step you choose." },
      { title: "Publish & measure", text: "Schedule publishing and track performance." },
    ],
    connects: [
      { panel: "lms", text: "Campaign results next to the leads they brought in." },
      { panel: "cms", text: "Drive traffic to your website." },
      { panel: "seo", text: "Content that supports your rankings." },
    ],
  },
  seo: {
    intro: "Audit the site, track keywords and rankings, and turn every issue into a task with an owner.",
    audience: [
      { who: "SEO specialists", does: "Audit, research keywords and track rankings." },
      { who: "Content writers", does: "Improve pages using on-page and content scores." },
      { who: "Developers", does: "Fix technical issues from the prioritised list." },
      { who: "Marketing leads", does: "Review progress in reports." },
    ],
    workflow: [
      { title: "Audit", text: "Crawl the site and get prioritised technical, on-page and content issues." },
      { title: "Research", text: "Group keywords, watch rankings and competitors." },
      { title: "Fix", text: "Create tasks from issues and assign owners." },
      { title: "Publish", text: "The sitemap and robots.txt you manage here drive your live website." },
    ],
    connects: [
      { panel: "cms", text: "The sitemap, robots and schema drive the live site." },
      { panel: "smms", text: "Content that supports your search presence." },
      { panel: "workspace", text: "Alerts when rankings or indexing change." },
    ],
  },
  cms: {
    intro: "Your whole website — pages, blog, forms, offers, wallet, chatbot and notifications — managed by your team, published in one click.",
    audience: [
      { who: "Marketing & content", does: "Edit pages and blog posts, run offers and campaigns." },
      { who: "Designers", does: "Pick and customise themes, menus and the footer." },
      { who: "Approvers", does: "Review pages waiting to be published." },
      { who: "Customer-facing teams", does: "Review chatbot and voice conversations." },
    ],
    workflow: [
      { title: "Build", text: "Compose pages from sections in the builder, as drafts." },
      { title: "Style", text: "Choose a theme, preview it live and customise colours, fonts and components." },
      { title: "Publish", text: "Review, then publish; maintenance mode protects the site while you work." },
      { title: "Grow", text: "Forms feed SRB DealFlow AI; offers, wallet credits, push notifications and the AI chatbot bring visitors back." },
    ],
    connects: [
      { panel: "lms", text: "Every form submission becomes a lead." },
      { panel: "seo", text: "SEO tools read and drive the site." },
      { panel: "aibots", text: "The website chatbot uses your knowledge base." },
      { panel: "portal", text: "Rewards and referrals extend into the portal." },
    ],
  },
  website: {
    intro: "Your business website, live on your own domain with automatic secure (HTTPS) connection — edited through the website builder.",
    audience: [
      { who: "Owners", does: "Publish a professional site without hosting or developers." },
      { who: "Marketing", does: "Keep content current." },
      { who: "Visitors", does: "Reach your business on your own domain." },
    ],
    workflow: [
      { title: "Choose a theme", text: "Start from a neutral starter site that is live from day one." },
      { title: "Connect your domain", text: "Add your domain and publish the DNS records shown." },
      { title: "SSL", text: "Verification and the certificate are automatic." },
      { title: "Capture leads", text: "Enquiries land in SRB DealFlow AI." },
    ],
    connects: [
      { panel: "cms", text: "Everything is edited in the website builder." },
      { panel: "seo", text: "Sitemap, robots and structured data." },
      { panel: "lms", text: "Enquiries become leads." },
    ],
  },
  portal: {
    intro: "One branded place where clients, students and applicants see what concerns them — instead of asking by email.",
    audience: [
      { who: "Clients", does: "See projects, milestones, invoices and documents; pay online." },
      { who: "Students", does: "Follow their program, schedule, assignments, tests and certificates." },
      { who: "Applicants", does: "Track their application, interviews and assessments." },
      { who: "Your team", does: "Manage portal users and see what they do." },
    ],
    workflow: [
      { title: "Invite or register", text: "People join with self-service sign-up or an invitation." },
      { title: "See their world", text: "Each person sees only their own projects, program or application." },
      { title: "Act", text: "Pay invoices, submit work, take tests, message your team." },
      { title: "Stay engaged", text: "Rewards, referrals and a wallet keep them coming back." },
    ],
    connects: [
      { panel: "pms", text: "Project progress for clients." },
      { panel: "tms", text: "The student experience." },
      { panel: "ots", text: "Where tests are taken." },
      { panel: "fms", text: "Invoices and online payment." },
    ],
  },
  support: {
    intro: "Get an answer from an AI that knows the screen you are on, and a clear path to a person when you need one.",
    audience: [
      { who: "Every user", does: "Ask the assistant or search the help center." },
      { who: "Administrators", does: "Send requests — questions, problems, ideas, feedback — with attachments." },
      { who: "Customer success", does: "Track every request and reply." },
    ],
    workflow: [
      { title: "Ask", text: "The help assistant answers from the official help content." },
      { title: "Search", text: "The help center has searchable guides and troubleshooting." },
      { title: "Escalate", text: "Turn the conversation into a request in one click." },
      { title: "Follow", text: "Status, replies and notifications on every request." },
    ],
    connects: [
      { panel: "workspace", text: "Help from every product's header." },
      { panel: "aibots", text: "AI answers grounded in your own content." },
    ],
  },
};
