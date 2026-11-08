/** Step-by-step tutorials. Every step is something you do on a real screen of the product; each has that screen beside it. */
export interface TutorialStep {
  title: string;
  text: string;
  /** Real screen (key under /public/selfrun/screens) shown with the step. */
  shot?: string;
  tip?: string;
}
export interface Tutorial {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  level: "Beginner" | "Intermediate";
  shot: string;
  panel: string;
  youWillHave: string;
  steps: TutorialStep[];
  next: string[];
}

export const TUTORIALS: Tutorial[] = [
  {
    slug: "launch-your-workspace", title: "Launch your business workspace", summary: "From registration to a branded workspace your team can sign in to.", minutes: 10, level: "Beginner", shot: "workspace", panel: "workspace",
    youWillHave: "A branded workspace with your team invited and your data inside.",
    steps: [
      { title: "Register", text: "Create your account with your work email and start on the free-forever plan. Verify your email from the message we send.", shot: "workspace" },
      { title: "Complete the guided setup", text: "Enter your business details, create departments and choose the products your team will use. You can skip and return — a Finish setup strip stays visible until it is done.", shot: "branding" },
      { title: "Add your brand", text: "Open Workspace → Branding, upload your logo, set your name and pick a theme. Save.", shot: "branding" },
      { title: "Invite your team", text: "Open Users, roles & seats, invite people by email and give each a role.", shot: "workspace-users" },
      { title: "Import your data", text: "Bring leads, clients and employees in from a spreadsheet (CSV) under Import data; fix any rows the importer flags.", tip: "Imports never trigger workflows, so nobody is flooded with notifications.", shot: "workspace-users" },
    ],
    next: ["brand-your-workspace", "invite-your-team", "import-your-data"],
  },
  {
    slug: "capture-your-first-leads", title: "Capture your first leads and follow each one to a result", summary: "Connect your website form and work every enquiry with an owner and a due date.", minutes: 8, level: "Beginner", shot: "lms", panel: "lms",
    youWillHave: "Enquiries arriving as leads, each with an owner and a follow-up date.",
    steps: [
      { title: "Open SelfRun DealFlow AI", text: "The dashboard shows your pipeline: New, In progress, Completed and Rejected.", shot: "lms" },
      { title: "Make sure your form is live", text: "Website forms send enquiries straight to SelfRun DealFlow AI. Check the contact form on your website and submit a test enquiry.", shot: "cms-pages" },
      { title: "Open Leads", text: "Your test enquiry appears as a new lead with its source. Open it, assign an owner and set a due date.", shot: "lms-leads" },
      { title: "Follow up", text: "Add notes, send a message, and move the lead to In progress. Leads untouched for days are flagged under Pending Tasks.", shot: "lms-leads" },
      { title: "Win it", text: "Mark the lead Completed when the deal is won — the client record can be created for you.", shot: "lms" },
    ],
    next: ["leads-and-pipeline", "first-automations"],
  },
  {
    slug: "build-your-first-automation", title: "Build your first automation", summary: "Notify the owner the moment a new lead arrives — without anyone remembering.", minutes: 6, level: "Beginner", shot: "automations", panel: "workspace",
    youWillHave: "A running workflow that you can pause at any time.",
    steps: [
      { title: "Open Automations", text: "Workspace → Automations lists your workflows and a set of templates.", shot: "automations" },
      { title: "Pick a template", text: "Choose “New lead → notify sales” and select Add.", shot: "automations" },
      { title: "Check trigger, condition and action", text: "The trigger is a lead being created; the action notifies the lead's owner. Add a condition if it should apply only to certain leads.", shot: "automations" },
      { title: "Turn it on and test", text: "Create a test lead and watch the notification arrive. The run history shows what happened and why.", shot: "automations" },
      { title: "Add two more", text: "Add the invoice-paid email to finance and the leave-requested notification to HR.", tip: "Keep a person in the loop for anything that moves money.", shot: "automations" },
    ],
    next: ["first-automations", "automation-basics"],
  },
  {
    slug: "publish-your-website-on-your-domain", title: "Publish your website on your own domain", summary: "Edit your pages, then connect your domain with a secure connection.", minutes: 12, level: "Intermediate", shot: "cms-pages", panel: "cms",
    youWillHave: "Your website live on your domain, secured with SSL.",
    steps: [
      { title: "Review your starter site", text: "Website → Pages lists the pages that are already live. Open one in the builder.", shot: "cms-pages" },
      { title: "Choose and customise a theme", text: "Website → Themes: preview a theme live, activate it and customise colours and fonts.", shot: "cms-theme" },
      { title: "Set up menus, footer and identity", text: "Add your navigation, footer links and your business's contact and social details.", shot: "cms" },
      { title: "Connect your domain", text: "Workspace → Custom domains: add your domain, then add the DNS records shown at your domain provider.", shot: "domains" },
      { title: "Verify and publish", text: "Verify the domain; the secure (HTTPS) certificate is issued automatically. Review any pages waiting and publish.", shot: "cms-pages" },
    ],
    next: ["custom-domain", "publish-website"],
  },
  {
    slug: "get-paid-with-payment-links", title: "Send an invoice and get paid online", summary: "Create an invoice with a payment link and watch your accounts update themselves.", minutes: 8, level: "Intermediate", shot: "fms", panel: "fms",
    youWillHave: "An invoice sent, paid online and posted — without re-entering anything.",
    steps: [
      { title: "Connect your payment account", text: "Workspace → Payment account connects your own gateway so payments come to you.", shot: "fms" },
      { title: "Open SelfRun CashFlow AI", text: "The dashboard shows revenue, expenses and bank balances.", shot: "fms" },
      { title: "Create the invoice", text: "SelfRun CashFlow AI → Invoices: choose the customer, add lines and save.", shot: "fms-invoices" },
      { title: "Send it with a payment link", text: "Send the invoice with its payment link so the customer can pay online.", shot: "fms-invoices" },
      { title: "Watch it settle", text: "When it is paid, the receipt, the ledger and your finance team's notification happen on their own.", shot: "fms" },
    ],
    next: ["invoices-and-payments", "first-automations"],
  },
  {
    slug: "run-your-first-payroll", title: "Run your first payroll", summary: "Check attendance and leave, run the month, and pay — posting to SelfRun CashFlow AI.", minutes: 10, level: "Intermediate", shot: "hrms-payroll", panel: "hrms",
    youWillHave: "A payroll month completed, with payslips and payouts recorded.",
    steps: [
      { title: "Make sure people are set up", text: "SelfRun TalentOS → Employees holds each person's record, department and salary.", shot: "hrms-employees" },
      { title: "Review attendance and leave", text: "Check the month's attendance and approve pending leave requests before you run payroll.", shot: "hrms" },
      { title: "Run payroll", text: "SelfRun TalentOS → Payroll: run the period and review each payslip.", shot: "hrms-payroll" },
      { title: "Pay salaries", text: "Pay the salaries; the payouts post to SelfRun CashFlow AI automatically.", shot: "hrms-payroll" },
      { title: "Employees see their payslips", text: "Each employee finds their payslip and salary history under My salary.", shot: "hrms" },
    ],
    next: ["run-payroll", "invoices-and-payments"],
  },
  {
    slug: "ask-ai-about-your-business", title: "Ask AI about your business", summary: "Get a verifiable answer from your own records in plain language.", minutes: 4, level: "Beginner", shot: "intelligence", panel: "intelligence",
    youWillHave: "An answer — and the working behind it.",
    steps: [
      { title: "Open SelfRun DataBrain AI", text: "Start a new conversation; suggested questions show what is possible.", shot: "intelligence" },
      { title: "Ask in plain language", text: "For example: “Which invoices are more than 30 days overdue?” or “How many leads did we get last month, by source?”", shot: "intelligence" },
      { title: "Read the answer", text: "You get text, a table or a chart.", shot: "intelligence" },
      { title: "Check the working", text: "Open “How this was calculated” to see the records used and the filters applied.", tip: "The AI only uses data you are allowed to see, and it runs read-only queries, so it cannot change anything.", shot: "intelligence" },
    ],
    next: ["ask-your-business", "ai-assistants"],
  },
  {
    slug: "launch-your-own-app", title: "Launch your own app for phones and desktops", summary: "Install your workspace as an app, then generate store and desktop versions.", minutes: 8, level: "Intermediate", shot: "apps", panel: "workspace",
    youWillHave: "Your team using an app with your name and icon.",
    steps: [
      { title: "Open Apps & downloads", text: "Workspace → Apps & downloads shows the installable app, mobile apps and desktop app.", shot: "apps" },
      { title: "Install the PWA", text: "Open the address on a phone or computer and install it — or scan the QR code on the screen.", shot: "apps" },
      { title: "Get the Android and iOS apps", text: "Download the Android package and project; for iOS, open the Xcode project, sign it with your Apple Developer team and submit.", shot: "apps" },
      { title: "Download the desktop app", text: "Pick the installer for Windows, macOS or Linux.", shot: "apps" },
      { title: "Switch on push notifications", text: "Allow notifications on each device so reminders and approvals reach people immediately.", shot: "cms-push" },
    ],
    next: ["your-own-apps", "brand-your-workspace"],
  },
];

export const tutorialBySlug = (slug: string) => TUTORIALS.find((t) => t.slug === slug);
