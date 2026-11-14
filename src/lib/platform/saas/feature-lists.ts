/**
 * The complete feature list of every product, grouped the way each product's own navigation groups them, built from the product's real
 * screens (its routes and sidebar) and its capability copy. Every entry is something a user can open or do in the product today;
 * nothing here is planned or invented.
 */
export interface FeatureItem {
  name: string;
  text: string;
}
export interface FeatureGroupList {
  title: string;
  items: FeatureItem[];
}

const f = (name: string, text: string): FeatureItem => ({ name, text });

export const FEATURE_LISTS: Record<string, FeatureGroupList[]> = {
  workspace: [
    { title: "Command center", items: [f("Executive dashboard", "Every product's live numbers on one screen"), f("Product performance matrix", "Status and key counts for each product, with one-click Open"), f("Per-product analytics", "Drill into any product with date, department and owner filters"), f("Notifications", "One inbox for everything that needs you, with notification settings"), f("Documents", "Files uploaded across projects, HR and the portal"), f("Company-wide search", "Find any record in any product (⌘K)")] },
    { title: "Organisation", items: [f("Guided company setup", "Profile, departments, invitations and which products your team uses"), f("Organization profile", "Legal name, industry, country, currency, time zone, contacts"), f("Users, roles & seats", "Who can sign in, which products and permissions, seats used"), f("External portal users", "Review external applicant, student and client accounts and suspend access when needed"), f("Invitations", "Invite people by email with a role"), f("Data import", "Leads, clients and employees from validated CSV files"), f("Email verification", "Verified accounts before anyone gets access")] },
    { title: "Your brand", items: [f("Branding", "Your logo, name, accent and theme across products, emails and PDFs"), f("Apps & downloads", "Your own installable web app, Android, iOS, Windows, macOS and Linux apps"), f("Custom domains", "Your own domain and app host with automatic secure (HTTPS) connection"), f("Payment account", "Collect invoice payments and pay salaries through your own gateway account")] },
    { title: "Automation & integrations", items: [f("Automations", "“when this happens, do that” workflows with ready-made templates"), f("Run history", "See what every workflow did and why"), f("Integrations", "Payment gateway, secure alerts to other software (webhooks), email and AI provider keys"), f("Signed webhooks", "Send events to the systems you already use")] },
    { title: "Security & audit", items: [f("Audit log", "Who did what across every product, and when — with spreadsheet (CSV) export"), f("Security", "Sign-in, password and accounts that need attention"), f("Sessions & devices", "Every signed-in device, with log out one or everywhere"), f("Sign-in history", "Sign-ins, failures and sign-outs kept for 180 days"), f("Roles & permissions", "Create custom roles with product and action permissions"), f("Workspace backups", "Review and manage workspace backup settings")] },
    { title: "Billing", items: [f("Plan & billing", "Your plan, payments, coupon codes and GST details"), f("Invoices & payments", "Tax invoices and credit notes for your subscription"), f("Usage", "Seats, AI, email, voice and storage used against your plan"), f("Upgrade", "Change plan any time")] },
    { title: "Workspace preferences", items: [f("Notification preferences", "Choose which workspace alerts reach you and where they are sent"), f("Workspace settings", "Open the central workspace configuration area")] },
  ],
  lms: [
    { title: "Lead management", items: [f("Leads", "Every enquiry with owner, status, source, due date and notes"), f("New lead", "Add a lead by hand in seconds"), f("Pipeline overview", "New · In progress · Completed · Rejected at a glance"), f("Pending tasks & stale-lead alerts", "Leads untouched for days are flagged"), f("Lead detail", "Full history, notes and messages per lead"), f("Saved filters", "Segment by category, status, source and date")] },
    { title: "Messages & applicants", items: [f("Messages", "Two-way messages with leads and portal users"), f("Applicant workspace", "Open the careers applicant workspace"), f("Applicants", "Career applications with status, notes and resumes"), f("Applicant detail", "Interview scheduling and status per applicant"), f("Notifications", "Be told when a lead or applicant needs you")] },
    { title: "Capture & analytics", items: [f("Website forms", "Enquiries from your website arrive as leads"), f("CSV import", "Bring existing leads in with validation"), f("Lead & campaign analytics", "Pipeline health, spend, ROI and conversion"), f("Campaign report imports", "Import campaign performance reports and undo an import when needed"), f("Attributed campaign leads", "Filter leads by campaign attribution, source and date range"), f("All leads list", "Search and filter lead records by type, status and source"), f("Campaign tracking", "See which campaigns bring revenue"), f("Export current view", "Spreadsheet (CSV) of exactly what you are looking at")] },
  ],
  hrms: [
    { title: "People", items: [f("Staff dashboard", "A role-aware overview of HR work, employee changes and pending actions"), f("Employee directory", "Every employee with profile, documents and status"), f("Add & edit employee", "Full personal, job and salary details"), f("Employee portal login", "Provision employee access to the self-service portal"), f("Employee bank accounts", "Manage bank details used for salary payouts"), f("Departments", "Teams, heads and reporting lines"), f("Organisation tree", "See who reports to whom"), f("Recruitment", "Pipeline from application to offer"), f("Employee documents", "Contracts, IDs and certificates per person")] },
    { title: "Operations", items: [f("Attendance", "Monthly calendar, check-ins and late arrivals"), f("Leave", "Leave types, balances, requests and approvals"), f("Holidays", "Business holiday calendar"), f("Payroll runs", "Run payroll for a month with one flow"), f("Salary revisions", "Track every change in pay"), f("Payslips", "Generated and available to each employee"), f("Salary payouts", "Pay salaries and post them to SRB CashFlow AI")] },
    { title: "Employee self-service", items: [f("My dashboard", "Each person's own HR home"), f("My attendance", "Check in and review your month"), f("My leave", "Request leave and see your balance"), f("My salary & payslips", "Pay history and downloads"), f("My documents & profile", "Personal records, always current"), f("Company directory", "Find colleagues across the business")] },
    { title: "Insight & control", items: [f("HR analytics", "Headcount, hiring, attendance and leave trends"), f("Settings", "Leave rules, policies and permissions"), f("Notifications", "Leave requests and approvals reach the right person"), f("Audit trail", "Every change recorded in the central audit log")] },
  ],
  fms: [
    { title: "Finance overview", items: [f("Finance dashboard", "Review finance totals, cash position and work needing attention"), f("Central payment engine", "Review payment intents, successful collections, gateway and source status")] },
    { title: "Financial reporting", items: [f("Financial summary analytics", "Review the finance summary and reporting indicators in one place")] },
    { title: "Money in", items: [f("Receivables", "Everything customers owe you"), f("Invoices", "Create, send and track invoices"), f("Credit notes", "Adjust invoices cleanly"), f("Receipts", "Record and issue receipts"), f("Payment links", "Get paid online from any invoice"), f("Refunds", "Handle refunds with a trail"), f("Customers", "Customer records with history")] },
    { title: "Money out", items: [f("Payables", "Everything you owe"), f("Bills", "Capture and approve supplier bills"), f("Debit notes", "Adjust bills cleanly"), f("Payouts", "Pay suppliers and staff from one place"), f("Vendors & bank directory", "Beneficiaries and bank details"), f("Advances & employee expenses", "Claims with approvals"), f("Salary payments & payroll runs", "Posted from SRB TalentOS automatically")] },
    { title: "Banking & cash", items: [f("Bank accounts", "Every account with its transactions"), f("Cash accounts", "Petty cash and cash on hand"), f("Transfers", "Move money between accounts"), f("Bank reconciliation", "Match statements to the books"), f("Cash reconciliation", "Count and match against bank statements cash"), f("Transactions", "Every money movement, with approvals"), f("Asset register", "Track business assets and open each asset record")] },
    { title: "Books & reports", items: [f("General ledger", "Every posting, searchable"), f("Trial balance", "Always in balance"), f("Profit & loss", "Revenue and expenses"), f("Balance sheet", "Assets, liabilities and equity"), f("Cash flow", "Where the cash came from and went"), f("Tax reports", "Ready for your accountant"), f("Budget vs actual", "Spot overspend early"), f("Project profitability", "Margin by project"), f("Revenue & expense reports", "Trends and breakdowns")] },
    { title: "Control & settings", items: [f("Approvals", "Route money movements for sign-off"), f("Approval rules", "Thresholds and approvers"), f("Chart of accounts", "Your own account structure"), f("Fiscal periods", "Open and close periods"), f("Numbering", "Document number series"), f("Tax configuration", "GST and tax rates"), f("Exchange rates", "Multi-currency support"), f("Payment methods", "Accepted ways to pay"), f("Asset expenses", "Link spending to business assets")] },
    { title: "Connected products", items: [f("SRB SpendIQ", "Supplier invoices and purchase payments"), f("SRB SprintOS", "Milestone billing and project costs"), f("SRB TalentOS", "Salary payouts posted automatically"), f("SRB Cohort AI", "Student fees and receipts")] },
    { title: "Notifications", items: [f("Finance notifications", "Review finance events and mark notifications as read")] },
  ],
  pms: [
    { title: "Overview", items: [f("Project portfolio dashboard", "Review project portfolio activity and delivery indicators")] },
    { title: "Delivery", items: [f("Projects", "All projects with status, owner and dates"), f("Project board", "Kanban board of tasks"), f("Task lists", "Tasks with assignees, due dates and priorities"), f("Timeline", "Gantt-style view of the plan"), f("Calendar", "Deadlines and milestones at a glance"), f("Project documents", "Files and discussion on the work"), f("Clients", "Contacts and full project history")] },
    { title: "Time & money", items: [f("Timesheets", "Time logged against projects, approved by managers"), f("Costing", "Budget, cost and profitability per project"), f("Project financial report PDF", "Download a project's financial summary as a PDF"), f("Milestones", "Track and bill delivery stages"), f("Overdue warnings", "Be told before a project slips")] },
    { title: "For every team member", items: [f("My dashboard", "Open the team member's project workspace and personal overview"), f("My projects", "Only the projects you are on"), f("My tasks", "Your own work list"), f("My timesheet", "Log time in seconds"), f("Notifications", "Assigned or overdue tasks reach you")] },
    { title: "Insight & control", items: [f("Project analytics", "Delivery and workload trends"), f("Settings", "Project rules, roles and permissions")] },
  ],
  prms: [
    { title: "Overview", items: [f("Procurement dashboard", "Review procurement activity and purchasing work at a glance")] },
    { title: "Buying", items: [f("Purchase requests", "Requests with approval chains by amount"), f("RFQs", "Request quotes and compare suppliers"), f("Purchase orders", "Issue and track orders"), f("Goods receipt (GRN)", "Record what arrived"), f("Vendor invoices", "Three-way match: order, receipt and invoice"), f("Payments", "Pay approved invoices"), f("Contracts", "Supplier contracts and renewals")] },
    { title: "Suppliers & spending", items: [f("Procurement hub", "Review requisitions, purchase orders and suppliers together"), f("Vendors", "Directory with history and performance"), f("Expenses", "Expense claims with approvals"), f("Budgets", "Set and watch budgets"), f("Third-party services", "Track external providers"), f("Procurement analytics", "Review procurement trends and dashboard metrics"), f("Procurement analytics & reports", "Review detailed procurement reports")] },
    { title: "Business assets", items: [f("Hardware & assets", "Register, assign and track every asset"), f("Subscriptions", "Software subscriptions with renewal alerts"), f("Infrastructure", "Servers, domains and hosting"), f("Inventory", "Stock with movements")] },
    { title: "Self-service", items: [f("Staff dashboard", "Review your requests, expenses and procurement tasks"), f("My requests", "Employees raise and track purchase requests"), f("My expenses", "Submit and follow your own claims")] },
    { title: "Administration", items: [f("Procurement settings", "Manage the procurement product's available settings")] },
    { title: "Notifications", items: [f("SpendIQ notifications", "Review procurement events and mark notifications as read")] },
  ],
  tms: [
    { title: "Training", items: [f("Programs", "Courses and curriculum"), f("Batches", "Groups with schedule, mentors and capacity"), f("Batch calendar", "All batches on one calendar"), f("Students", "Records, progress and attendance")] },
    { title: "Delivery", items: [f("Classes", "Schedules and attendance"), f("Projects", "Live projects for students"), f("Assignments", "Set, submit and review"), f("Mentor tools", "Guide students through the program")] },
    { title: "Records", items: [f("Certificates", "Issued with public verification"), f("Payments", "Fees, instalments, receipts and reminders"), f("Placements", "Track student placements"), f("Reports", "Enrolment, attendance and revenue")] },
    { title: "Staff workspace", items: [f("Staff dashboard", "A staff overview for managing training operations and pending work")] },
    { title: "Student portal", items: [f("My dashboard", "Everything a student needs"), f("My program & batch", "Curriculum and classmates"), f("Class schedule", "Upcoming classes"), f("My assignments & projects", "Submit and get feedback"), f("My certificates", "Download and share"), f("My payments", "Pay fees online"), f("Profile", "Keep details current")] },
    { title: "Notifications", items: [f("Cohort AI notifications", "Review training updates and mark notifications as read")] },
    { title: "Administration", items: [f("Training settings", "Manage training product settings and access controls")] },
  ],
  messenger: [
    { title: "Overview", items: [f("Team communication dashboard", "Review team communication activity and collaboration metrics")] },
    { title: "Conversations", items: [f("Direct messages", "One-to-one chat with files"), f("Team channels", "Channels for every team"), f("Project channels", "Discussion next to the project"), f("Group chats", "Ad-hoc groups"), f("Message threads", "Keep replies grouped under the message they discuss"), f("Emoji reactions", "React to messages without sending a separate reply"), f("Forward messages", "Share a message into another conversation"), f("Pin and star messages", "Keep useful messages easy to find"), f("Voice notes", "Record and send audio from the message composer"), f("Unread counts", "Never miss a message")] },
    { title: "Workspace", items: [f("Announcements", "Business-wide posts with read tracking"), f("New announcement", "Compose an announcement, select its audience and schedule when it goes out"), f("Shared files", "Every file shared in chat"), f("Meetings", "Meetings and group calls"), f("Search", "Across messages, people and files"), f("Presence", "See who is around in the collaboration workspace"), f("Huddle AI notifications", "Review message and workspace alerts in the notification inbox")] },
    { title: "Control", items: [f("Settings", "Roles, retention and permissions"), f("Activity trail", "Recorded in the central audit log")] },
  ],
  sop: [
    { title: "Overview", items: [f("Process compliance dashboard", "Review SOP status, read confirmations and compliance summaries")] },
    { title: "Library", items: [f("SOP library", "Procedures with categories, owners and versions"), f("New SOP", "Block editor with templates"), f("My SOPs", "Procedures you own"), f("Assigned SOPs", "What you must read and confirm"), f("Version history", "Every revision kept"), f("Compare SOP versions", "Review content and metadata differences between two revisions")] },
    { title: "Structure", items: [f("Departments", "Procedures per department"), f("Categories", "Organise the library"), f("Templates", "Start from a block template")] },
    { title: "Compliance", items: [f("Assignments", "To people, teams, departments or roles"), f("Acknowledgement tracking", "Know who has read what"), f("Compliance reports", "Overdue and complete, at a glance"), f("Review & expiry schedule", "Reminders before a review is due"), f("Feedback", "Staff comment on procedures"), f("Reports & analytics", "Usage and compliance trends"), f("Settings & audit trail", "Rules, permissions and full history")] },
    { title: "Notifications", items: [f("Playbook AI notifications", "Review procedure updates and mark notifications as read")] },
  ],
  lpms: [
    { title: "Overview", items: [f("Legal documents dashboard", "Review legal document status, creation trends and approval activity")] },
    { title: "Documents", items: [f("Document library", "Every document with status and history"), f("New document", "Generate from a template"), f("Approvals", "Route documents for approval"), f("Signatures", "Collect and track signatures"), f("Document history", "Who changed and approved what")] },
    { title: "Templates & workflows", items: [f("Templates", "Reusable blocks and layouts"), f("Maker types", "Who can create which documents"), f("Workflows", "Approval chains per document type"), f("Categories", "Organise documents")] },
    { title: "Control", items: [f("Settings", "Rules and permissions"), f("Audit trail", "Recorded in the central audit log"), f("Notifications", "Issued, approved or expiring")] },
  ],
  dlms: [
    { title: "Overview", items: [f("Secure vault dashboard", "Review vault records, expiry alerts and recent activity")] },
    { title: "Vaults", items: [f("Company vault", "The business's own records"), f("Client vaults", "A separate vault per client"), f("Credential vault", "Encrypted logins and keys"), f("Document vault", "Files with version history"), f("URLs & accounts", "Links and online accounts"), f("Notes", "Secure notes")] },
    { title: "Protection", items: [f("Encryption at rest", "Vault secrets such as credentials and keys are encrypted at the application layer"), f("Per-record access", "Share exactly what is needed"), f("Expiry & alerts", "Never miss a renewal or expiry"), f("Activity log", "Who opened or changed what"), f("Settings", "Roles and permissions")] },
    { title: "Notifications", items: [f("CyberVault notifications", "Review vault events and mark notifications as read")] },
  ],
  ots: [
    { title: "Overview", items: [f("Assessment dashboard", "Review assessment activity, results and work needing attention")] },
    { title: "Assessments", items: [f("Tests", "Timed tests with sections and randomisation"), f("New test", "Build from your question bank"), f("Question bank", "Categories, bulk add and import"), f("New question", "Create a reusable question for the question bank"), f("Bulk create questions", "Type or paste multiple objective questions in one operation"), f("Question import", "Bring questions in from files"), f("Test assignments", "Assign to candidates, employees and students"), f("Assign a test", "Choose a published test and assign it to users or groups")] },
    { title: "Evaluation", items: [f("Results", "Automatic and manual evaluation"), f("Evaluator workflow", "Notify evaluators of pending answers"), f("Certificates", "Issued on passing"), f("Test reports & analytics", "Performance across tests"), f("Hiring screening", "Manually assign a test to a candidate from the hiring workflow")] },
    { title: "Candidates & setup", items: [f("My tests", "Candidates take tests in their portal"), f("My results", "Scores and feedback"), f("Question categories", "Organise questions by category"), f("Test categories", "Organise tests by category"), f("Settings", "Rules and permissions")] },
    { title: "Notifications", items: [f("EvalIQ notifications", "Review assessment updates and mark notifications as read")] },
  ],
  aibots: [
    { title: "Create & chat", items: [f("Create bot", "Your instructions and knowledge files"), f("Start a bot chat", "Open a bot conversation and exchange messages"), f("Find a bot", "Browse the bots available to you"), f("Knowledge files", "Ground a bot in your own documents")] },
    { title: "Manage", items: [f("AI operations dashboard", "Review executions, token trends, failures, popular bots and recent chats"), f("Manage bots", "Edit, pause and delete"), f("Bot configuration", "Open a bot to review its instructions, knowledge sources and access settings"), f("Access modes per bot", "Team, customers or both"), f("All chats", "Full conversation history"), f("Chat conversation details", "Open an individual conversation from the chat history"), f("Usage & cost", "Tracked per bot"), f("Settings", "Roles and permissions"), f("Audit trail", "Every change recorded"), f("AgentOS notifications", "Review bot and workspace alerts in the notification inbox")] },
  ],
  intelligence: [
    { title: "Ask your business", items: [f("Plain-language questions", "Across every product's data"), f("Answers from live data", "Read-only queries, never guessed"), f("Tables, charts & KPIs", "The right view for each answer"), f("Copy and export answer tables", "Copy results or download a table as spreadsheet (CSV)"), f("How this was calculated", "Every answer shows its working"), f("Suggested questions", "Start from what people ask most")] },
    { title: "Trust & control", items: [f("Access respected", "Only data the asker may see"), f("Sensitive fields withheld", "Never offered to the AI"), f("Conversations", "Search and revisit past questions"), f("Conversation details", "Open a saved conversation and review its answers"), f("Delete conversations", "Remove a conversation from your sidebar"), f("Usage metering", "AI allowance tracked per plan"), f("DataBrain AI notifications", "Review AI workspace alerts in the notification inbox")] },
  ],
  smms: [
    { title: "Overview", items: [f("Social media dashboard", "Review post and campaign performance, publishing activity and recent AI generations")] },
    { title: "Content", items: [f("Campaigns & ads", "Briefs, AI strategy and spend"), f("Campaign and ad details", "Open a campaign to review its setup and related ads"), f("Social media posts", "Adapted for each platform"), f("Post details and version history", "Open a post to review its versions and restore an earlier one"), f("New post & new campaign", "Create in a few clicks"), f("Media library", "Images and video in one place")] },
    { title: "AI & publishing", items: [f("AI content generator", "Copy and images from one idea"), f("Tone refinement", "Adjust a post with one sentence"), f("Approval workflow", "Nothing publishes without sign-off"), f("Calendar & scheduling", "Publish on schedule"), f("Platform connections", "Your business pages, connected")] },
    { title: "Insight & control", items: [f("Analytics", "Campaign and post performance"), f("Settings", "Roles and permissions"), f("Activity trail", "Recorded in the central audit log")] },
    { title: "Notifications", items: [f("ViralPulse AI notifications", "Review publishing and campaign events and mark notifications as read")] },
  ],
  seo: [
    { title: "Overview", items: [f("SEO performance dashboard", "Review organic traffic, rankings, search impressions and audit performance")] },
    { title: "Audit", items: [f("SEO overview", "Health of the whole site"), f("Website audit", "Prioritised issues"), f("Technical SEO", "Speed, crawl and index health"), f("On-page SEO", "Titles, headings and meta"), f("Content SEO", "Scores per page"), f("Pages", "Every page's SEO at a glance")] },
    { title: "Search & links", items: [f("Keywords", "Keyword groups"), f("Rankings", "Rank tracking over time"), f("Competitors", "See who outranks you"), f("Internal links", "Link structure and gaps"), f("Backlinks", "Monitor who links to you")] },
    { title: "How search engines see you", items: [f("Sitemap", "Managed from the product, drives your live site"), f("Robots.txt", "Edit and publish"), f("Schema / structured data", "Rich results")] },
    { title: "Work", items: [f("SEO issues", "Prioritised fix list"), f("SEO tasks", "Assign fixes with owners"), f("Reports", "Share progress"), f("Settings & audit trail", "Rules, permissions and history")] },
    { title: "Notifications", items: [f("RankMax AI notifications", "Review SEO updates and mark notifications as read")] },
  ],
  cms: [
    { title: "Overview", items: [f("Website content dashboard", "Review website content status, publishing work and recent site activity")] },
    { title: "Content", items: [f("Pages", "Drag-and-drop builder with draft and publish"), f("Services", "Your service pages"), f("Blog posts", "Articles with SEO fields"), f("Careers", "Job openings on your site"), f("Hiring models", "Engagement options"), f("Products", "Your offerings in one place"), f("Forms", "Enquiries straight into SRB DealFlow AI"), f("Media library", "Images and files")] },
    { title: "Appearance", items: [f("Themes", "Browse, preview live and activate"), f("Customize", "Colours, fonts, radius and components"), f("Menus", "Navigation builder"), f("Footer", "Footer columns and links"), f("Site identity", "Brand, contact and social details")] },
    { title: "Growth", items: [f("Festival offers", "Campaigns, coupons, claims and subscribers"), f("New offer campaign", "Create an offer campaign for your website"), f("New coupon", "Create a coupon and associate it with an offer campaign"), f("Wallet & credits", "Reward rules, referrals, balances and ledger"), f("Referral campaigns", "Grow through your customers"), f("New referral campaign", "Set up a referral campaign for customer rewards"), f("New reward rule", "Configure how wallet rewards are earned"), f("Usage rules", "Control how credits are spent"), f("New usage rule", "Configure how customers can redeem wallet credits"), f("Push notifications", "Reach visitors on their devices"), f("SEO overview", "Search health of your site")] },
    { title: "AI on your website", items: [f("AI website generation and versions", "Generate website content and design from your business profile, then review or restore saved versions"), f("AI chatbot", "Answers visitors from your knowledge base"), f("Knowledge base", "Teach the chatbot your content"), f("AI config", "Tone, behaviour and limits"), f("Conversation AI", "Voice conversations with AI"), f("Voice config", "Pick the voice and behaviour"), f("Conversations", "Every chat and call, logged and searchable")] },
    { title: "Control", items: [f("Settings", "Maintenance mode, tracking and more"), f("Collections", "Structured content types"), f("Drafts and publishing", "Preview draft changes and publish them when ready"), f("Audit trail", "Recorded in the central audit log"), f("SiteCraft AI notifications", "Review site events and mark notifications as read")] },
  ],
  website: [
    { title: "Your public website", items: [f("Your own domain", "Plus a free workspace address"), f("Automatic SSL", "Secure from day one"), f("Maintenance mode", "Work on the site safely"), f("Built-in lead capture", "Every enquiry into SRB DealFlow AI"), f("SEO built in", "Sitemap, robots and structured data")] },
  ],
  portal: [
    { title: "Overview", items: [f("ClientOS portal dashboard", "View the role-specific home screen for your client, learner or applicant account"), f("My journey", "Review the progress steps shown for your portal account")] },
    { title: "For clients", items: [f("My projects", "Review projects shared with your client account"), f("Project milestones", "Track milestone progress on a project"), f("Invoices", "Review invoices shared with your client account"), f("Client invoice payments", "Review or pay portal invoices online"), f("Documents", "Open files shared with your account"), f("Messages", "Talk to your team from the portal"), f("Meetings", "Review client meetings")] },
    { title: "For students", items: [f("My program", "Review your assigned curriculum and program information"), f("Class schedule", "See upcoming classes and sessions"), f("Assignments", "Submit assigned work and review feedback"), f("Attendance", "Review your attendance record"), f("Tests & exams", "Open assigned assessments and examinations"), f("Assigned assessment details", "Review an assigned test and its instructions before starting"), f("Take an assessment", "Complete an assigned test in the distraction-free exam runner"), f("Test certificates", "Review certificates issued for completed tests"), f("Test results and released scores", "Review completed attempts and scores after they are released"), f("Trainee payments", "Review training payments and fee records")] },
    { title: "For applicants", items: [f("My application", "Review your submitted application and its current status"), f("Interview schedule", "Review scheduled interviews"), f("Assessments", "Open assessments assigned to your applicant account")] },
    { title: "Rewards & account", items: [f("Refer & earn", "Open your referral and rewards area"), f("Daily rewards", "Review and claim available daily rewards"), f("Journey rewards", "Review rewards associated with your portal journey"), f("Bonus tasks", "Review eligible bonus tasks"), f("Wallet", "Review your available wallet balance and activity"), f("Notifications", "Review portal alerts"), f("Notification settings", "Manage notification preferences"), f("Profile", "Review and update your portal profile"), f("Portal registration", "Create an external-user account for the portal")] },
  ],
  support: [
    { title: "Overview", items: [f("Support overview dashboard", "Review request activity, support trends and help content from the dashboard")] },
    { title: "Get help", items: [f("Help assistant", "AI that knows the screen you are on"), f("Help center", "Searchable articles"), f("Turn a chat into a request", "Prepare a request from a chat, review its details and submit it")] },
    { title: "Support desk", items: [f("New request", "Question, problem, idea or feedback — with attachments"), f("My requests", "Search requests by title or number, filter by status, and follow replies"), f("Request details and replies", "Open a request to read updates and respond to the support team"), f("Reopen resolved requests", "Replying to a resolved request reopens it for follow-up"), f("Help article", "Open an individual article from the searchable help center"), f("Notifications", "Told when we reply")] },
  ],
};

