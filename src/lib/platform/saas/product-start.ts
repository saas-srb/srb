/**
 * "Your first three steps" for each product: the first things a new person does, in order. Every step uses a screen or feature that
 * exists in the product (see feature-lists.ts), described in plain words.
 */
export interface StartStep { t: string; x: string }

export const PRODUCT_START: Record<string, StartStep[]> = {
  workspace: [
    { t: "Finish the guided setup", x: "Enter your business profile and departments, and choose which products your team will use." },
    { t: "Add your brand", x: "Open Branding and add your logo, your name and a theme. They carry through every product, email and PDF." },
    { t: "Invite your team", x: "Open Users, roles & seats, invite people by email and give each person a role." },
  ],
  lms: [
    { t: "Make sure your website form is live", x: "Website forms send enquiries into Leads. Send a test enquiry and watch it arrive." },
    { t: "Give the lead an owner and a due date", x: "Open the lead in Leads, choose who looks after it and when to follow up." },
    { t: "Follow it to a result", x: "Add notes, send a message, and mark the lead won or closed. Pending tasks shows leads that have gone quiet." },
  ],
  hrms: [
    { t: "Add your people", x: "Add employees one by one, or import them from a spreadsheet, and set up your Departments." },
    { t: "Set up the rules", x: "Choose your leave types and holidays, and see attendance in Attendance." },
    { t: "Run a payroll month", x: "Check attendance and leave, run Payroll runs, and employees see their payslips in My salary & payslips." },
  ],
  fms: [
    { t: "Connect your payment account", x: "In Workspace, open Payment account and connect your own account, so customers pay you directly." },
    { t: "Send your first invoice", x: "Create an invoice in Invoices, add a payment link and send it to the customer." },
    { t: "Watch it get paid", x: "Receivables shows what customers owe. When one pays, the receipt and your accounts update by themselves." },
  ],
  pms: [
    { t: "Add a client", x: "Open Clients and add the business or person you are doing the work for." },
    { t: "Create a project", x: "In Projects, add milestones and tasks, give each an owner and a date, and see them on the board and timeline." },
    { t: "Track time and cost", x: "Team members fill in Timesheets, managers approve them, and Costing shows whether the project makes money." },
  ],
  prms: [
    { t: "Raise a purchase request", x: "Any employee can ask to buy something in Purchase requests. It goes to the approver for that amount." },
    { t: "Get quotes and place the order", x: "Ask suppliers for prices with RFQs, compare them, then issue a Purchase order." },
    { t: "Record delivery and match the invoice", x: "Record what arrived in Goods receipt (GRN), then check the supplier invoice against the order and the delivery before paying." },
  ],
  tms: [
    { t: "Create a program and a batch", x: "Set up what you teach in Programs, then add a Batch with dates, mentors and a seat limit." },
    { t: "Enrol students", x: "Add students directly, then assign them to a batch so they can access their own page." },
    { t: "Run classes and issue certificates", x: "Schedule Classes, give out Assignments, and issue Certificates when a student completes the program." },
  ],
  messenger: [
    { t: "Create a team channel", x: "Open Team channels and make a channel for a team or a project." },
    { t: "Start a conversation", x: "Send a Direct message or start a Group chat, and share files in the same place." },
    { t: "Post an announcement", x: "Use Announcements to tell everyone something, and see who has read it." },
  ],
  sop: [
    { t: "Write your first procedure", x: "Open New SOP and write it in the editor, or start from a template." },
    { t: "Give it to the right people", x: "Use Assignments to give it to people, teams, departments or roles." },
    { t: "Check who has read it", x: "Acknowledgement tracking and Compliance reports show who has read it and who has not." },
  ],
  lpms: [
    { t: "Make a template", x: "In Templates, build a reusable document from blocks, such as an offer letter or an agreement." },
    { t: "Create a document from it", x: "Open New document, choose the template and fill in the details." },
    { t: "Approve and sign", x: "Send it through Approvals and Signatures. Document history keeps the full record." },
  ],
  dlms: [
    { t: "Open a vault", x: "Use the Company vault for your business, or add a Client vault for one client." },
    { t: "Add a record", x: "Store a password in Credential vault, a file in Document vault, or a link or note in URLs & accounts and Notes." },
    { t: "Choose who can open it", x: "Set Per-record access and an expiry reminder, so nothing runs out unnoticed." },
  ],
  ots: [
    { t: "Add your questions", x: "Build your Question bank one question at a time, or add many at once with Bulk create questions." },
    { t: "Build a test", x: "In New test, pick questions from the bank, set the time and the sections." },
    { t: "Assign it and read the results", x: "Use Assign a test to send it to people. Results and Certificates show how they did." },
  ],
  aibots: [
    { t: "Create an assistant", x: "Open Create bot and write its instructions: who it helps and how it should answer." },
    { t: "Add your knowledge", x: "Upload your documents in Knowledge files, so the assistant answers from your own material." },
    { t: "Choose who can use it", x: "Set Access modes per bot, start a chat to test it, and watch Usage & cost." },
  ],
  intelligence: [
    { t: "Try a suggested question", x: "Open Suggested questions and pick one, to see how an answer looks." },
    { t: "Ask your own question", x: "Type it in plain English, such as “Which invoices are more than 30 days overdue?”." },
    { t: "Check how it was worked out", x: "Open How this was calculated to see the data and filters behind every answer." },
  ],
  smms: [
    { t: "Connect your social accounts", x: "Use Platform connections to link the social pages you want to post to." },
    { t: "Create a post or a campaign", x: "Open New post & new campaign, and let the AI content generator draft the text and images." },
    { t: "Approve and schedule", x: "Use the Approval workflow, then place the post in Calendar & scheduling." },
  ],
  seo: [
    { t: "Run a website check", x: "Open Website audit to scan your site for problems that hurt your search ranking." },
    { t: "Fix the biggest problems first", x: "SEO issues lists them in order of importance. Turn them into SEO tasks and give each an owner." },
    { t: "Track your rankings", x: "Add your Keywords and watch your position in Rankings." },
  ],
  cms: [
    { t: "Look at your starter website", x: "Your site is already live. Open Pages to see what is there and edit any page." },
    { t: "Choose a look", x: "Pick a Theme, then set your Menus, Footer and Site identity." },
    { t: "Publish your changes", x: "Edits stay as drafts until you publish them in Drafts and publishing. Forms send enquiries to your sales list." },
  ],
  website: [
    { t: "Add your own web address", x: "Enter your domain and add the records shown at your domain provider." },
    { t: "Let the secure connection set itself up", x: "Once the domain is verified, the secure (HTTPS) connection is created automatically." },
    { t: "Publish and keep it safe", x: "Publish your pages, and switch on Maintenance mode whenever you want to work without visitors seeing changes." },
  ],
  portal: [
    { t: "Decide who gets a page", x: "Clients, students and applicants register themselves or you invite them. You manage them in Workspace under External portal users." },
    { t: "Share what they need to see", x: "Projects, invoices, documents, tests and messages appear on their page automatically." },
    { t: "Let them help themselves", x: "People check progress, pay invoices and message you from their page, so you get fewer update emails." },
  ],
  support: [
    { t: "Ask the help assistant", x: "Open Help assistant and ask how to do something. It knows which screen you are on." },
    { t: "Search the help center", x: "Use Help center to read an article on any feature." },
    { t: "Send a request if you need a person", x: "Turn a chat into a request, or create a New request. Follow it in My requests." },
  ],
};
