/**
 * The story each product page tells: what the product is, why a business needs it, the problems it solves, situations it is used in, what
 * its AI really does and what happens on its own. Written from the product's own screens, assistant actions and scheduled jobs; nothing
 * here is planned or invented, and the situations are examples, never claims about a customer. `test:product-story` keeps it complete.
 */
export interface ProductStory {
  /** The description under the product's name in the banner at the top of its page. */
  banner: string;
  /** What it is, in everyday words. */
  what: string;
  /** Why a business needs it. */
  why: string;
  /** [how work goes without it, what the product does instead] */
  problems: [string, string][];
  useCases: { title: string; who: string; story: string }[];
  ai: { title: string; text: string }[];
  /** The limit that keeps a person in charge of the AI. */
  aiRule: string;
  /** [when this happens, the product does this] */
  automation: [string, string][];
}

const APPROVE = "The assistant works with your own permissions: it only reads what you may see, and nothing is changed until you approve it.";
const p = (today: string, with_: string): [string, string] => [today, with_];
const c = (title: string, who: string, story: string) => ({ title, who, story });
const a = (title: string, text: string) => ({ title, text });

export const PRODUCT_STORY: Record<string, ProductStory> = {
  workspace: {
    banner: "CommandOS is the home of your business software. See live numbers from every product, invite your team, decide who can do what, build automations and manage your brand, domain and billing. Owners and administrators run the whole company from one sign-in.",
    what: "CommandOS is the control room of your business software. You sign in once, see the live numbers of every product you use, and manage people, access, automations, branding and billing from one place.",
    why: "When every tool has its own login, settings and reports, nobody has the full picture and nobody is sure who can see what. CommandOS puts the whole business behind one sign-in with one set of permissions.",
    problems: [
      p("Each tool has its own login and its own list of users.", "One sign-in. You add a person once and decide which products and actions they get."),
      p("Owners wait for different people to send different reports.", "A dashboard shows live numbers from every product, with date, department and owner filters."),
      p("Nobody can say who changed a record, a price or a permission.", "The audit log records who did what and when, across every product."),
      p("Routine follow-ups depend on someone remembering them.", "“When this happens, do that” automations do them, with a history of every run."),
    ],
    useCases: [
      c("A new employee joins", "Administrator", "Invite them by email with a role. They verify the account and see only the products their job needs."),
      c("Monday review", "Owner or director", "Open the dashboard to check sales, collections, projects and people numbers before the meeting."),
      c("Moving from spreadsheets", "Administrator", "Import leads, clients and employees from CSV files; every row is checked and errors are listed before anything is saved."),
    ],
    ai: [
      a("Ask the workspace assistant", "Ask who has access to what, what happened recently or how usage compares with your plan."),
      a("Let it do the setup work", "Ask it to add a person, create an automation from a template, send a test run or add your domain. You approve each change."),
      a("Your own AI instructions", "Reword the instructions behind your company's AI assistants, with every version kept and fixed safety rules always applied."),
    ],
    aiRule: APPROVE,
    automation: [
      ["A new lead, leave request, paid invoice or finished task", "The people you chose get a notification or an email."],
      ["A scheduled date arrives", "Backups, reminders and checks run on their own and show when they last ran."],
      ["Something happens that another system needs", "A signed webhook sends it to your other software."],
    ],
  },
  lms: {
    banner: "DealFlow AI collects every enquiry from your website, campaigns and spreadsheets into one list. Each lead gets an owner, a due date and a full history, while the AI chatbot answers visitors and drafts replies. Your sales team follows up on time and sees which campaigns bring revenue.",
    what: "DealFlow AI is a CRM: the place where every enquiry from your website, ads and spreadsheets is collected, given to a person and followed until it is won or closed.",
    why: "Most lost sales are not lost to a competitor. They are lost because nobody replied in time or the follow-up was forgotten. DealFlow AI gives every enquiry an owner, a next date and a history.",
    problems: [
      p("Enquiries arrive on forms, calls and chats and some are never answered.", "Website forms and chats create leads automatically, in one list."),
      p("Follow-ups live in someone's memory or notebook.", "Every lead has an owner and a due date; untouched leads are flagged as pending."),
      p("When a salesperson leaves, the history leaves with them.", "Notes, messages and every stage change stay on the lead."),
      p("You spend on campaigns without knowing which one brings money.", "Campaign analytics connect spend to leads, conversion and return."),
    ],
    useCases: [
      c("A visitor asks at 11 at night", "Sales team", "The website chatbot gives a first answer from your knowledge base and the enquiry is waiting as a lead in the morning."),
      c("Festival offer campaign", "Marketing", "Create offers and coupons, track which leads came from the campaign and see which one earned."),
      c("Hiring through your website", "HR or recruiter", "Applications from the careers page arrive with resumes; update status and schedule interviews."),
    ],
    ai: [
      a("Website chatbot and voice assistant", "Answers visitors from the knowledge you give it, in your tone, and logs every chat and call."),
      a("Reply drafts", "Writes a draft reply to a lead or candidate for chat, email or WhatsApp. A person reads and sends it."),
      a("Meetings with AI", "An AI agent can answer in a live meeting, and minutes with action items are written from the transcript."),
      a("Ask the assistant", "Ask which leads are stale, then have it move a stage, assign an owner, add a note or schedule an interview."),
    ],
    aiRule: APPROVE,
    automation: [
      ["A new lead arrives", "It goes to the right person by rule and they are told; a welcome message can go out."],
      ["A follow-up is late", "The owner is reminded."],
      ["A deal is marked won", "The client record is created for the delivery team."],
    ],
  },
  hrms: {
    banner: "TalentOS keeps employee records, attendance, leave, hiring and payroll together. Salary is worked out from real attendance with PF, ESI, professional tax and TDS, and payslips are ready for everyone. Employees help themselves, managers approve in a click and HR gets its time back.",
    what: "TalentOS is HR and payroll software: employee records, attendance, leave, hiring and salary in one place, with self-service for every employee.",
    why: "Salary depends on attendance, leave, holidays and tax. When these sit in separate sheets, payroll takes days and mistakes reach people's bank accounts. TalentOS works it all out from the same records.",
    problems: [
      p("Payroll is rebuilt in a spreadsheet every month.", "Paid days come from real attendance, approved leave and the holiday calendar."),
      p("PF, ESI, professional tax and TDS are calculated by hand.", "Indian statutory payroll is computed, and the return files download from the payroll run."),
      p("HR answers the same leave and payslip questions all day.", "Employees check attendance, apply for leave and download payslips themselves."),
      p("Offers, joining documents and records are scattered.", "An accepted applicant becomes an employee record with documents in one profile."),
    ],
    useCases: [
      c("Month-end salary", "HR and finance", "Run payroll, clear the blocking and review warnings, approve, pay through your own Razorpay account and download statutory files."),
      c("Leave without paper", "Employee and manager", "The employee applies from the portal, the manager approves, and attendance and salary update."),
      c("Tax declaration season", "Employee", "Compare old and new tax regime on the real salary, choose one and declare investments."),
    ],
    ai: [
      a("Ask the HR assistant", "“Who is on leave next week?” or “How many people joined this quarter?” answered from your records."),
      a("Approvals by asking", "Have it approve or reject a leave request or record attendance for one person or many, after you confirm."),
      a("Answers across the business", "DataBrain AI shows payroll and headcount trends and how each figure was calculated."),
    ],
    aiRule: APPROVE,
    automation: [
      ["Someone asks for leave", "The right manager is notified."],
      ["An offer is accepted", "The employee record is created."],
      ["A document or probation period is about to end", "HR is warned in time."],
      ["Salaries are paid", "The payout is booked in SRB CashFlow AI."],
    ],
  },
  fms: {
    banner: "CashFlow AI handles invoices, payments, bills, bank accounts, books and reports in one place. It reminds late payers, matches collections, receives entries from payroll and purchasing, and prepares GST and TDS working for your CA. You always know who owes you and what you owe.",
    what: "CashFlow AI is accounting software for money coming in and going out: invoices, payments, bills, bank accounts, books, GST and TDS working, and reports.",
    why: "A business can be profitable and still run out of cash. CashFlow AI shows who owes you, what you owe and what is in the bank, from entries that arrive from sales, payroll and purchasing.",
    problems: [
      p("Customers pay late because nobody chases them.", "Payment links on invoices and automatic reminders for overdue ones."),
      p("The same salary, bill or project invoice is typed twice.", "Entries arrive from TalentOS, SpendIQ, SprintOS and Cohort AI on their own."),
      p("Month-end closing is a rush with unknown gaps.", "A guided month-close checklist checks the books and locks the month."),
      p("Your CA asks for GST and TDS workings at the last minute.", "GST and TDS working pages, a filing calendar and CSV files are ready for the CA."),
    ],
    useCases: [
      c("Raise and collect an invoice", "Accounts", "Create a GST invoice, send a payment link, and the receipt is matched when the customer pays."),
      c("Pay a supplier safely", "Finance", "A change in a vendor's bank details waits for a second person to verify it before any payment."),
      c("Owner's cash check", "Owner", "See receivables, payables, bank balances and the checks that need attention today."),
    ],
    ai: [
      a("Ask the accounts assistant", "“Which invoices are more than 30 days overdue?” or “Which customers owe us the most?”"),
      a("Entries by asking", "Have it record a payment against invoices, issue a credit or debit note or start a refund, after you confirm."),
      a("Reports in plain English", "DataBrain AI answers profit and cash questions from live records and shows the calculation."),
    ],
    aiRule: `${APPROVE} Tax pages prepare working for your CA; nothing is filed with the government.`,
    automation: [
      ["An invoice becomes overdue", "A payment reminder is sent."],
      ["A large expense is entered", "It goes to an approver."],
      ["A payment link is paid", "Finance is told and the books are updated."],
      ["A filing date comes close", "A daily reminder is sent."],
    ],
  },
  pms: {
    banner: "SprintOS plans client projects from first task to final bill. Teams work on boards and timelines, log time in seconds and get overdue alerts, while managers see cost, budget and profit for every project. You deliver on time and know which work actually earns money.",
    what: "SprintOS is project management for client work: projects, tasks, milestones, timesheets, documents and profit for every project.",
    why: "A project can finish on time and still lose money. SprintOS shows the work, the hours and the cost together, so you act before the deadline or the budget is gone.",
    problems: [
      p("Status is collected by asking people in chat.", "Boards, lists, timeline and calendar show the real status."),
      p("Nobody knows if a project made money.", "Approved timesheets give estimated against actual cost and profit."),
      p("Billing waits until someone remembers the finished stage.", "A completed milestone can raise its invoice."),
      p("Clients keep calling for updates and documents.", "ClientOS gives them milestones, documents and messages on their own page."),
    ],
    useCases: [
      c("Start a won project", "Project manager", "Create the client and project, add milestones, assign tasks with dates and priorities."),
      c("Daily work", "Team member", "Open My tasks, update status and log time in seconds."),
      c("Weekly review", "Delivery head", "See overdue projects, workload and which project has the lowest margin."),
    ],
    ai: [
      a("Ask the project assistant", "“Which projects are overdue?” or “What is on my plate today?”"),
      a("Updates by asking", "Have it move a task, submit your timesheet or approve entries and update costing, after you confirm."),
      a("Delivery questions", "DataBrain AI answers utilisation and margin questions from timesheets and budgets."),
    ],
    aiRule: APPROVE,
    automation: [
      ["A task is assigned or becomes late", "The person is notified."],
      ["A milestone is finished", "An invoice is raised."],
      ["A project comes close to its budget", "The manager is warned."],
    ],
  },
  prms: {
    banner: "SpendIQ controls what your business buys. Requests follow approvals, supplier quotes are compared, deliveries are matched with orders and invoices, and assets, stock and renewals stay recorded. Money leaves only after the right person approves and the goods have arrived.",
    what: "SpendIQ is purchasing and spend control: requests, approvals, supplier quotes, purchase orders, goods received, bills, assets, stock and subscriptions.",
    why: "Money leaks through purchases agreed over chat, bills paid without proof of delivery and subscriptions that renew unnoticed. SpendIQ checks each rupee before it leaves.",
    problems: [
      p("Purchases are approved verbally.", "Every request follows an approval chain set by amount."),
      p("The first supplier quote is accepted.", "RFQs collect quotes and compare them side by side."),
      p("Bills are paid for goods that never fully arrived.", "Order, goods receipt and invoice are matched before payment."),
      p("Laptops, licences and servers are tracked from memory.", "Assets, assignments, stock and renewals are all recorded."),
    ],
    useCases: [
      c("Buy new laptops", "Employee and approver", "Raise a request, get approval, compare quotes, issue the order and record delivery."),
      c("Renewal watch", "Admin", "See which subscriptions renew in the next 30 days and cancel what is unused."),
      c("Expense claim", "Employee", "Submit a claim with details and follow it until it is approved and paid."),
    ],
    ai: [
      a("Ask the procurement assistant", "“Which purchase requests are still waiting?” or “What did we spend on suppliers this month?”"),
      a("Work by asking", "Have it draft a requisition and send it to approvers, after you confirm."),
      a("Spend analysis", "DataBrain AI shows spend by supplier and period, with the calculation."),
    ],
    aiRule: APPROVE,
    automation: [
      ["A request is submitted", "It goes to the right approver based on the amount."],
      ["A subscription is about to renew", "You are warned."],
      ["A supplier invoice matches its order", "A bill to pay is created in SRB CashFlow AI."],
    ],
  },
  tms: {
    banner: "Cohort AI runs your training or internship programme from application to certificate. Manage batches, classes, attendance, assignments, fees and placements, and give each student a page of their own. Institutes spend less time on follow-ups and every certificate can be verified.",
    what: "Cohort AI runs training and internship programmes: applications, enrolment, batches, classes, attendance, assignments, fees, placements and certificates.",
    why: "Institutes lose time and fees when admissions, timetables, payments and certificates sit in different places. Cohort AI follows each student from application to certificate.",
    problems: [
      p("Applications get lost in forms and calls.", "One list or board shows every application and its stage."),
      p("Fee dues are found out late.", "Fee plans, instalments, receipts and reminders."),
      p("Students ask staff for timetables and results.", "Each student has their own page for classes, work, payments and certificates."),
      p("Employers cannot trust a certificate.", "Every certificate can be verified publicly."),
    ],
    useCases: [
      c("New batch admissions", "Admissions team", "Review applications, accept students and enrol them into a batch with capacity and mentors."),
      c("A teaching day", "Mentor", "Mark attendance, share the class recording and review assignment submissions."),
      c("Course completion", "Programme manager", "Issue certificates and record placements."),
    ],
    ai: [
      a("Ask the training assistant", "“Which batches have pending fees?” or “What is attendance this month?”"),
      a("Daily work by asking", "Have it enrol a student, mark class attendance, record a fee payment or issue a certificate, after you confirm."),
      a("Programme numbers", "DataBrain AI answers enrolment, attendance and collection questions."),
    ],
    aiRule: APPROVE,
    automation: [
      ["A class is coming up", "Students are told."],
      ["A fee is pending", "The student is reminded."],
      ["A programme is completed", "The certificate is issued."],
    ],
  },
  messenger: {
    banner: "Huddle AI is team chat built into your workspace, with direct messages, channels, announcements, meetings, calls and file sharing. Conversations stay beside the work they belong to, inside your own company, and you can see who has read an important notice.",
    what: "Huddle AI is your company's own team chat: direct messages, channels, announcements, meetings, calls and shared files.",
    why: "Work discussed in personal chat apps is lost when people leave, and nobody knows who read the notice. Huddle AI keeps company talk inside your own workspace.",
    problems: [
      p("Company files travel on personal phones.", "Conversations and files stay in your workspace with roles and retention."),
      p("Nobody knows who saw an important notice.", "Announcements track who has read them and can be scheduled."),
      p("Old decisions cannot be found.", "Search covers messages, people and files."),
      p("Chat sits far from the actual work.", "Project and team channels follow your real teams and projects."),
    ],
    useCases: [
      c("Company-wide notice", "Management", "Post an announcement to everyone or one audience and see who has read it."),
      c("Project room", "Project team", "Discuss in a project channel with threads, files and voice notes."),
      c("Quick meeting", "Any team", "Start an audio or video call from the same conversation."),
    ],
    ai: [
      a("Catch up quickly", "Ask the assistant to read a conversation and tell you what matters."),
      a("Send and organise", "Have it send a message, create a channel or group, add people or schedule an announcement, after you confirm."),
      a("Find people and meetings", "Ask for your channels, announcements, meetings or the right person to message."),
    ],
    aiRule: `${APPROVE} It reads only conversations you are a member of, and DataBrain AI never reads Huddle chats.`,
    automation: [
      ["An automation produces a result", "It is posted into the chosen channel."],
      ["A deal is won or a task is late", "The channel is told."],
      ["An announcement's scheduled time arrives", "It is published."],
    ],
  },
  sop: {
    banner: "Playbook AI helps you write procedures and business documents, keep every version and assign them to the right people. AI drafts and reviews your text from company facts, and read confirmations show who is up to date. Your team works the same correct way, and audits become easy.",
    what: "Playbook AI is where your company writes its procedures and business documents, keeps versions, assigns them to people and records who has read them.",
    why: "If a process lives only in people's heads, quality changes with the person. Written, current and acknowledged procedures make work repeatable and audits easier.",
    problems: [
      p("Different people follow different old copies.", "One approved version, with full version history and side-by-side comparison."),
      p("Nobody can prove a policy was read.", "Assignments and acknowledgements show who confirmed and who is pending."),
      p("Documents are written from a blank page.", "Start from a template or catalogue and let AI draft sections from your company facts."),
      p("Procedures go out of date silently.", "Review and expiry dates remind the owner."),
    ],
    useCases: [
      c("Onboard a new joiner", "HR", "Assign the procedures for their role and track confirmation."),
      c("Prepare for an audit", "Compliance", "Open compliance reports, versions and the audit trail."),
      c("Write an HR letter or policy", "Admin", "Pick a template, fill the facts, let AI draft, edit by hand and export to PDF or Word."),
    ],
    ai: [
      a("Draft from your facts", "Writes document sections using the facts your company holds, and is checked so it does not invent values."),
      a("Improve your writing", "Rewrite, shorten, expand, simplify, change tone or fix grammar, with a preview before anything is applied."),
      a("Review a whole document", "Points out unclear wording, inconsistent terms, missing sections and risky wording, one suggestion at a time."),
      a("Ask about a document", "Answers questions with references to the parts it used."),
    ],
    aiRule: "AI shows a preview or a suggestion; the author decides what goes into the document. Have legal documents checked by a qualified advocate.",
    automation: [
      ["A procedure is new or updated", "The assigned people are told."],
      ["A read confirmation is overdue", "A reminder is sent."],
      ["A review date is near", "The owner is reminded."],
    ],
  },
  lpms: {
    banner: "ContractFlow AI takes a document from Playbook AI to a signed, safely kept record. Signers confirm with a one-time code, the signed copy is sealed against changes, and expiry dates are tracked with reminders. Every agreement is easy to find, with its status and history.",
    what: "ContractFlow AI handles signing and keeping business documents: take a document written in Playbook AI, send it for signature and keep the signed copy with its history.",
    why: "Agreements stuck in email are hard to find, easy to change and easy to forget at renewal. ContractFlow AI keeps what was signed, by whom, and when it ends.",
    problems: [
      p("Documents are printed, signed and scanned back.", "Signers open a secure link, confirm with a one-time code and sign online."),
      p("Nobody can tell if the file changed after signing.", "The signed document is locked and sealed with a hash, so a change can be detected."),
      p("Pending signatures are chased by memory.", "Each request shows pending, signed or declined."),
      p("Expiry dates are noticed after they pass.", "Owners are reminded as the date approaches."),
    ],
    useCases: [
      c("Client agreement", "Legal or sales", "Write it in Playbook AI, send for signature and file the sealed copy."),
      c("Employee letters", "HR", "Send the letter for signature and keep it against the person."),
      c("Contract register", "Admin", "See status, owner, effective and expiry dates and approval history."),
    ],
    ai: [
      a("Edit by instruction", "Type what should change and the AI proposes the exact edits to the document before signing."),
      a("Ask the assistant", "Ask about your documents and approve a pending step, after you confirm."),
      a("Written with Playbook AI", "Drafting and review help comes with Playbook AI, included with ContractFlow."),
    ],
    aiRule: "This is a simple electronic signature checked by one-time code. It is not Aadhaar eSign or a digital signature certificate.",
    automation: [
      ["A signer completes or declines", "The request status is updated."],
      ["Everyone has signed", "The document is sealed and kept."],
      ["An expiry date approaches", "The owner is reminded."],
    ],
  },
  dlms: {
    banner: "CyberVault stores passwords, documents, links and notes in an encrypted vault for your company and for each client. Access is given record by record, every reveal is logged and expiry warnings arrive early. Your team gets what it needs without passwords travelling in chat.",
    what: "CyberVault is an encrypted vault for passwords, documents, links, accounts and notes, for your company and for each client.",
    why: "Passwords in chats and spreadsheets are a risk every day, and an expired domain or certificate can stop your business. CyberVault controls who sees what and warns before things lapse.",
    problems: [
      p("Passwords are shared in chat.", "Passwords are encrypted, hidden by default and revealed only with permission."),
      p("Nobody knows who opened a credential.", "Every reveal and change is logged."),
      p("A domain or certificate expires by surprise.", "A daily check flags what is expired or about to expire."),
      p("An employee sees every client's secrets.", "People see only the clients and records assigned to them."),
    ],
    useCases: [
      c("Agency client logins", "Account manager", "Keep each client's logins, links and files in that client's vault."),
      c("Someone leaves", "Administrator", "Check what they opened, remove access and change the passwords that matter."),
      c("Renewal planning", "IT or admin", "Review upcoming expiries of domains, hosting and certificates."),
    ],
    ai: [
      a("Ask the vault assistant", "Ask what exists and who has access, within your own permissions."),
      a("Add records by asking", "Have it add a login (without the password), a link or a note, after you confirm."),
      a("Secrets stay out of AI", "Passwords are never given to the assistant and never appear in logs or notifications."),
    ],
    aiRule: APPROVE,
    automation: [
      ["A document or password is near expiry", "The owner is warned."],
      ["A record is shared or changed", "The right people are told."],
      ["Every day", "The expiry check runs on its own."],
    ],
  },
  ots: {
    banner: "EvalIQ creates and runs online tests for job applicants, employees and students. Build a question bank, set timed tests, assign them to the right people and let objective answers mark themselves. Results, reports and certificates are ready without manual counting.",
    what: "EvalIQ is an online test system for hiring, employees and students: question bank, timed tests, automatic marking, results and certificates.",
    why: "Paper tests and shared forms are slow to mark and easy to copy. EvalIQ tests many people the same fair way and gives results without manual counting.",
    problems: [
      p("Every test is prepared again from zero.", "A reusable question bank with 17 question types and spreadsheet import."),
      p("Marking takes days.", "Objective answers are marked automatically; the rest go to an evaluator queue."),
      p("Copying is hard to notice.", "Optional full screen, tab-switch detection and one-window rules make cheating harder and visible."),
      p("Results and certificates are made by hand.", "Results, section scores and certificates follow from the test."),
    ],
    useCases: [
      c("Screen job applicants", "Recruiter", "Assign a test from the hiring stage and shortlist by score."),
      c("Staff compliance test", "HR", "Assign by department or role and see who passed."),
      c("Course final exam", "Trainer", "Assign to a batch; students take it in their portal and download certificates."),
    ],
    ai: [
      a("Draft questions", "Ask the assistant for questions with answer keys; check them, then add them to the bank."),
      a("Build and assign by asking", "Have it create a test, publish it and assign it to people, after you confirm."),
      a("Read the dashboard", "Ask for test numbers instead of opening each report."),
    ],
    aiRule: `${APPROVE} Online exam checks reduce cheating; they cannot make an exam cheat-proof.`,
    automation: [
      ["An applicant reaches a hiring step", "The test is assigned."],
      ["Answers are waiting to be marked", "The evaluator is told."],
      ["Someone passes", "A certificate is issued."],
    ],
  },
  aibots: {
    banner: "AgentOS lets you build AI assistants and voice agents that follow your instructions and answer from your own documents. Choose who can use each one, place calls with recordings and summaries, and track usage and cost. Routine questions get answered while your team handles the rest.",
    what: "AgentOS lets you build your own AI assistants and voice agents that follow your instructions and answer from your own documents.",
    why: "Teams and customers ask the same questions again and again. An assistant that knows your documents answers at once, and you control who can use it and what it costs.",
    problems: [
      p("Staff search folders for the same answer.", "An assistant answers from the knowledge files you upload."),
      p("General AI tools do not know your rules.", "Each assistant has its own instructions and private knowledge."),
      p("Nobody knows what AI is costing.", "Chats, tokens, estimated cost and failures are tracked per assistant."),
      p("Calls to leads take up the whole day.", "Voice agents make the calls you start or schedule, with recording, transcript and summary."),
    ],
    useCases: [
      c("Proposal and meeting-notes helper", "Team", "Create an assistant with your format and documents; the team chats with it."),
      c("Customer questions", "Support", "Give customers an assistant that answers from your help documents."),
      c("Follow-up calls", "Sales", "Schedule a voice agent call, listen live on a phone call and take over when needed."),
    ],
    ai: [
      a("Custom assistants", "Your instructions, your knowledge files, your list of who may use each one."),
      a("Voice agents and phone calls", "Outbound, inbound and website calls through your own calling accounts, with transcripts and summaries."),
      a("Live take-over", "A team member can listen to a phone call and take it over from the browser."),
      a("Manager oversight", "Permitted managers can review conversations, calls and usage."),
    ],
    aiRule: "No outbound call is made unless a signed-in person starts or schedules it. You are responsible for lawful calling under TRAI and DND rules.",
    automation: [
      ["A scheduled call time arrives", "Calling rules and the do-not-call list are checked, then the call is placed."],
      ["A call ends", "The transcript, summary and collected answers are saved."],
      ["A customer asks a question", "The assistant answers at any hour."],
    ],
  },
  intelligence: {
    banner: "DataBrain AI answers business questions written in plain language. It reads the live records of your products with your own permissions, replies with a table, chart or key number, and shows how the answer was calculated. Decisions no longer wait for someone to build a report.",
    what: "DataBrain AI lets you ask questions about your business in plain language and get answers worked out from your live records.",
    why: "Decisions wait when every question needs someone to build a report. DataBrain AI answers in moments and shows how the number was calculated, so you can trust it.",
    problems: [
      p("A simple question takes a day of report making.", "Type the question and get a table, chart or key number."),
      p("Two people bring two different figures.", "Both are computed from the same live records, with the filters shown."),
      p("Sharing reports exposes private data.", "Answers use only what the person asking is allowed to see."),
      p("Data must be copied into another reporting tool.", "It reads your products directly; there is nothing to import."),
    ],
    useCases: [
      c("Cash question", "Owner", "“What did we invoice this month and what is still unpaid?”"),
      c("Delivery question", "Delivery head", "“Which projects are delayed?”"),
      c("People question", "HR", "“How many people joined this quarter, by department?”"),
    ],
    ai: [
      a("Plans the data it needs", "It decides which records answer your question and runs read-only queries."),
      a("Shows its working", "Every answer carries a “How this was calculated” explanation."),
      a("Picks the right view", "Table, chart or KPI, with CSV download for tables."),
      a("Remembers conversations", "Search, reopen or delete earlier questions; suggested questions help you start."),
    ],
    aiRule: "It only reads, never changes records. Sensitive fields are never given to the AI, and Huddle chats are never read.",
    automation: [
      ["You ask a question often", "It can become a regular summary."],
      ["A product's records change", "The next answer already uses the new figures."],
      ["AI is used", "Usage is counted against your plan."],
    ],
  },
  smms: {
    banner: "ViralPulse AI turns one idea into ready posts, captions, images and ad concepts for each social platform. Your team edits, approves and schedules them on one calendar, then checks the results. You stay visible every week, and nothing is published without a person's approval.",
    what: "ViralPulse AI plans, writes, designs, approves, schedules and publishes social media posts and ad creatives from one brand profile.",
    why: "Posting regularly needs ideas, writing, design and approvals every week. ViralPulse AI does the heavy writing and design while your team keeps the final say.",
    problems: [
      p("Pages stay silent because creating content takes too long.", "AI turns one idea into a version for each platform."),
      p("Every post sounds different.", "AI writes from one brand profile, your services and live offers."),
      p("Something goes out without approval.", "Nothing publishes without an explicit publish or an approved schedule."),
      p("Nobody knows what worked.", "Analytics show post and campaign performance."),
    ],
    useCases: [
      c("A month of posts", "Marketing", "Write a campaign brief, get strategy and posts, edit, approve and place them on the calendar."),
      c("Festival creative", "Marketing", "Generate images and captions for an offer and publish to connected pages."),
      c("Agency work", "Agency team", "Use each client's brand context and keep every version."),
    ],
    ai: [
      a("Campaign strategy", "Audiences, keywords, hashtags and ad concepts from a brief."),
      a("Platform-ready writing", "Captions and scripts within each platform's limits; refine with one sentence."),
      a("Images and video scripts", "AI-made images, editing of a picture and short video scripts."),
      a("Brochures and visiting cards", "Generate and update brochure sections and card designs by chatting."),
    ],
    aiRule: "A person approves everything that is published. Paid ads are never launched or funded from the product.",
    automation: [
      ["A post is ready", "It is sent for approval."],
      ["Its scheduled time arrives", "It is published to the connected account."],
      ["Results come in", "Campaign performance is reported."],
    ],
  },
  seo: {
    banner: "RankMax AI audits your website, tracks keywords, rankings, competitors and backlinks, and turns every problem into a task with an owner. Edit titles, sitemap and schema from the same place, and let the next audit confirm the fix. You always know what to improve next.",
    what: "RankMax AI checks your website the way search engines see it, tracks your keywords and turns problems into a list of fixes.",
    why: "A good website that cannot be found brings no enquiries. RankMax AI shows what is wrong, what matters first and whether the fix worked.",
    problems: [
      p("You do not know why pages do not appear in search.", "A crawler checks 50+ technical, content, link and mobile points."),
      p("Reports list problems nobody owns.", "Issues become prioritised tasks with owners."),
      p("Titles and descriptions need a developer.", "Edit meta, sitemap, robots and schema here; your SiteCraft site uses them live."),
      p("Numbers from different tools cannot be trusted.", "Verified data and estimates are clearly labelled."),
    ],
    useCases: [
      c("First health check", "Business owner", "Run an audit and start with the most important problems."),
      c("Monthly review", "Marketing", "Track rankings, competitors and backlinks and share a report."),
      c("After publishing a page", "Content team", "Check on-page SEO and ask Google to index it."),
    ],
    ai: [
      a("Ask the SEO assistant", "Ask for dashboard numbers, issue counts or pages competing for the same keyword."),
      a("Act by asking", "Have it run an audit, add a page, request indexing or update and assign issues, after you confirm."),
      a("Clear recommendations", "Each finding comes with what to fix and is verified by the next audit."),
    ],
    aiRule: APPROVE,
    automation: [
      ["An audit finds problems", "They become tasks for people."],
      ["The next audit runs", "Fixed findings are verified."],
      ["Rankings or indexing change", "You are warned."],
    ],
  },
  cms: {
    banner: "SiteCraft AI builds your business website with AI and lets your team run it without a developer. Edit pages by drag and drop, publish blogs and forms, change themes, run offers and connect your own domain. Every enquiry from the site reaches your sales list.",
    what: "SiteCraft AI builds and runs your company website: pages, blog, forms, themes, menus, offers and your own web address, without a developer.",
    why: "Waiting for a developer for every change keeps a website old. SiteCraft AI lets your team publish the same day, and every enquiry goes straight to sales.",
    problems: [
      p("A new website takes weeks to start.", "The AI website generator creates content and design from your business profile."),
      p("Small text changes need a developer.", "Drag-and-drop sections with draft, preview and publish."),
      p("Form enquiries sit in an inbox.", "Submissions go into DealFlow as leads and to your email."),
      p("A bad edit breaks the live site.", "Drafts and page versions let you compare and restore."),
    ],
    useCases: [
      c("Launch a business website", "Owner", "Generate a starter site, change text and photos, connect your domain and publish."),
      c("Run an offer", "Marketing", "Add a festival offer or coupon, referral campaign and push notification."),
      c("Hiring page", "HR", "Publish jobs; applications reach your team."),
    ],
    ai: [
      a("AI website generator", "Plans pages and writes copy, offerings, FAQs and design choices from your business details."),
      a("AI photos", "Creates photos that suit your business for the pages."),
      a("Website assistant", "Ask it to make changes or manage offers, coupons and rewards, after you confirm."),
      a("Chatbot and voice on your site", "Answers visitors from your knowledge base and logs every conversation."),
    ],
    aiRule: `${APPROVE} Starter content never invents testimonials or statistics.`,
    automation: [
      ["A visitor sends a form", "A lead is created and you get an email."],
      ["A page is waiting for approval", "The team is told."],
      ["You publish", "The live website updates and a version is saved."],
    ],
  },
  website: {
    banner: "Sites puts your published website online on your own web address or one of ours, with a secure HTTPS connection set up for you. Work safely with drafts and maintenance mode, offer a chatbot to visitors and send every enquiry straight to your sales team.",
    what: "Sites is the hosting side of SiteCraft: it serves your published company website on your own web address or one of ours, with a secure connection.",
    why: "Your website is where customers check you out. It must open on your address, safely, and every enquiry must reach someone.",
    problems: [
      p("Hosting and SSL need technical setup.", "A secure HTTPS connection is set up automatically."),
      p("You do not have a domain yet.", "Start on an automatic address and connect your own later."),
      p("Visitors see half-finished changes.", "Draft safely and use maintenance mode while you work."),
      p("Enquiries are missed.", "Forms capture them straight into DealFlow."),
    ],
    useCases: [
      c("Go live quickly", "New business", "Publish on the automatic address the same day."),
      c("Use your existing domain", "Established business", "Add a domain or subdomain and publish the DNS records shown."),
      c("Rework the site", "Marketing", "Turn on maintenance mode, change pages and publish."),
    ],
    ai: [
      a("Chatbot for visitors", "Answers from your knowledge base at any hour."),
      a("Voice assistant", "Visitors can talk to your assistant on the site."),
      a("Built by SiteCraft AI", "The pages and design can be generated and edited with AI."),
    ],
    aiRule: "The assistant answers only about your business, from the knowledge you give it.",
    automation: [
      ["A visitor sends an enquiry", "It goes into SRB DealFlow AI."],
      ["You publish a change", "The live site updates."],
      ["You connect a domain", "The secure certificate is set up."],
    ],
  },
  portal: {
    banner: "ClientOS gives customers, students and job applicants a private, branded page of their own. They see projects, invoices, classes, tests, documents and application status, pay online and message your team. Fewer calls asking for updates, and each person sees only their own information.",
    what: "ClientOS is a private, branded page where your customers, students and job applicants see their own information and message your team.",
    why: "People call and email to ask for status, invoices, timetables and results. A portal lets them see it themselves, safely.",
    problems: [
      p("Clients keep asking for project updates.", "They see projects, milestones and documents."),
      p("Invoices are resent again and again.", "Invoices and online payment are on their page."),
      p("Students ask for timetables and results.", "Classes, assignments, attendance, tests and certificates in one login."),
      p("Applicants do not know where they stand.", "They follow application status, interviews and assessments."),
    ],
    useCases: [
      c("Client delivery", "Client", "Check milestones, download documents, pay an invoice and send a message."),
      c("Student day", "Student", "See today's class, submit work and take a test."),
      c("Referral rewards", "Customer", "Refer others and see wallet rewards."),
    ],
    ai: [
      a("Portal assistant", "Answers a person's questions about their own information."),
      a("Message the team", "Draft and send a message to your company, after they confirm."),
      a("Only their own data", "A portal user can never see another person's records."),
    ],
    aiRule: "The assistant sees only the signed-in person's own records, and sends nothing without their confirmation.",
    automation: [
      ["There is a new invoice, message or test", "The portal user is told."],
      ["A payment is made", "Your accounts are updated."],
      ["A test result is released", "It appears on their page."],
    ],
  },
  support: {
    banner: "ResolveIQ is help built into your software: an AI chat that knows the screen you are on, searchable help articles and a request desk with attachments and status tracking. Users get answers quickly, and a person takes over whenever the articles are not enough.",
    what: "ResolveIQ is built-in help: an AI help chat, searchable help articles and a request desk where you can follow every request.",
    why: "People stop using software when they get stuck. ResolveIQ answers on the same screen and hands over to a person when needed.",
    problems: [
      p("Users stop work to ask a colleague.", "The help assistant knows which screen they are on."),
      p("The same problem is explained twice.", "A chat becomes a support request with its details."),
      p("Nobody knows if anyone is working on it.", "Status, replies and notifications on every request."),
      p("Screenshots travel over chat.", "Attachments stay with the request."),
    ],
    useCases: [
      c("How do I do this?", "Any user", "Ask the assistant and follow its answer from approved help articles."),
      c("Something is broken", "Any user", "Turn the chat into a request with a screenshot."),
      c("Follow up", "Admin", "Track open requests, reply and reopen resolved ones."),
    ],
    ai: [
      a("Help chat", "Answers only from approved help articles, in English, Hindi or Hinglish."),
      a("Request from a chat", "Writes the title, description and priority for you to review."),
      a("Raise and reply", "Ask the assistant to raise a request or add a reply, after you confirm."),
    ],
    aiRule: "If the help articles do not cover a question, a support request takes it to a person.",
    automation: [
      ["A request is raised", "The support team is told."],
      ["Someone replies or the status changes", "You are notified."],
      ["A chat needs a person", "It can be turned into a request."],
    ],
  },
};