export const featureCount = (key: string) => (FEATURE_LISTS[key] ?? []).reduce((n, g) => n + g.items.length, 0);

/**
 * What each product is worth to a business, in plain terms. `replaces` names the kind of software it stands in for; `benefits` are the
 * outcomes, drawn from what the product really does. No figures, customers or comparisons that cannot be backed up.
 */
export interface PanelValue {
  replaces: string;
  benefits: string[];
}
export const PANEL_VALUE: Record<string, PanelValue> = {
  workspace: { replaces: "Separate dashboards, user admin and automation apps", benefits: ["See your whole business on one screen instead of opening many apps", "Control who can see and do what, down to a single action", "Automate follow-ups across every product without developers", "One activity record and one place for billing, brand and security"] },
  lms: { replaces: "CRM & lead management software", benefits: ["No enquiry slips through — every lead has an owner and a due date", "Stale leads are flagged before they go cold", "See which campaigns actually bring revenue", "Won deals turn into client records and projects"] },
  hrms: { replaces: "HR & payroll software", benefits: ["Hire, onboard, track attendance and pay from one record", "Employees self-serve leave, salary and documents — HR stops chasing", "Payroll is passed to accounts automatically", "Managers approve leave and timesheets where they already work"] },
  fms: { replaces: "Accounting & invoicing software", benefits: ["Accounts that are ready sooner, built from live transactions", "Customers pay online straight from the invoice", "Salaries, supplier payments and project money are recorded for you, with no retyping", "Reports your accountant can use as they are"] },
  pms: { replaces: "Project management software", benefits: ["Clear ownership of every task and deadline", "Know a project's profitability before it ends", "Time, cost and milestones in one place", "Milestones can raise the invoice automatically"] },
  prms: { replaces: "Purchasing and asset tracking software", benefits: ["Every purchase approved, tracked and matched before payment", "No surprise subscriptions — renewals are flagged early", "Know every asset, who has it and where it is", "Supplier invoices go to accounts once they match the order"] },
  tms: { replaces: "Training and course management software", benefits: ["Run programs, batches and fees without spreadsheets", "Students get their own portal for classes, work and certificates", "Certificates issued with public verification", "Fee reminders go out on their own"] },
  messenger: { replaces: "Team chat & meeting software", benefits: ["Conversations stay next to the project or record they are about", "Business announcements with proof they were read", "No separate chat app to pay for", "Workflow results can post straight into a channel"] },
  sop: { replaces: "Apps for policies and procedures", benefits: ["One current way of working — versioned and owned", "Prove who has read and confirmed each procedure", "Faster onboarding with assigned procedures", "Reviews never lapse — reminders go out automatically"] },
  lpms: { replaces: "Agreement registers and trackers", benefits: ["A clear record of who approved what", "Approval chains per document type", "Everything in one library, with history", "Documents are written in Playbook AI"] },
  dlms: { replaces: "Password and file storage apps", benefits: ["Passwords and keys stored encrypted, and records only open to the right people", "A vault per client, kept separate", "Expiry alerts so nothing lapses by surprise", "Know exactly who opened or changed what"] },
  ots: { replaces: "Online test platforms", benefits: ["Objective hiring and training decisions from consistent tests", "Automatic evaluation saves hours of marking", "Certificates issued on passing", "Assign tests to candidates from the hiring workflow"] },
  aibots: { replaces: "AI chatbot builders", benefits: ["Instant, consistent answers grounded in your own material", "Assistants for staff, for customers, or both", "Every conversation saved; usage and cost tracked for each assistant", "Hands over to a person when the assistant is unsure"] },
  intelligence: { replaces: "Reporting and business analysis apps", benefits: ["Leadership decisions in seconds, not after a report is built", "Answers come from live records, never guessed", "Every answer shows how it was calculated", "People only get answers from data they may see"] },
  smms: { replaces: "Social media scheduling apps", benefits: ["A steady, on-brand presence without a large content team", "AI drafts posts and images from a single idea", "Nothing publishes without the approval you choose", "See campaign results next to your sales results"] },
  seo: { replaces: "Website ranking and SEO check apps", benefits: ["A clear, prioritised list of what to fix next", "Rankings and backlinks tracked in one place", "Sitemap and robots drive your live site directly", "Fix tasks assigned to owners, not lost in a report"] },
  cms: { replaces: "Website builders and marketing apps", benefits: ["Change your website any day — no developer needed", "Website forms go straight into your sales list", "Offers, coupons, referrals and wallet credits built in", "AI chatbot and voice AI answer visitors around the clock"] },
  website: { replaces: "Website hosting & domain setup", benefits: ["Live on your own web address, with a secure connection set up for you", "No hosting, plug-ins or developers to manage", "Every enquiry from your website lands in your sales list", "Maintenance mode when you need to work safely"] },
  portal: { replaces: "Client, student & applicant portals", benefits: ["Fewer status-update emails — people check for themselves", "One branded place for projects, invoices, tests and messages", "People can sign up and manage their own account", "Rewards and referrals keep people coming back"] },
  support: { replaces: "Help desk and help center apps", benefits: ["Answers in seconds from an AI that knows the screen you are on", "A clear path to a person when it matters", "Requests tracked with attachments and status", "Help content searchable in the product"] },
};

/** URL slug of a feature: its name, lower-cased and hyphenated. Unique within a product. */
export const featureSlug = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Every feature of a product, flat, with the group it sits in. */
export function featuresOf(key: string): { group: string; name: string; text: string; slug: string }[] {
  const seen = new Set<string>();
  return (FEATURE_LISTS[key] ?? []).flatMap((g) =>
    g.items.map((i) => {
      let slug = featureSlug(i.name);
      while (seen.has(slug)) slug += "-2";
      seen.add(slug);
      return { group: g.title, name: i.name, text: i.text, slug };
    }),
  );
}
