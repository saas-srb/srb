/**
 * Designations: the jobs people hold in a company ("Director", "HR Manager", "Accountant" …). A designation is a bundle of product roles, so
 * giving someone a designation gives them the right access in EVERY product at once, the way the job needs it. Pure and client-safe.
 *
 * The Director is the company's top role (full access to everything, can change anyone's status). Every other designation below is created
 * for each company the first time it is needed, as a normal custom role the Director can rename, edit, extend with exact permissions, or
 * leave alone. A company can add designations of its own (Roles & permissions → Designations).
 */

export const DIRECTOR_TITLE = "Director";
/** The stored role literal behind the Director designation (the same literal every product's access check already knows). */
export const DIRECTOR_ROLE = "super_admin";

export interface DesignationTemplate {
  /** Stable key; seeded designations are recognised by it even if the Director renames them. */
  key: string;
  title: string;
  /** Which part of the business it belongs to (used to group the list and as the default department of the HR record). */
  department: string;
  description: string;
  /** The product roles it includes (never the Director role). */
  roles: string[];
}

const EVERYONE = ["employee", "chat_employee", "sop_employee", "workspace_member"];

const CORE_TEMPLATES: DesignationTemplate[] = [
  // ── Leadership
  { key: "general-manager", title: "General Manager", department: "Management", description: "Runs the whole business day to day: people, projects, sales, money, training and documents. Cannot change company settings or billing.",
    roles: ["workspace_admin", "hr", "manager", "employee", "pms_manager", "procurement_manager", "finance_manager", "lms_manager", "tms_manager", "sop_manager", "dlms_manager", "lpms_manager", "ots_manager", "chat_admin", "intelligence_user"] },
  { key: "operations-manager", title: "Operations Manager", department: "Operations & Admin", description: "Day-to-day operations: department work, purchases, documents and procedures.",
    roles: ["dept_manager", "manager", "pms_manager", "procurement_manager", "sop_manager", "dlms_manager", ...EVERYONE] },
  // ── People
  { key: "hr-manager", title: "HR Manager", department: "Human Resources", description: "People, attendance, leave, payroll, hiring tests and policies.",
    roles: ["hr", "employee", "chat_hr", "sop_manager", "ots_manager", "lpms_manager", "workspace_member"] },
  { key: "hr-executive", title: "HR Executive", department: "Human Resources", description: "Day-to-day HR work: employee records, attendance and leave.",
    roles: ["hr", "employee", "chat_hr", "sop_employee", "workspace_member"] },
  { key: "recruiter", title: "Recruiter / Talent Acquisition", department: "Human Resources", description: "Hiring: tests for candidates and the team's documents. No payroll.",
    roles: ["employee", "chat_employee", "sop_employee", "ots_author", "ots_evaluator", "workspace_member"] },
  // ── Delivery
  { key: "project-manager", title: "Project Manager", department: "Project Delivery", description: "Projects, tasks, timesheets and the delivery team.",
    roles: ["pms_manager", "manager", "employee", "chat_pm", "sop_employee", "dlms_manager", "workspace_member"] },
  { key: "team-lead", title: "Team Lead", department: "Engineering", description: "Leads a team: their reports, tasks and timesheets.",
    roles: ["manager", "pms_manager", "employee", "chat_employee", "sop_employee", "workspace_member"] },
  { key: "team-member", title: "Team Member", department: "Engineering", description: "Their own tasks, timesheets, leave, chat and company documents.",
    roles: ["pms_employee", "employee", "chat_employee", "sop_employee", "prms_employee", "dlms_employee", "workspace_member"] },
  // ── Sales
  { key: "sales-manager", title: "Sales Manager", department: "Sales & Business Development", description: "Leads, the pipeline, campaigns and the sales team.",
    roles: ["lms_manager", "intelligence_user", ...EVERYONE] },
  { key: "sales-executive", title: "Sales Executive", department: "Sales & Business Development", description: "Their own leads and follow-ups.",
    roles: ["lms_agent", ...EVERYONE] },
  // ── Finance
  { key: "finance-manager", title: "Finance Manager", department: "Finance & Accounts", description: "Invoices, payments, expenses, budgets and procurement approvals.",
    roles: ["finance_manager", "finance", "prms_employee", "intelligence_user", ...EVERYONE] },
  { key: "accountant", title: "Accountant", department: "Finance & Accounts", description: "Transactions and the chart of accounts. No approval authority.",
    roles: ["accountant", "finance_executive", ...EVERYONE] },
  { key: "accounts-executive", title: "Accounts Executive", department: "Finance & Accounts", description: "Customer invoices and receipts, vendor bills and payments.",
    roles: ["accounts_receivable", "accounts_payable", ...EVERYONE] },
  { key: "payroll-executive", title: "Payroll Executive", department: "Finance & Accounts", description: "Payroll-related transactions.",
    roles: ["payroll_accountant", ...EVERYONE] },
  { key: "auditor", title: "Auditor", department: "Finance & Accounts", description: "Read-only access to every financial record and the audit trail.",
    roles: ["auditor", "employee", "workspace_member"] },
  { key: "procurement-manager", title: "Procurement Manager", department: "Operations & Admin", description: "Vendors, requisitions, purchase orders, assets and inventory.",
    roles: ["procurement_manager", "dept_manager", ...EVERYONE] },
  // ── Marketing
  { key: "marketing-manager", title: "Marketing Manager", department: "Marketing", description: "Social media, search visibility and the website.",
    roles: ["smms_manager", "seo_manager", "cms_editor", ...EVERYONE] },
  { key: "marketing-executive", title: "Marketing Executive", department: "Marketing", description: "Posts, content and search work. Cannot publish without approval.",
    roles: ["smms_employee", "seo_employee", "cms_editor", ...EVERYONE] },
  { key: "seo-specialist", title: "SEO Specialist", department: "Marketing", description: "Technical and on-page search work, rankings and backlinks.",
    roles: ["seo_specialist", "cms_viewer", ...EVERYONE] },
  { key: "social-media-manager", title: "Social Media Manager", department: "Marketing", description: "Runs the social media team: campaigns, publishing and approvals.",
    roles: ["smms_manager", ...EVERYONE] },
  { key: "content-writer", title: "Content Writer", department: "Marketing", description: "Writes pages and posts for the website and social media.",
    roles: ["cms_editor", "smms_employee", ...EVERYONE] },
  // ── Training
  { key: "training-head", title: "Training Head", department: "Training & Mentorship", description: "Programs, batches, students, certificates and tests.",
    roles: ["tms_manager", "ots_manager", "mentor", ...EVERYONE] },
  { key: "trainer", title: "Trainer / Mentor", department: "Training & Mentorship", description: "Delivers assigned batches: classes, assignments, tests and reviews.",
    roles: ["mentor", "ots_author", "ots_evaluator", ...EVERYONE] },
  // ── Legal, IT, data
  { key: "legal-manager", title: "Legal & Compliance Manager", department: "Operations & Admin", description: "Contracts, legal documents, policies and the document vault.",
    roles: ["lpms_manager", "sop_manager", "dlms_manager", ...EVERYONE] },
  { key: "it-administrator", title: "IT Administrator", department: "Operations & Admin", description: "The document vault, AI assistants and the website.",
    roles: ["dlms_manager", "aibots_admin", "cms_admin", ...EVERYONE] },
  { key: "data-ai-specialist", title: "Data & AI Specialist", department: "Data & AI", description: "Business questions in plain language and AI assistants.",
    roles: ["intelligence_user", "aibots_manager", ...EVERYONE] },
  // ── Others
  { key: "executive-assistant", title: "Executive Assistant", department: "Management", description: "Everyday tools: chat, procedures and their own HR self-service.",
    roles: [...EVERYONE] },
  { key: "intern", title: "Intern", department: "Engineering", description: "Basic access for someone learning: their own tasks, chat and procedures.",
    roles: ["pms_employee", ...EVERYONE] },
  { key: "contractor", title: "Contractor / Freelancer", department: "Engineering", description: "Only their assigned projects and chat. No HR self-service.",
    roles: ["pms_employee", "chat_employee", "sop_employee", "workspace_member"] },
  { key: "viewer", title: "Viewer (read only)", department: "Management", description: "Can look at the shared dashboards, documents and records. Cannot change anything.",
    roles: ["workspace_member", "finance_read_only", "cms_viewer", "lpms_viewer", "sop_employee"] },

  // ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // More designations, by part of the business. Titles are the ones people actually hold; the roles are the access the job needs.
  // ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  // ── Executive leadership (broad access, but not the Director's control of people and company settings)
  { key: "ceo", title: "Chief Executive Officer (CEO)", department: "Management", description: "Runs the company: sees every function and reports. Company settings and people's status stay with the Director.",
    roles: ["workspace_admin", "hr", "manager", "employee", "pms_manager", "procurement_manager", "finance_manager", "lms_manager", "tms_manager", "sop_manager", "dlms_manager", "lpms_manager", "ots_manager", "smms_manager", "seo_manager", "cms_editor", "chat_admin", "intelligence_admin"] },
  { key: "coo", title: "Chief Operating Officer (COO)", department: "Management", description: "Operations across projects, people, purchases, documents and procedures.",
    roles: ["workspace_admin", "hr", "manager", "employee", "pms_manager", "procurement_manager", "dept_manager", "sop_manager", "dlms_manager", "lpms_manager", "chat_admin", "intelligence_admin"] },
  { key: "cfo", title: "Chief Financial Officer (CFO)", department: "Finance & Accounts", description: "All finance: accounts, payments, budgets, procurement approvals and financial reports.",
    roles: ["fms_admin", "finance_manager", "finance", "procurement_manager", "prms_employee", "intelligence_admin", "auditor", ...EVERYONE] },
  { key: "cto", title: "Chief Technology Officer (CTO)", department: "Engineering", description: "Engineering and technology: projects, the team, the document vault, AI assistants and the website.",
    roles: ["pms_admin", "manager", "dlms_manager", "aibots_admin", "cms_admin", "seo_manager", "intelligence_user", "prms_employee", ...EVERYONE] },
  { key: "cmo", title: "Chief Marketing Officer (CMO)", department: "Marketing", description: "All marketing: social media, search, the website and campaigns.",
    roles: ["smms_admin", "seo_admin", "cms_admin", "lms_manager", "intelligence_user", ...EVERYONE] },
  { key: "chro", title: "Chief People Officer (CHRO)", department: "Human Resources", description: "All people work: HR, payroll, hiring, training and policies.",
    roles: ["hr", "manager", "chat_hr", "sop_admin", "ots_admin", "tms_manager", "lpms_manager", "intelligence_user", ...EVERYONE] },
  { key: "vice-president", title: "Vice President", department: "Management", description: "Leads a business unit: their people, projects and sales.",
    roles: ["manager", "pms_manager", "lms_manager", "dept_manager", "sop_manager", "intelligence_user", ...EVERYONE] },
  { key: "head-of-department", title: "Head of Department", department: "Management", description: "Leads a department: their reporting line, department requests and procedures.",
    roles: ["manager", "dept_manager", "pms_manager", "sop_manager", "dlms_manager", ...EVERYONE] },
  { key: "manager", title: "Manager", department: "Management", description: "Manages a team: their reporting line, approvals and department requests.",
    roles: ["manager", "dept_manager", "chat_pm", "sop_employee", "employee", "chat_employee", "workspace_member"] },
  { key: "assistant-manager", title: "Assistant Manager", department: "Management", description: "Supports a manager: their team's records and requests.",
    roles: ["manager", "dept_manager", ...EVERYONE] },
  { key: "business-head", title: "Business Head", department: "Management", description: "Runs a line of business: sales, delivery, money and people for it.",
    roles: ["workspace_admin", "manager", "lms_manager", "pms_manager", "finance_manager", "dept_manager", "sop_manager", "intelligence_user", ...EVERYONE] },

  // ── Engineering
  { key: "engineering-manager", title: "Engineering Manager", department: "Engineering", description: "Leads engineers: delivery, timesheets, reviews and the team's documents.",
    roles: ["pms_manager", "manager", "dlms_manager", "sop_manager", "prms_employee", ...EVERYONE] },
  { key: "tech-lead", title: "Tech Lead", department: "Engineering", description: "Leads a technical team: tasks, timesheets and their reports.",
    roles: ["pms_manager", "manager", "dlms_employee", "prms_employee", ...EVERYONE] },
  { key: "software-architect", title: "Software Architect", department: "Engineering", description: "Designs the systems: projects, documentation and the document vault.",
    roles: ["pms_employee", "dlms_manager", "sop_author", "prms_employee", ...EVERYONE] },
  { key: "principal-engineer", title: "Principal Engineer", department: "Engineering", description: "Senior technical expert across projects.",
    roles: ["pms_employee", "dlms_employee", "sop_author", "prms_employee", ...EVERYONE] },
  { key: "senior-software-engineer", title: "Senior Software Engineer", department: "Engineering", description: "Builds and reviews software: their tasks, timesheets and documentation.",
    roles: ["pms_employee", "dlms_employee", "sop_author", "prms_employee", ...EVERYONE] },
  { key: "software-engineer", title: "Software Engineer", department: "Engineering", description: "Builds software: their tasks, timesheets, leave and chat.",
    roles: ["pms_employee", "dlms_employee", "prms_employee", ...EVERYONE] },
  { key: "junior-software-engineer", title: "Junior Software Engineer", department: "Engineering", description: "Learns on the job: their tasks, timesheets and chat.",
    roles: ["pms_employee", "prms_employee", ...EVERYONE] },
  { key: "software-engineer-trainee", title: "Software Engineer Trainee", department: "Engineering", description: "New graduate in training: their tasks and chat.",
    roles: ["pms_employee", ...EVERYONE] },
  { key: "frontend-developer", title: "Frontend Developer", department: "Engineering", description: "Builds what users see: their tasks and timesheets.",
    roles: ["pms_employee", "dlms_employee", "prms_employee", ...EVERYONE] },
  { key: "backend-developer", title: "Backend Developer", department: "Engineering", description: "Builds the server side: their tasks and timesheets.",
    roles: ["pms_employee", "dlms_employee", "prms_employee", ...EVERYONE] },
  { key: "full-stack-developer", title: "Full Stack Developer", department: "Engineering", description: "Builds both sides: their tasks and timesheets.",
    roles: ["pms_employee", "dlms_employee", "prms_employee", ...EVERYONE] },
  { key: "mobile-app-developer", title: "Mobile App Developer", department: "Engineering", description: "Builds phone apps: their tasks and timesheets.",
    roles: ["pms_employee", "dlms_employee", "prms_employee", ...EVERYONE] },
  { key: "web-developer", title: "Web Developer", department: "Engineering", description: "Builds websites: their tasks, and the website editor.",
    roles: ["pms_employee", "cms_editor", ...EVERYONE] },
  { key: "devops-engineer", title: "DevOps Engineer", department: "Engineering", description: "Runs builds and servers: their tasks and the document vault.",
    roles: ["pms_employee", "dlms_manager", "prms_employee", ...EVERYONE] },
  { key: "cloud-engineer", title: "Cloud Engineer", department: "Engineering", description: "Runs cloud systems: their tasks and the document vault.",
    roles: ["pms_employee", "dlms_manager", "prms_employee", ...EVERYONE] },
  { key: "site-reliability-engineer", title: "Site Reliability Engineer", department: "Engineering", description: "Keeps systems running: their tasks and the document vault.",
    roles: ["pms_employee", "dlms_employee", ...EVERYONE] },
  { key: "security-engineer", title: "Security Engineer", department: "Engineering", description: "Protects systems: the document vault, procedures and audit records.",
    roles: ["pms_employee", "dlms_manager", "sop_author", "auditor", ...EVERYONE] },
  { key: "embedded-engineer", title: "Embedded Systems Engineer", department: "Engineering", description: "Builds device software: their tasks and timesheets.",
    roles: ["pms_employee", "prms_employee", ...EVERYONE] },
  { key: "blockchain-developer", title: "Blockchain Developer", department: "Engineering", description: "Builds blockchain software: their tasks and timesheets.",
    roles: ["pms_employee", ...EVERYONE] },
  { key: "game-developer", title: "Game Developer", department: "Engineering", description: "Builds games: their tasks and timesheets.",
    roles: ["pms_employee", ...EVERYONE] },
  { key: "technical-support-engineer", title: "Technical Support Engineer", department: "Engineering", description: "Fixes customers' technical problems: their tasks, chat and the knowledge documents.",
    roles: ["pms_employee", "lms_agent", "sop_author", ...EVERYONE] },
  { key: "solutions-architect", title: "Solutions Architect", department: "Engineering", description: "Designs solutions for customers: projects, leads and documents.",
    roles: ["pms_employee", "lms_agent", "dlms_employee", "sop_author", ...EVERYONE] },
  { key: "systems-administrator", title: "Systems Administrator", department: "Engineering", description: "Looks after company systems: the document vault and AI assistants.",
    roles: ["dlms_manager", "aibots_manager", "pms_employee", ...EVERYONE] },
  { key: "network-engineer", title: "Network Engineer", department: "Engineering", description: "Looks after networks: their tasks and the document vault.",
    roles: ["dlms_employee", "pms_employee", ...EVERYONE] },
  { key: "database-administrator", title: "Database Administrator", department: "Engineering", description: "Looks after databases: their tasks and the document vault.",
    roles: ["dlms_manager", "pms_employee", ...EVERYONE] },

  // ── Quality assurance
  { key: "qa-manager", title: "QA Manager", department: "Quality Assurance", description: "Leads quality: projects, the QA team, test results and procedures.",
    roles: ["pms_manager", "manager", "sop_manager", "dlms_employee", ...EVERYONE] },
  { key: "qa-lead", title: "QA Lead", department: "Quality Assurance", description: "Leads testers: their tasks, timesheets and reports.",
    roles: ["pms_manager", "manager", "sop_author", ...EVERYONE] },
  { key: "qa-engineer", title: "QA Engineer", department: "Quality Assurance", description: "Tests software: their tasks and timesheets.",
    roles: ["pms_employee", "sop_author", ...EVERYONE] },
  { key: "automation-test-engineer", title: "Automation Test Engineer", department: "Quality Assurance", description: "Builds automated tests: their tasks and timesheets.",
    roles: ["pms_employee", "sop_author", ...EVERYONE] },
  { key: "manual-tester", title: "Manual Tester", department: "Quality Assurance", description: "Tests by hand: their tasks and timesheets.",
    roles: ["pms_employee", ...EVERYONE] },
  { key: "performance-test-engineer", title: "Performance Test Engineer", department: "Quality Assurance", description: "Tests speed and load: their tasks and timesheets.",
    roles: ["pms_employee", ...EVERYONE] },

  // ── Product and design
  { key: "product-manager", title: "Product Manager", department: "Product", description: "Owns a product: projects, roadmap documents, leads and business questions.",
    roles: ["pms_manager", "manager", "sop_author", "lms_agent", "intelligence_user", ...EVERYONE] },
  { key: "senior-product-manager", title: "Senior Product Manager", department: "Product", description: "Owns several products: projects, documents, leads and business questions.",
    roles: ["pms_manager", "manager", "sop_author", "lms_agent", "intelligence_user", ...EVERYONE] },
  { key: "product-owner", title: "Product Owner", department: "Product", description: "Decides what the team builds: projects and tasks.",
    roles: ["pms_manager", "sop_author", ...EVERYONE] },
  { key: "business-analyst", title: "Business Analyst", department: "Product", description: "Studies the business and writes requirements: projects, documents and business questions.",
    roles: ["pms_employee", "sop_author", "intelligence_user", ...EVERYONE] },
  { key: "scrum-master", title: "Scrum Master", department: "Project Delivery", description: "Runs the team's process: tasks, timesheets and their reports.",
    roles: ["pms_manager", "manager", ...EVERYONE] },
  { key: "delivery-manager", title: "Delivery Manager", department: "Project Delivery", description: "Responsible for projects reaching clients on time and in budget.",
    roles: ["pms_manager", "manager", "dlms_manager", "sop_manager", "intelligence_user", ...EVERYONE] },
  { key: "program-manager", title: "Program Manager", department: "Project Delivery", description: "Runs a group of related projects.",
    roles: ["pms_manager", "manager", "sop_manager", "intelligence_user", ...EVERYONE] },
  { key: "project-coordinator", title: "Project Coordinator", department: "Project Delivery", description: "Keeps projects organised: tasks, timesheets and documents.",
    roles: ["pms_employee", "sop_author", ...EVERYONE] },
  { key: "ui-ux-designer", title: "UI/UX Designer", department: "Design", description: "Designs how products look and work: their tasks and timesheets.",
    roles: ["pms_employee", "cms_editor", ...EVERYONE] },
  { key: "senior-designer", title: "Senior Designer", department: "Design", description: "Leads design work: their tasks, timesheets and the website editor.",
    roles: ["pms_employee", "cms_editor", ...EVERYONE] },
  { key: "graphic-designer", title: "Graphic Designer", department: "Design", description: "Makes graphics: their tasks, social posts and the website editor.",
    roles: ["pms_employee", "cms_editor", "smms_employee", ...EVERYONE] },
  { key: "ux-researcher", title: "UX Researcher", department: "Design", description: "Researches users: their tasks and business questions.",
    roles: ["pms_employee", "intelligence_user", ...EVERYONE] },
  { key: "design-lead", title: "Design Lead", department: "Design", description: "Leads designers: their tasks, timesheets and reports.",
    roles: ["pms_manager", "manager", "cms_editor", ...EVERYONE] },
  { key: "motion-designer", title: "Motion Graphics Designer", department: "Design", description: "Makes animations and video graphics for the website and social media.",
    roles: ["pms_employee", "cms_editor", "smms_employee", ...EVERYONE] },
  { key: "video-editor", title: "Video Editor", department: "Design", description: "Edits videos for the website and social media.",
    roles: ["cms_editor", "smms_employee", ...EVERYONE] },

  // ── Data and AI
  { key: "data-analyst", title: "Data Analyst", department: "Data & AI", description: "Answers business questions from the data.",
    roles: ["intelligence_user", "pms_employee", ...EVERYONE] },
  { key: "business-intelligence-analyst", title: "Business Intelligence Analyst", department: "Data & AI", description: "Builds reports and dashboards from business data.",
    roles: ["intelligence_user", ...EVERYONE] },
  { key: "data-scientist", title: "Data Scientist", department: "Data & AI", description: "Builds models from data: business questions, AI assistants and tasks.",
    roles: ["intelligence_user", "aibots_manager", "pms_employee", ...EVERYONE] },
  { key: "machine-learning-engineer", title: "Machine Learning Engineer", department: "Data & AI", description: "Builds and runs ML systems: AI assistants and tasks.",
    roles: ["aibots_manager", "intelligence_user", "pms_employee", ...EVERYONE] },
  { key: "ai-engineer", title: "AI Engineer", department: "Data & AI", description: "Builds AI features and assistants.",
    roles: ["aibots_admin", "intelligence_user", "pms_employee", ...EVERYONE] },
  { key: "data-engineer", title: "Data Engineer", department: "Data & AI", description: "Builds the data pipelines: tasks and the document vault.",
    roles: ["intelligence_user", "dlms_employee", "pms_employee", ...EVERYONE] },
  { key: "data-science-lead", title: "Data Science Lead", department: "Data & AI", description: "Leads the data team: business questions, AI assistants and reports.",
    roles: ["intelligence_admin", "aibots_admin", "pms_manager", "manager", ...EVERYONE] },
  { key: "prompt-engineer", title: "Prompt Engineer", department: "Data & AI", description: "Designs how AI assistants answer.",
    roles: ["aibots_manager", ...EVERYONE] },

  // ── Sales and customers
  { key: "head-of-sales", title: "Head of Sales", department: "Sales & Business Development", description: "Leads all sales: leads, the pipeline, campaigns and the team.",
    roles: ["lms_admin", "intelligence_user", "manager", ...EVERYONE] },
  { key: "business-development-manager", title: "Business Development Manager", department: "Sales & Business Development", description: "Finds new business: leads, the pipeline and campaigns.",
    roles: ["lms_manager", "intelligence_user", ...EVERYONE] },
  { key: "business-development-executive", title: "Business Development Executive", department: "Sales & Business Development", description: "Reaches out to new customers: their leads and follow-ups.",
    roles: ["lms_agent", ...EVERYONE] },
  { key: "inside-sales-representative", title: "Inside Sales Representative", department: "Sales & Business Development", description: "Sells by phone and email: their leads and follow-ups.",
    roles: ["lms_agent", ...EVERYONE] },
  { key: "account-manager", title: "Account Manager", department: "Sales & Business Development", description: "Looks after existing clients: their leads, projects and documents.",
    roles: ["lms_manager", "pms_employee", "dlms_employee", ...EVERYONE] },
  { key: "key-account-manager", title: "Key Account Manager", department: "Sales & Business Development", description: "Looks after the biggest clients.",
    roles: ["lms_manager", "pms_employee", "dlms_employee", "intelligence_user", ...EVERYONE] },
  { key: "pre-sales-consultant", title: "Pre-sales Consultant", department: "Sales & Business Development", description: "Helps win deals: leads, proposals and project knowledge.",
    roles: ["lms_agent", "pms_employee", "sop_author", ...EVERYONE] },
  { key: "sales-operations-manager", title: "Sales Operations Manager", department: "Sales & Business Development", description: "Keeps the sales machine running: pipeline, campaigns and reports.",
    roles: ["lms_manager", "intelligence_user", "sop_author", ...EVERYONE] },
  { key: "regional-sales-manager", title: "Regional Sales Manager", department: "Sales & Business Development", description: "Leads sales for a region.",
    roles: ["lms_manager", "manager", ...EVERYONE] },
  { key: "channel-partner-manager", title: "Channel Partner Manager", department: "Sales & Business Development", description: "Manages resellers and partners: leads and the partner portal.",
    roles: ["lms_manager", "portal_manager", ...EVERYONE] },
  { key: "telecaller", title: "Telecaller", department: "Sales & Business Development", description: "Calls leads: their leads and follow-ups.",
    roles: ["lms_agent", "employee", "chat_employee", "workspace_member"] },
  { key: "customer-success-manager", title: "Customer Success Manager", department: "Customer Support", description: "Makes sure clients succeed: their leads, projects and the client portal.",
    roles: ["lms_manager", "portal_manager", "pms_employee", ...EVERYONE] },
  { key: "customer-support-manager", title: "Customer Support Manager", department: "Customer Support", description: "Leads support: the team, leads and the client portal.",
    roles: ["lms_manager", "portal_manager", "manager", "sop_manager", ...EVERYONE] },
  { key: "customer-support-executive", title: "Customer Support Executive", department: "Customer Support", description: "Helps customers: their conversations and the client portal.",
    roles: ["lms_agent", "portal_manager", "sop_employee", "employee", "chat_employee", "workspace_member"] },
  { key: "support-team-lead", title: "Support Team Lead", department: "Customer Support", description: "Leads support agents: their reports and the client portal.",
    roles: ["lms_manager", "portal_manager", "manager", ...EVERYONE] },
  { key: "client-onboarding-specialist", title: "Client Onboarding Specialist", department: "Customer Support", description: "Sets new clients up: leads, projects and the client portal.",
    roles: ["lms_agent", "portal_manager", "pms_employee", ...EVERYONE] },
  { key: "community-manager", title: "Community Manager", department: "Customer Support", description: "Looks after the community on social media.",
    roles: ["smms_specialist", ...EVERYONE] },

  // ── Marketing
  { key: "digital-marketing-manager", title: "Digital Marketing Manager", department: "Marketing", description: "Online marketing: social media, search and the website.",
    roles: ["smms_manager", "seo_manager", "cms_editor", "intelligence_user", ...EVERYONE] },
  { key: "digital-marketing-executive", title: "Digital Marketing Executive", department: "Marketing", description: "Runs online campaigns: posts, search work and website content.",
    roles: ["smms_specialist", "seo_employee", "cms_editor", ...EVERYONE] },
  { key: "performance-marketing-specialist", title: "Performance Marketing Specialist", department: "Marketing", description: "Paid campaigns and their results.",
    roles: ["smms_specialist", "lms_agent", "intelligence_user", ...EVERYONE] },
  { key: "content-strategist", title: "Content Strategist", department: "Marketing", description: "Plans what is published: the website, social media and search.",
    roles: ["cms_editor", "smms_manager", "seo_specialist", ...EVERYONE] },
  { key: "copywriter", title: "Copywriter", department: "Marketing", description: "Writes copy for the website and social media.",
    roles: ["cms_editor", "smms_employee", ...EVERYONE] },
  { key: "technical-writer", title: "Technical Writer", department: "Marketing", description: "Writes documentation and help articles.",
    roles: ["cms_editor", "sop_author", ...EVERYONE] },
  { key: "social-media-executive", title: "Social Media Executive", department: "Marketing", description: "Creates and schedules social posts.",
    roles: ["smms_specialist", ...EVERYONE] },
  { key: "email-marketing-specialist", title: "Email Marketing Specialist", department: "Marketing", description: "Email campaigns and their results.",
    roles: ["smms_specialist", "lms_agent", ...EVERYONE] },
  { key: "brand-manager", title: "Brand Manager", department: "Marketing", description: "Looks after the brand across the website and social media.",
    roles: ["smms_manager", "cms_editor", "seo_employee", ...EVERYONE] },
  { key: "public-relations-manager", title: "Public Relations Manager", department: "Marketing", description: "Looks after the company's public image.",
    roles: ["smms_manager", "cms_editor", ...EVERYONE] },
  { key: "seo-manager", title: "SEO Manager", department: "Marketing", description: "Leads search work: rankings, audits and the website.",
    roles: ["seo_manager", "cms_editor", ...EVERYONE] },
  { key: "seo-executive", title: "SEO Executive", department: "Marketing", description: "Search work: keywords, audits and issues.",
    roles: ["seo_employee", "cms_viewer", ...EVERYONE] },
  { key: "website-manager", title: "Website Manager", department: "Marketing", description: "Looks after the public website: pages, menus, media and publishing.",
    roles: ["cms_admin", "seo_employee", ...EVERYONE] },
  { key: "growth-manager", title: "Growth Manager", department: "Marketing", description: "Grows sign-ups and sales: campaigns, search and business questions.",
    roles: ["smms_manager", "seo_manager", "lms_manager", "intelligence_user", ...EVERYONE] },
  { key: "market-research-analyst", title: "Market Research Analyst", department: "Marketing", description: "Studies the market: business questions and search data.",
    roles: ["intelligence_user", "seo_employee", ...EVERYONE] },

  // ── Human resources
  { key: "hr-business-partner", title: "HR Business Partner", department: "Human Resources", description: "Works with departments on people matters.",
    roles: ["hr", "chat_hr", "sop_employee", "employee", "workspace_member"] },
  { key: "talent-acquisition-specialist", title: "Talent Acquisition Specialist", department: "Human Resources", description: "Finds and hires people: recruitment and hiring tests.",
    roles: ["hr", "ots_manager", "chat_hr", "employee", "sop_employee", "workspace_member"] },
  { key: "talent-acquisition-manager", title: "Talent Acquisition Manager", department: "Human Resources", description: "Leads hiring: recruitment, offers and hiring tests.",
    roles: ["hr", "ots_manager", "manager", "chat_hr", "sop_manager", "employee", "workspace_member"] },
  { key: "learning-development-manager", title: "Learning & Development Manager", department: "Human Resources", description: "Plans staff training: programs, tests and certificates.",
    roles: ["tms_manager", "ots_manager", "hr", "chat_hr", ...EVERYONE] },
  { key: "compensation-benefits-manager", title: "Compensation & Benefits Manager", department: "Human Resources", description: "Pay, benefits and payroll.",
    roles: ["hr", "payroll_accountant", "chat_hr", ...EVERYONE] },
  { key: "hr-operations-manager", title: "HR Operations Manager", department: "Human Resources", description: "Runs HR processes: records, attendance, leave and payroll.",
    roles: ["hr", "manager", "chat_hr", "sop_manager", ...EVERYONE] },
  { key: "employee-relations-manager", title: "Employee Relations Manager", department: "Human Resources", description: "Handles people issues and policies.",
    roles: ["hr", "chat_hr", "sop_manager", "lpms_author", ...EVERYONE] },
  { key: "hr-generalist", title: "HR Generalist", department: "Human Resources", description: "All-round HR work: records, attendance, leave and payroll.",
    roles: ["hr", "chat_hr", ...EVERYONE] },
  { key: "hr-intern", title: "HR Intern", department: "Human Resources", description: "Helps the HR team: limited access.",
    roles: ["employee", "chat_employee", "sop_employee", "workspace_member"] },

  // ── Finance and accounts
  { key: "finance-controller", title: "Finance Controller", department: "Finance & Accounts", description: "Controls the books: accounts, approvals and reports.",
    roles: ["fms_admin", "finance_manager", "finance", "auditor", ...EVERYONE] },
  { key: "accounts-manager", title: "Accounts Manager", department: "Finance & Accounts", description: "Leads the accounts team: transactions, receivables and payables.",
    roles: ["finance_manager", "accountant", "accounts_receivable", "accounts_payable", ...EVERYONE] },
  { key: "senior-accountant", title: "Senior Accountant", department: "Finance & Accounts", description: "Transactions, the chart of accounts and reconciliation.",
    roles: ["accountant", "finance_executive", "accounts_receivable", "accounts_payable", ...EVERYONE] },
  { key: "junior-accountant", title: "Junior Accountant", department: "Finance & Accounts", description: "Day-to-day entries.",
    roles: ["finance_executive", ...EVERYONE] },
  { key: "accounts-receivable-executive", title: "Accounts Receivable Executive", department: "Finance & Accounts", description: "Customer invoices, receipts and collections.",
    roles: ["accounts_receivable", ...EVERYONE] },
  { key: "accounts-payable-executive", title: "Accounts Payable Executive", department: "Finance & Accounts", description: "Vendor bills and payments.",
    roles: ["accounts_payable", ...EVERYONE] },
  { key: "billing-executive", title: "Billing Executive", department: "Finance & Accounts", description: "Raises invoices and payment links.",
    roles: ["accounts_receivable", "finance_executive", ...EVERYONE] },
  { key: "collections-executive", title: "Collections Executive", department: "Finance & Accounts", description: "Follows up on unpaid invoices.",
    roles: ["accounts_receivable", ...EVERYONE] },
  { key: "tax-compliance-manager", title: "Tax & Compliance Manager", department: "Finance & Accounts", description: "Taxes, filings and financial compliance.",
    roles: ["finance_manager", "auditor", "lpms_author", ...EVERYONE] },
  { key: "financial-analyst", title: "Financial Analyst", department: "Finance & Accounts", description: "Analyses the numbers: financial records and reports (read only).",
    roles: ["finance_read_only", "intelligence_user", ...EVERYONE] },
  { key: "budget-analyst", title: "Budget Analyst", department: "Finance & Accounts", description: "Plans and tracks budgets.",
    roles: ["finance", "finance_read_only", ...EVERYONE] },
  { key: "internal-auditor", title: "Internal Auditor", department: "Finance & Accounts", description: "Reviews every record and the audit trail (read only).",
    roles: ["auditor", "sop_employee", "employee", "workspace_member"] },
  { key: "treasury-manager", title: "Treasury Manager", department: "Finance & Accounts", description: "Cash, banks and payments.",
    roles: ["finance_manager", "finance", ...EVERYONE] },
  { key: "finance-intern", title: "Finance Intern", department: "Finance & Accounts", description: "Helps the finance team: read-only finance and chat.",
    roles: ["finance_read_only", ...EVERYONE] },

  // ── Operations, procurement and administration
  { key: "operations-executive", title: "Operations Executive", department: "Operations & Admin", description: "Day-to-day operations work.",
    roles: ["dept_manager", ...EVERYONE] },
  { key: "office-administrator", title: "Office Administrator", department: "Operations & Admin", description: "Runs the office: requests, documents and procedures.",
    roles: ["dept_manager", "dlms_employee", "prms_employee", ...EVERYONE] },
  { key: "administrative-assistant", title: "Administrative Assistant", department: "Operations & Admin", description: "Supports the team with paperwork and requests.",
    roles: ["prms_employee", "dlms_employee", ...EVERYONE] },
  { key: "receptionist", title: "Receptionist", department: "Operations & Admin", description: "Front desk: chat and everyday tools.",
    roles: [...EVERYONE] },
  { key: "facilities-manager", title: "Facilities Manager", department: "Operations & Admin", description: "Looks after the premises, assets and purchases for them.",
    roles: ["procurement_manager", "dept_manager", ...EVERYONE] },
  { key: "procurement-officer", title: "Procurement Officer", department: "Operations & Admin", description: "Raises purchase orders and works with vendors.",
    roles: ["procurement_manager", ...EVERYONE] },
  { key: "purchase-executive", title: "Purchase Executive", department: "Operations & Admin", description: "Everyday purchasing: requisitions and orders.",
    roles: ["prms_employee", "dept_manager", ...EVERYONE] },
  { key: "vendor-manager", title: "Vendor Manager", department: "Operations & Admin", description: "Manages vendors and contracts.",
    roles: ["procurement_manager", "lpms_author", ...EVERYONE] },
  { key: "asset-manager", title: "Asset Manager", department: "Operations & Admin", description: "Keeps the asset register and inventory.",
    roles: ["procurement_manager", ...EVERYONE] },
  { key: "logistics-coordinator", title: "Logistics Coordinator", department: "Operations & Admin", description: "Arranges deliveries and supplies.",
    roles: ["prms_employee", "dept_manager", ...EVERYONE] },
  { key: "process-improvement-manager", title: "Process Improvement Manager", department: "Operations & Admin", description: "Improves how work gets done: procedures and reports.",
    roles: ["sop_admin", "intelligence_user", "pms_employee", ...EVERYONE] },
  { key: "document-controller", title: "Document Controller", department: "Operations & Admin", description: "Keeps company documents and procedures in order.",
    roles: ["sop_manager", "dlms_manager", "lpms_author", ...EVERYONE] },
  { key: "executive-secretary", title: "Executive Secretary", department: "Management", description: "Supports senior leaders: everyday tools and shared documents.",
    roles: ["dlms_employee", ...EVERYONE] },
  { key: "data-entry-operator", title: "Data Entry Operator", department: "Operations & Admin", description: "Enters records: everyday tools only.",
    roles: [...EVERYONE] },

  // ── Legal, compliance and security
  { key: "company-secretary", title: "Company Secretary", department: "Legal & Compliance", description: "Company records, agreements and compliance documents.",
    roles: ["lpms_manager", "dlms_manager", "sop_manager", ...EVERYONE] },
  { key: "compliance-officer", title: "Compliance Officer", department: "Legal & Compliance", description: "Makes sure the company follows rules: procedures, policies and the audit trail.",
    roles: ["sop_manager", "lpms_manager", "auditor", ...EVERYONE] },
  { key: "legal-counsel", title: "Legal Counsel", department: "Legal & Compliance", description: "Contracts and legal documents.",
    roles: ["lpms_admin", "dlms_manager", "sop_author", ...EVERYONE] },
  { key: "legal-executive", title: "Legal Executive", department: "Legal & Compliance", description: "Prepares contracts and legal documents.",
    roles: ["lpms_author", "dlms_employee", ...EVERYONE] },
  { key: "contract-manager", title: "Contract Manager", department: "Legal & Compliance", description: "Manages contracts from draft to renewal.",
    roles: ["lpms_manager", "lms_agent", ...EVERYONE] },
  { key: "information-security-officer", title: "Information Security Officer", department: "Legal & Compliance", description: "Protects company information: the document vault, policies and the audit trail.",
    roles: ["dlms_admin", "sop_manager", "auditor", ...EVERYONE] },
  { key: "data-protection-officer", title: "Data Protection Officer", department: "Legal & Compliance", description: "Privacy and data protection: policies, documents and the audit trail.",
    roles: ["sop_manager", "lpms_manager", "dlms_manager", "auditor", ...EVERYONE] },
  { key: "risk-manager", title: "Risk Manager", department: "Legal & Compliance", description: "Finds and tracks risks: procedures, reports and the audit trail.",
    roles: ["sop_manager", "auditor", "intelligence_user", ...EVERYONE] },

  // ── Training and education
  { key: "academic-director", title: "Academic Director", department: "Training & Mentorship", description: "Leads all training: programs, batches, students, certificates and tests.",
    roles: ["tms_admin", "ots_manager", "mentor", "intelligence_user", "manager", ...EVERYONE] },
  { key: "program-manager-training", title: "Training Program Manager", department: "Training & Mentorship", description: "Runs programs and batches: students, classes and certificates.",
    roles: ["tms_manager", "ots_manager", ...EVERYONE] },
  { key: "senior-trainer", title: "Senior Trainer", department: "Training & Mentorship", description: "Delivers training and guides other trainers: batches, tests and reviews.",
    roles: ["mentor", "tms_manager", "ots_author", "ots_evaluator", ...EVERYONE] },
  { key: "instructor", title: "Instructor", department: "Training & Mentorship", description: "Teaches assigned batches: classes, assignments and tests.",
    roles: ["mentor", "ots_author", "ots_evaluator", ...EVERYONE] },
  { key: "curriculum-developer", title: "Curriculum Developer", department: "Training & Mentorship", description: "Designs courses and tests.",
    roles: ["tms_manager", "ots_author", "sop_author", ...EVERYONE] },
  { key: "academic-coordinator", title: "Academic Coordinator", department: "Training & Mentorship", description: "Schedules batches and classes and looks after students.",
    roles: ["tms_manager", "ots_evaluator", ...EVERYONE] },
  { key: "student-counselor", title: "Student Counselor", department: "Training & Mentorship", description: "Guides prospective and current students: leads and the student portal.",
    roles: ["lms_agent", "portal_manager", "tms_manager", ...EVERYONE] },
  { key: "placement-coordinator", title: "Placement Coordinator", department: "Training & Mentorship", description: "Helps students get jobs: students, leads and the applicant portal.",
    roles: ["tms_manager", "lms_agent", "portal_manager", ...EVERYONE] },
  { key: "assessment-coordinator", title: "Assessment Coordinator", department: "Training & Mentorship", description: "Runs tests and exams: questions, assignments and results.",
    roles: ["ots_manager", "ots_evaluator", ...EVERYONE] },
  { key: "exam-evaluator", title: "Exam Evaluator", department: "Training & Mentorship", description: "Marks answers and reads reports.",
    roles: ["ots_evaluator", ...EVERYONE] },
  { key: "teaching-assistant", title: "Teaching Assistant", department: "Training & Mentorship", description: "Helps instructors: batches and assignments.",
    roles: ["mentor", "ots_evaluator", ...EVERYONE] },
  { key: "training-coordinator", title: "Training Coordinator", department: "Training & Mentorship", description: "Organises training sessions and records.",
    roles: ["tms_manager", ...EVERYONE] },
];

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// The long tail: every common title, written compactly. `group` gives a whole set of titles in one part of the business the same bundle of
// roles (they are all normal custom roles afterwards, so the Director can still edit any one of them individually).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

type Item = [key: string, title: string, description: string];
const group = (department: string, roles: string[], items: Item[]): DesignationTemplate[] => items.map(([key, title, description]) => ({ key, title, department, description, roles }));

const DEV = ["pms_employee", "dlms_employee", "prms_employee", ...EVERYONE];
const LEAD = ["pms_manager", "manager", "dlms_employee", "prms_employee", ...EVERYONE];
const ARCH = ["pms_employee", "dlms_manager", "sop_author", "prms_employee", ...EVERYONE];
const EXEC = ["workspace_admin", "hr", "manager", "employee", "pms_manager", "procurement_manager", "finance_manager", "lms_manager", "tms_manager", "sop_manager", "dlms_manager", "lpms_manager", "ots_manager", "smms_manager", "seo_manager", "cms_editor", "chat_admin", "intelligence_admin"];
const OPS_STAFF = ["dept_manager", "prms_employee", ...EVERYONE];
const FIELD = ["employee", "chat_employee", "sop_employee", "workspace_member"];
const SUPPORT = ["lms_agent", "portal_manager", "sop_author", ...EVERYONE];

const EXTRA_TEMPLATES: DesignationTemplate[] = [
  // ── Architects
  ...group("Engineering", ARCH, [
    ["technical-architect", "Technical Architect", "Designs the technical solution for products and projects, and guards its quality."],
    ["solution-architect", "Solution Architect", "Designs end-to-end solutions for customer needs."],
    ["enterprise-architect", "Enterprise Architect", "Plans how all of the company's systems fit together."],
    ["application-architect", "Application Architect", "Designs how applications are built and connected."],
    ["cloud-architect", "Cloud Architect", "Designs cloud systems and their cost and safety."],
    ["data-architect", "Data Architect", "Designs how data is stored, shared and protected."],
    ["security-architect", "Security Architect", "Designs how systems stay secure."],
    ["integration-architect", "Integration Architect", "Designs how systems talk to each other."],
    ["infrastructure-architect", "Infrastructure Architect", "Designs servers, networks and hosting."],
    ["software-architect-lead", "Lead Architect", "Leads the architects and sets technical direction."],
    ["principal-architect", "Principal Architect", "Senior architect across all products."],
    ["domain-architect", "Domain Architect", "Expert architect for one business area."],
    ["ai-architect", "AI Architect", "Designs AI and machine-learning systems."],
    ["mobile-architect", "Mobile Architect", "Designs mobile apps and their back ends."],
    ["devops-architect", "DevOps Architect", "Designs build, release and run pipelines."],
    ["qa-architect", "QA Architect", "Designs the testing approach and tools."],
  ]),

  // ── Developers by technology
  ...group("Engineering", DEV, [
    ["java-developer", "Java Developer", "Builds Java software."], ["python-developer", "Python Developer", "Builds Python software."],
    ["dotnet-developer", ".NET Developer", "Builds .NET software."], ["php-developer", "PHP Developer", "Builds PHP software."],
    ["nodejs-developer", "Node.js Developer", "Builds Node.js software."], ["react-developer", "React Developer", "Builds React front ends."],
    ["angular-developer", "Angular Developer", "Builds Angular front ends."], ["vue-developer", "Vue.js Developer", "Builds Vue front ends."],
    ["android-developer", "Android Developer", "Builds Android apps."], ["ios-developer", "iOS Developer", "Builds iPhone and iPad apps."],
    ["flutter-developer", "Flutter Developer", "Builds apps with Flutter."], ["react-native-developer", "React Native Developer", "Builds apps with React Native."],
    ["golang-developer", "Go Developer", "Builds Go software."], ["ruby-developer", "Ruby on Rails Developer", "Builds Ruby on Rails software."],
    ["wordpress-developer", "WordPress Developer", "Builds WordPress sites."], ["shopify-developer", "Shopify Developer", "Builds Shopify stores."],
    ["salesforce-developer", "Salesforce Developer", "Builds on Salesforce."], ["sap-consultant", "SAP Consultant", "Configures and extends SAP."],
    ["api-developer", "API Developer", "Builds APIs."], ["etl-developer", "ETL Developer", "Builds data loading jobs."],
    ["database-developer", "Database Developer", "Builds database logic."], ["sql-developer", "SQL Developer", "Writes database queries and procedures."],
    ["ui-developer", "UI Developer", "Builds user interfaces."], ["javascript-developer", "JavaScript Developer", "Builds JavaScript software."],
    ["typescript-developer", "TypeScript Developer", "Builds TypeScript software."], ["cpp-developer", "C++ Developer", "Builds C++ software."],
    ["rust-developer", "Rust Developer", "Builds Rust software."], ["low-code-developer", "Low-Code Developer", "Builds apps with low-code tools."],
    ["rpa-developer", "RPA Developer", "Builds process automation bots."], ["integration-engineer", "Integration Engineer", "Connects systems together."],
    ["platform-engineer", "Platform Engineer", "Builds the platform other engineers build on."], ["build-release-engineer", "Build & Release Engineer", "Builds and ships releases."],
    ["application-developer", "Application Developer", "Builds business applications."], ["software-developer", "Software Developer", "Builds software."],
    ["programmer-analyst", "Programmer Analyst", "Analyses needs and writes the code."], ["associate-software-engineer", "Associate Software Engineer", "Early-career software engineer."],
    ["staff-engineer", "Staff Engineer", "Senior engineer who leads across teams."], ["distinguished-engineer", "Distinguished Engineer", "Top technical expert."],
    ["systems-engineer", "Systems Engineer", "Builds and joins up complex systems."], ["firmware-engineer", "Firmware Engineer", "Writes software that runs on devices."],
    ["ar-vr-developer", "AR/VR Developer", "Builds augmented and virtual reality."], ["unity-developer", "Unity Developer", "Builds games and 3D with Unity."],
    ["technical-consultant", "Technical Consultant", "Advises customers on technical work."], ["functional-consultant", "Functional Consultant", "Advises customers on how a system fits their business."],
    ["implementation-consultant", "Implementation Consultant", "Sets the product up for customers."], ["technical-specialist", "Technical Specialist", "Deep expert in one technology."],
  ]),

  // ── Engineering leadership
  ...group("Engineering", LEAD, [
    ["technical-lead", "Technical Lead", "Leads a technical team."], ["technical-manager", "Technical Manager", "Manages the technical team and its delivery."],
    ["technical-project-manager", "Technical Project Manager", "Runs technical projects."], ["senior-engineering-manager", "Senior Engineering Manager", "Manages several engineering teams."],
    ["director-of-engineering", "Director of Engineering", "Leads all engineering."], ["vp-engineering", "VP Engineering", "Vice president for engineering."],
    ["head-of-engineering", "Head of Engineering", "Heads the engineering function."], ["development-manager", "Development Manager", "Manages developers and releases."],
    ["team-manager-engineering", "Team Manager", "Manages a team of engineers."], ["release-manager", "Release Manager", "Plans and controls releases."],
    ["architecture-manager", "Architecture Manager", "Manages the architects."], ["engineering-director", "Engineering Director", "Director in engineering."],
    ["senior-technical-lead", "Senior Technical Lead", "Leads several technical teams."], ["application-manager", "Application Manager", "Responsible for one or more applications."],
    ["it-manager", "IT Manager", "Manages the company's IT."], ["it-director", "IT Director", "Directs the company's IT."],
    ["it-project-manager", "IT Project Manager", "Runs IT projects."], ["technical-account-manager", "Technical Account Manager", "Looks after the technical side of key clients."],
    ["chief-architect", "Chief Architect", "Top architect in the company."], ["head-of-architecture", "Head of Architecture", "Heads architecture."],
  ]),

  // ── Quality, testing, support engineering
  ...group("Quality Assurance", ["pms_employee", "sop_author", ...EVERYONE], [
    ["sdet", "SDET", "Software Development Engineer in Test: writes code that tests code."], ["senior-qa-engineer", "Senior QA Engineer", "Senior tester."],
    ["qa-analyst", "QA Analyst", "Analyses quality and writes tests."], ["test-lead", "Test Lead", "Leads testers."],
    ["test-manager", "Test Manager", "Manages testing."], ["uat-coordinator", "UAT Coordinator", "Coordinates user acceptance testing."],
    ["security-tester", "Penetration Tester", "Tests how safe systems are by trying to break in."], ["accessibility-tester", "Accessibility Tester", "Tests that products work for everyone."],
    ["mobile-tester", "Mobile App Tester", "Tests mobile apps."], ["game-tester", "Game Tester", "Tests games."],
    ["quality-engineer", "Quality Engineer", "Builds quality into how work is done."], ["quality-assurance-executive", "Quality Assurance Executive", "Everyday quality checks."],
  ]),
  ...group("Engineering", ["pms_employee", "lms_agent", "sop_author", "dlms_employee", ...EVERYONE], [
    ["it-support-engineer", "IT Support Engineer", "Fixes staff IT problems."], ["help-desk-executive", "Help Desk Executive", "First line of IT help."],
    ["desktop-support-engineer", "Desktop Support Engineer", "Looks after staff computers."], ["application-support-engineer", "Application Support Engineer", "Keeps applications running for users."],
    ["production-support-engineer", "Production Support Engineer", "Keeps live systems running."], ["l1-support-engineer", "L1 Support Engineer", "First-level technical support."],
    ["l2-support-engineer", "L2 Support Engineer", "Second-level technical support."], ["l3-support-engineer", "L3 Support Engineer", "Third-level technical support."],
    ["noc-engineer", "NOC Engineer", "Watches networks and systems around the clock."], ["it-technician", "IT Technician", "Hands-on IT repairs and set-up."],
    ["it-administrator-junior", "IT Executive", "Everyday IT work."], ["support-analyst", "Support Analyst", "Analyses and solves support issues."],
  ]),

  // ── Security and infrastructure
  ...group("Engineering", ["dlms_manager", "sop_author", "auditor", "pms_employee", ...EVERYONE], [
    ["cybersecurity-analyst", "Cybersecurity Analyst", "Watches for and handles security threats."], ["soc-analyst", "SOC Analyst", "Monitors security alerts."],
    ["ciso", "Chief Information Security Officer", "Responsible for the company's information security."], ["security-manager", "Security Manager", "Manages the security team."],
    ["vulnerability-analyst", "Vulnerability Analyst", "Finds and tracks weaknesses."], ["incident-response-analyst", "Incident Response Analyst", "Handles security incidents."],
    ["identity-access-manager", "Identity & Access Manager", "Manages who can get into what."], ["grc-analyst", "GRC Analyst", "Governance, risk and compliance work."],
  ]),
  ...group("Engineering", ["dlms_manager", "pms_employee", "prms_employee", ...EVERYONE], [
    ["infrastructure-engineer", "Infrastructure Engineer", "Builds and runs servers and networks."], ["linux-administrator", "Linux Administrator", "Looks after Linux servers."],
    ["windows-administrator", "Windows Administrator", "Looks after Windows servers."], ["storage-engineer", "Storage Engineer", "Looks after storage systems."],
    ["virtualization-engineer", "Virtualization Engineer", "Looks after virtual machines."], ["monitoring-engineer", "Monitoring Engineer", "Builds monitoring and alerts."],
    ["kubernetes-engineer", "Kubernetes Engineer", "Runs container platforms."], ["it-operations-manager", "IT Operations Manager", "Manages IT operations."],
    ["data-center-engineer", "Data Center Engineer", "Looks after the data centre."], ["telecom-engineer", "Telecom Engineer", "Looks after telecom systems."],
  ]),

  // ── Data, AI and analytics (more)
  ...group("Data & AI", ["intelligence_user", "aibots_manager", "pms_employee", ...EVERYONE], [
    ["big-data-engineer", "Big Data Engineer", "Builds systems for very large data."], ["analytics-engineer", "Analytics Engineer", "Turns raw data into trusted tables."],
    ["senior-data-scientist", "Senior Data Scientist", "Leads data science work."], ["research-scientist", "Research Scientist", "Researches new methods."],
    ["nlp-engineer", "NLP Engineer", "Builds language-understanding systems."], ["computer-vision-engineer", "Computer Vision Engineer", "Builds systems that see."],
    ["mlops-engineer", "MLOps Engineer", "Runs machine-learning systems in production."], ["data-governance-manager", "Data Governance Manager", "Sets the rules for company data."],
    ["head-of-data", "Head of Data", "Leads data and analytics."], ["chief-data-officer", "Chief Data Officer (CDO)", "Responsible for all company data."],
    ["reporting-analyst", "Reporting Analyst", "Builds and runs reports."], ["quantitative-analyst", "Quantitative Analyst", "Analyses with maths and statistics."],
    ["statistician", "Statistician", "Analyses data with statistics."], ["ai-product-manager", "AI Product Manager", "Owns AI products."],
    ["conversational-ai-designer", "Conversational AI Designer", "Designs chatbot conversations."], ["ai-trainer", "AI Trainer", "Teaches and checks AI assistants."],
  ]),

  // ── Product, design, research (more)
  ...group("Product", ["pms_manager", "sop_author", "intelligence_user", "lms_agent", ...EVERYONE], [
    ["associate-product-manager", "Associate Product Manager", "Early-career product manager."], ["technical-product-manager", "Technical Product Manager", "Owns technical products."],
    ["group-product-manager", "Group Product Manager", "Manages product managers."], ["director-of-product", "Director of Product", "Leads product."],
    ["head-of-product", "Head of Product", "Heads the product function."], ["chief-product-officer", "Chief Product Officer (CPO)", "Responsible for all products."],
    ["product-analyst", "Product Analyst", "Analyses how products are used."], ["product-marketing-manager", "Product Marketing Manager", "Brings products to market."],
    ["requirements-analyst", "Requirements Analyst", "Gathers and writes requirements."], ["systems-analyst", "Systems Analyst", "Analyses how systems should work."],
    ["functional-analyst", "Functional Analyst", "Analyses how a business function works."], ["process-analyst", "Process Analyst", "Studies and improves processes."],
    ["product-operations-manager", "Product Operations Manager", "Keeps the product team running."], ["innovation-manager", "Innovation Manager", "Leads new ideas."],
  ]),
  ...group("Design", ["pms_employee", "cms_editor", "smms_employee", ...EVERYONE], [
    ["ux-designer", "UX Designer", "Designs how products work."], ["ui-designer", "UI Designer", "Designs how products look."],
    ["product-designer", "Product Designer", "Designs products from idea to screen."], ["visual-designer", "Visual Designer", "Designs the look and feel."],
    ["interaction-designer", "Interaction Designer", "Designs how people interact with products."], ["web-designer", "Web Designer", "Designs websites."],
    ["creative-director", "Creative Director", "Leads creative work."], ["art-director", "Art Director", "Leads the visual style."],
    ["head-of-design", "Head of Design", "Heads the design function."], ["illustrator", "Illustrator", "Makes illustrations."],
    ["animator", "Animator", "Makes animations."], ["3d-artist", "3D Artist", "Makes 3D models and scenes."],
    ["photographer", "Photographer", "Takes photographs for the company."], ["videographer", "Videographer", "Shoots video for the company."],
    ["ux-writer", "UX Writer", "Writes the words inside products."], ["design-system-manager", "Design System Manager", "Looks after the shared design system."],
  ]),

  // ── Delivery and consulting
  ...group("Project Delivery", ["pms_manager", "manager", "dlms_employee", "sop_author", ...EVERYONE], [
    ["senior-project-manager", "Senior Project Manager", "Runs large projects."], ["associate-project-manager", "Associate Project Manager", "Supports project managers."],
    ["pmo-manager", "PMO Manager", "Runs the project management office."], ["pmo-analyst", "PMO Analyst", "Tracks projects for the PMO."],
    ["delivery-head", "Delivery Head", "Heads delivery."], ["director-of-delivery", "Director of Delivery", "Directs delivery."],
    ["agile-coach", "Agile Coach", "Coaches teams in agile ways of working."], ["release-train-engineer", "Release Train Engineer", "Coordinates several agile teams."],
    ["engagement-manager", "Engagement Manager", "Manages the client engagement."], ["implementation-manager", "Implementation Manager", "Manages customer set-ups."],
    ["onboarding-manager", "Onboarding Manager", "Manages how new customers start."], ["resource-manager", "Resource Manager", "Plans who works on what."],
    ["capacity-planner", "Capacity Planner", "Plans team capacity."], ["management-consultant", "Management Consultant", "Advises on how to run the business."],
    ["business-consultant", "Business Consultant", "Advises customers on business matters."], ["it-consultant", "IT Consultant", "Advises customers on IT."],
  ]),

  // ── Leadership and ownership
  ...group("Management", EXEC, [
    ["managing-director", "Managing Director", "Runs the company day to day. Company settings and people's status stay with the Director."],
    ["president", "President", "Senior leader of the company."], ["executive-director", "Executive Director", "Senior leader with day-to-day duties."],
    ["chief-information-officer", "Chief Information Officer (CIO)", "Responsible for the company's information systems."],
    ["chief-revenue-officer", "Chief Revenue Officer (CRO)", "Responsible for all revenue: sales, marketing and customers."],
    ["chief-customer-officer", "Chief Customer Officer", "Responsible for the customer experience."],
    ["chief-compliance-officer", "Chief Compliance Officer", "Responsible for compliance."], ["chief-legal-officer", "Chief Legal Officer", "Responsible for legal matters."],
    ["chief-strategy-officer", "Chief Strategy Officer", "Responsible for company strategy."], ["chief-of-staff", "Chief of Staff", "Right hand of the top leader."],
    ["general-manager-operations", "General Manager - Operations", "Runs operations."], ["senior-vice-president", "Senior Vice President", "Senior business-unit leader."],
    ["associate-vice-president", "Associate Vice President", "Business-unit leader."], ["country-manager", "Country Manager", "Runs the business in one country."],
    ["regional-director", "Regional Director", "Runs the business in a region."], ["branch-manager", "Branch Manager", "Runs a branch office."],
    ["site-head", "Site Head", "Runs one site."], ["center-head", "Centre Head", "Runs one centre."],
  ]),
  ...group("Management", ["workspace_member", "employee", "chat_employee", "sop_employee", "finance_read_only", "cms_viewer", "lpms_viewer"], [
    ["founder", "Founder", "Founded the company. Give the Director designation for full control."], ["co-founder", "Co-Founder", "Co-founded the company. Give the Director designation for full control."],
    ["owner", "Owner", "Owns the company. Give the Director designation for full control."], ["chairman", "Chairman", "Chairs the board."],
    ["board-member", "Board Member", "Sits on the board: looks at shared dashboards and records."], ["advisor", "Advisor", "Advises the company: looks at shared records."],
    ["investor", "Investor", "Follows the company: shared dashboards only."], ["partner-owner", "Partner", "A partner in the business."],
    ["trustee", "Trustee", "Oversees the organisation."], ["observer", "Observer", "Can look but not change."],
  ]),

  // ── Sales, marketing and customers (more)
  ...group("Sales & Business Development", ["lms_agent", ...EVERYONE], [
    ["sales-representative", "Sales Representative", "Sells to customers."], ["senior-sales-executive", "Senior Sales Executive", "Experienced seller."],
    ["junior-sales-executive", "Junior Sales Executive", "Early-career seller."], ["field-sales-executive", "Field Sales Executive", "Sells in person."],
    ["outside-sales-representative", "Outside Sales Representative", "Sells on visits."], ["sales-development-representative", "Sales Development Representative (SDR)", "Finds and qualifies new leads."],
    ["lead-generation-specialist", "Lead Generation Specialist", "Finds new leads."], ["relationship-manager", "Relationship Manager", "Looks after customer relationships."],
    ["territory-sales-executive", "Territory Sales Executive", "Sells in a territory."], ["retail-sales-associate", "Retail Sales Associate", "Sells in a shop."],
    ["sales-coordinator", "Sales Coordinator", "Keeps sales organised."], ["sales-trainer", "Sales Trainer", "Trains the sales team."],
    ["enterprise-sales-executive", "Enterprise Sales Executive", "Sells to large companies."], ["partnership-executive", "Partnerships Executive", "Builds partnerships."],
  ]),
  ...group("Sales & Business Development", ["lms_manager", "intelligence_user", "manager", ...EVERYONE], [
    ["area-sales-manager", "Area Sales Manager", "Leads sales in an area."], ["national-sales-manager", "National Sales Manager", "Leads sales across the country."],
    ["zonal-sales-manager", "Zonal Sales Manager", "Leads sales in a zone."], ["sales-director", "Sales Director", "Directs sales."],
    ["vp-sales", "VP Sales", "Vice president for sales."], ["team-leader-sales", "Sales Team Leader", "Leads a sales team."],
    ["head-of-business-development", "Head of Business Development", "Heads business development."], ["director-business-development", "Director of Business Development", "Directs business development."],
    ["enterprise-account-director", "Enterprise Account Director", "Looks after the biggest accounts."], ["revenue-operations-manager", "Revenue Operations Manager", "Keeps the revenue process running."],
    ["sales-enablement-manager", "Sales Enablement Manager", "Gives sellers what they need to win."], ["sales-analyst", "Sales Analyst", "Analyses sales numbers."],
    ["proposal-manager", "Proposal Manager", "Writes and manages proposals and tenders."], ["bid-manager", "Bid Manager", "Manages bids and tenders."],
  ]),
  ...group("Customer Support", SUPPORT, [
    ["customer-service-representative", "Customer Service Representative", "Answers customers."], ["customer-care-executive", "Customer Care Executive", "Looks after customers."],
    ["call-center-agent", "Call Centre Agent", "Handles customer calls."], ["chat-support-agent", "Chat Support Agent", "Helps customers by chat."],
    ["email-support-agent", "Email Support Agent", "Helps customers by email."], ["technical-support-specialist", "Technical Support Specialist", "Fixes customers' technical problems."],
    ["customer-support-director", "Customer Support Director", "Directs customer support."], ["head-of-customer-success", "Head of Customer Success", "Heads customer success."],
    ["customer-experience-manager", "Customer Experience Manager", "Improves the customer experience."], ["customer-onboarding-manager", "Customer Onboarding Manager", "Manages how customers start."],
    ["support-operations-manager", "Support Operations Manager", "Keeps support running."], ["quality-analyst-support", "Support Quality Analyst", "Checks the quality of support."],
    ["knowledge-base-manager", "Knowledge Base Manager", "Looks after help articles."], ["escalation-manager", "Escalation Manager", "Handles escalated customer problems."],
    ["complaints-officer", "Complaints Officer", "Handles customer complaints."], ["renewals-manager", "Renewals Manager", "Manages renewals."],
    ["account-executive", "Account Executive", "Manages accounts and closes deals."], ["client-partner", "Client Partner", "Senior contact for key clients."],
  ]),
  ...group("Marketing", ["smms_specialist", "seo_employee", "cms_editor", ...EVERYONE], [
    ["marketing-coordinator", "Marketing Coordinator", "Helps run marketing."], ["marketing-analyst", "Marketing Analyst", "Analyses marketing results."],
    ["marketing-director", "Marketing Director", "Directs marketing."], ["vp-marketing", "VP Marketing", "Vice president for marketing."],
    ["head-of-marketing", "Head of Marketing", "Heads marketing."], ["demand-generation-manager", "Demand Generation Manager", "Creates demand for the product."],
    ["field-marketing-manager", "Field Marketing Manager", "Runs events and local marketing."], ["event-manager", "Event Manager", "Plans and runs events."],
    ["influencer-marketing-manager", "Influencer Marketing Manager", "Works with influencers."], ["affiliate-manager", "Affiliate Manager", "Runs the affiliate programme."],
    ["ppc-specialist", "PPC Specialist", "Runs paid search and display ads."], ["sem-specialist", "SEM Specialist", "Runs search marketing."],
    ["social-media-strategist", "Social Media Strategist", "Plans social media."], ["marketing-automation-specialist", "Marketing Automation Specialist", "Builds automated campaigns."],
    ["crm-manager", "CRM Manager", "Looks after customer records and campaigns."], ["conversion-rate-optimizer", "Conversion Rate Optimiser", "Improves how many visitors become customers."],
    ["web-analyst", "Web Analyst", "Analyses website traffic."], ["editor", "Editor", "Edits what the company publishes."],
    ["journalist", "Journalist / Content Reporter", "Reports and writes content."], ["blogger", "Blogger", "Writes the company blog."],
    ["translator", "Translator", "Translates content."], ["proofreader", "Proofreader", "Checks content before it is published."],
    ["brand-ambassador", "Brand Ambassador", "Represents the brand."], ["pr-executive", "PR Executive", "Handles press and public relations."],
  ]),

  // ── Human resources (more)
  ...group("Human Resources", ["hr", "chat_hr", ...EVERYONE], [
    ["hr-director", "HR Director", "Directs HR."], ["head-of-hr", "Head of HR", "Heads HR."], ["vp-hr", "VP Human Resources", "Vice president for HR."],
    ["hr-assistant", "HR Assistant", "Supports the HR team."], ["hr-coordinator", "HR Coordinator", "Coordinates HR work."],
    ["hr-analyst", "HR Analyst", "Analyses people data."], ["payroll-manager", "Payroll Manager", "Manages payroll."],
    ["payroll-specialist", "Payroll Specialist", "Runs payroll."], ["onboarding-specialist", "Employee Onboarding Specialist", "Welcomes and sets up new joiners."],
    ["training-specialist", "Training Specialist", "Runs staff training."], ["recruitment-coordinator", "Recruitment Coordinator", "Schedules interviews and keeps hiring organised."],
    ["technical-recruiter", "Technical Recruiter", "Hires engineers."], ["campus-recruiter", "Campus Recruiter", "Hires from colleges."],
    ["executive-recruiter", "Executive Recruiter", "Hires senior people."], ["sourcing-specialist", "Sourcing Specialist", "Finds candidates."],
    ["employer-branding-manager", "Employer Branding Manager", "Makes the company a place people want to work."], ["diversity-inclusion-manager", "Diversity & Inclusion Manager", "Leads diversity and inclusion."],
    ["employee-engagement-manager", "Employee Engagement Manager", "Looks after how engaged staff are."], ["workforce-planner", "Workforce Planning Manager", "Plans how many people are needed."],
    ["people-operations-manager", "People Operations Manager", "Runs people operations."], ["hr-administrator", "HR Administrator", "Keeps HR records."],
    ["welfare-officer", "Welfare Officer", "Looks after staff welfare."], ["industrial-relations-manager", "Industrial Relations Manager", "Handles relations with unions and workers."],
  ]),

  // ── Finance (more)
  ...group("Finance & Accounts", ["accountant", "finance_executive", "accounts_receivable", "accounts_payable", ...EVERYONE], [
    ["chartered-accountant", "Chartered Accountant", "Qualified accountant: books, tax and audit."], ["cost-accountant", "Cost Accountant", "Tracks and analyses costs."],
    ["management-accountant", "Management Accountant", "Reports numbers to managers."], ["financial-accountant", "Financial Accountant", "Prepares financial statements."],
    ["general-ledger-accountant", "General Ledger Accountant", "Looks after the general ledger."], ["fixed-asset-accountant", "Fixed Asset Accountant", "Looks after fixed assets."],
    ["tax-accountant", "Tax Accountant", "Prepares taxes."], ["bookkeeper", "Bookkeeper", "Records day-to-day transactions."],
    ["accounts-assistant", "Accounts Assistant", "Supports the accounts team."], ["accounts-clerk", "Accounts Clerk", "Everyday accounts entries."],
    ["gst-executive", "GST Executive", "Handles GST returns and records."], ["tds-executive", "TDS Executive", "Handles TDS."],
    ["credit-controller", "Credit Controller", "Manages customer credit and overdue payments."], ["reconciliation-analyst", "Reconciliation Analyst", "Matches bank and book records."],
    ["finance-executive", "Finance Executive", "Everyday finance work."], ["finance-business-partner", "Finance Business Partner", "Works with departments on their numbers."],
  ]),
  ...group("Finance & Accounts", ["finance_manager", "finance", "auditor", "intelligence_user", ...EVERYONE], [
    ["vp-finance", "VP Finance", "Vice president for finance."], ["head-of-finance", "Head of Finance", "Heads finance."],
    ["finance-director", "Finance Director", "Directs finance."], ["assistant-finance-manager", "Assistant Finance Manager", "Supports the finance manager."],
    ["financial-controller-deputy", "Deputy Financial Controller", "Deputy to the financial controller."], ["fpa-manager", "FP&A Manager", "Plans and forecasts the numbers."],
    ["fpa-analyst", "FP&A Analyst", "Analyses plans and forecasts."], ["investor-relations-manager", "Investor Relations Manager", "Talks to investors."],
    ["internal-audit-manager", "Internal Audit Manager", "Leads internal audit."], ["external-auditor", "External Auditor", "Audits from outside (read only)."],
    ["forensic-accountant", "Forensic Accountant", "Investigates financial wrongdoing."], ["payments-manager", "Payments Manager", "Manages payments."],
  ]),

  // ── Operations, supply chain, facilities
  ...group("Operations & Admin", OPS_STAFF, [
    ["operations-manager-senior", "Senior Operations Manager", "Leads operations across sites."], ["director-of-operations", "Director of Operations", "Directs operations."],
    ["head-of-operations", "Head of Operations", "Heads operations."], ["vp-operations", "VP Operations", "Vice president for operations."],
    ["operations-analyst", "Operations Analyst", "Analyses operations."], ["operations-coordinator", "Operations Coordinator", "Coordinates operations work."],
    ["supply-chain-manager", "Supply Chain Manager", "Manages the supply chain."], ["supply-chain-analyst", "Supply Chain Analyst", "Analyses the supply chain."],
    ["procurement-manager-senior", "Head of Procurement", "Heads procurement."], ["sourcing-manager", "Sourcing Manager", "Finds and manages suppliers."],
    ["buyer", "Buyer", "Buys goods and services."], ["category-manager", "Category Manager", "Manages a category of purchases."],
    ["inventory-manager", "Inventory Manager", "Manages stock."], ["inventory-executive", "Inventory Executive", "Keeps stock records."],
    ["warehouse-manager", "Warehouse Manager", "Runs the warehouse."], ["warehouse-executive", "Warehouse Executive", "Everyday warehouse work."],
    ["store-manager", "Store Manager", "Runs a store."], ["store-keeper", "Store Keeper", "Looks after stores and stock."],
    ["logistics-manager", "Logistics Manager", "Manages transport and delivery."], ["fleet-manager", "Fleet Manager", "Manages vehicles."],
    ["dispatch-coordinator", "Dispatch Coordinator", "Plans dispatches."], ["import-export-executive", "Import-Export Executive", "Handles import and export paperwork."],
    ["facility-executive", "Facility Executive", "Everyday facilities work."], ["admin-manager", "Administration Manager", "Manages administration."],
    ["admin-executive", "Administration Executive", "Everyday administration."], ["travel-coordinator", "Travel Coordinator", "Arranges staff travel."],
    ["front-office-executive", "Front Office Executive", "Looks after the front office."], ["office-boy", "Office Assistant", "Helps around the office."],
    ["maintenance-engineer", "Maintenance Engineer", "Looks after equipment and buildings."], ["maintenance-technician", "Maintenance Technician", "Repairs equipment."],
    ["electrician", "Electrician", "Looks after electrical work."], ["civil-engineer", "Civil Engineer", "Looks after civil works."],
    ["mechanical-engineer", "Mechanical Engineer", "Looks after mechanical systems."], ["electrical-engineer", "Electrical Engineer", "Looks after electrical systems."],
    ["production-manager", "Production Manager", "Manages production."], ["production-supervisor", "Production Supervisor", "Supervises production."],
    ["plant-manager", "Plant Manager", "Runs a plant."], ["quality-control-inspector", "Quality Control Inspector", "Inspects quality."],
    ["quality-manager", "Quality Manager", "Manages quality."], ["safety-officer", "Health & Safety Officer", "Looks after health and safety."],
    ["environmental-officer", "Environmental Officer", "Looks after environmental rules."], ["project-engineer", "Project Engineer", "Engineers on projects."],
    ["site-engineer", "Site Engineer", "Engineers on site."], ["site-supervisor", "Site Supervisor", "Supervises a site."],
  ]),
  ...group("Operations & Admin", FIELD, [
    ["driver", "Driver", "Drives for the company: everyday tools only."], ["security-guard", "Security Guard", "Guards the premises: everyday tools only."],
    ["housekeeping-staff", "Housekeeping Staff", "Keeps the premises clean: everyday tools only."], ["peon", "Peon", "Office helper: everyday tools only."],
    ["technician", "Technician", "Hands-on technical work: everyday tools only."], ["helper", "Helper", "Helps with day-to-day work: everyday tools only."],
    ["delivery-executive", "Delivery Executive", "Delivers goods: everyday tools only."], ["packer", "Packing Staff", "Packs goods: everyday tools only."],
    ["machine-operator", "Machine Operator", "Runs machines: everyday tools only."], ["cleaner", "Cleaner", "Cleans the premises: everyday tools only."],
  ]),

  // ── Legal and compliance (more)
  ...group("Legal & Compliance", ["lpms_manager", "dlms_manager", "sop_manager", ...EVERYONE], [
    ["general-counsel", "General Counsel", "Head of legal."], ["head-of-legal", "Head of Legal", "Heads the legal function."],
    ["legal-manager-senior", "Senior Legal Manager", "Leads legal work."], ["legal-assistant", "Legal Assistant", "Supports lawyers."],
    ["paralegal", "Paralegal", "Prepares legal documents and research."], ["contracts-administrator", "Contracts Administrator", "Keeps contracts organised."],
    ["ip-manager", "Intellectual Property Manager", "Looks after patents and trademarks."], ["privacy-officer", "Privacy Officer", "Looks after privacy."],
    ["regulatory-affairs-manager", "Regulatory Affairs Manager", "Deals with regulators."], ["compliance-analyst", "Compliance Analyst", "Checks compliance."],
    ["compliance-manager", "Compliance Manager", "Manages compliance."], ["policy-manager", "Policy Manager", "Writes and keeps company policies."],
    ["ethics-officer", "Ethics Officer", "Looks after ethics."], ["litigation-manager", "Litigation Manager", "Manages legal disputes."],
  ]),

  // ── Education and training (more)
  ...group("Training & Mentorship", ["mentor", "ots_author", "ots_evaluator", ...EVERYONE], [
    ["professor", "Professor", "Teaches and researches."], ["associate-professor", "Associate Professor", "Teaches and researches."],
    ["assistant-professor", "Assistant Professor", "Teaches and researches."], ["lecturer", "Lecturer", "Teaches classes."],
    ["teacher", "Teacher", "Teaches classes."], ["senior-teacher", "Senior Teacher", "Teaches and guides other teachers."],
    ["tutor", "Tutor", "Teaches small groups."], ["subject-matter-expert", "Subject Matter Expert", "Expert who writes and checks content."],
    ["content-developer-training", "Learning Content Developer", "Builds courses."], ["instructional-designer", "Instructional Designer", "Designs how people learn."],
    ["e-learning-developer", "E-learning Developer", "Builds online courses."], ["corporate-trainer", "Corporate Trainer", "Trains company staff."],
    ["soft-skills-trainer", "Soft Skills Trainer", "Trains communication and people skills."], ["technical-trainer", "Technical Trainer", "Trains technical skills."],
    ["career-counselor", "Career Counsellor", "Guides careers."], ["lab-instructor", "Lab Instructor", "Runs practical sessions."],
    ["principal", "Principal", "Runs a school or college."], ["vice-principal", "Vice Principal", "Deputy head of a school or college."],
    ["dean", "Dean", "Heads a faculty."], ["head-of-training", "Head of Training", "Heads training."],
    ["admissions-counselor", "Admissions Counsellor", "Guides people through admission."], ["admissions-manager", "Admissions Manager", "Manages admissions."],
    ["registrar", "Registrar", "Keeps student records."], ["librarian", "Librarian", "Looks after the library."],
    ["intern-trainee-coordinator", "Internship Coordinator", "Coordinates interns."], ["apprentice", "Apprentice", "Learns on the job."],
  ]),

  // ── Healthcare and hospitality (front-office and admin roles only)
  ...group("Operations & Admin", ["dept_manager", "dlms_employee", ...EVERYONE], [
    ["hospital-administrator", "Hospital Administrator", "Runs hospital administration."], ["medical-records-officer", "Medical Records Officer", "Looks after patient records."],
    ["clinic-manager", "Clinic Manager", "Runs a clinic."], ["hotel-manager", "Hotel Manager", "Runs a hotel."],
    ["front-desk-manager", "Front Desk Manager", "Runs the front desk."], ["restaurant-manager", "Restaurant Manager", "Runs a restaurant."],
    ["event-coordinator", "Event Coordinator", "Coordinates events."], ["property-manager", "Property Manager", "Manages properties."],
    ["real-estate-agent", "Real Estate Agent", "Sells and rents properties."], ["site-manager-construction", "Construction Site Manager", "Runs a construction site."],
    ["quantity-surveyor", "Quantity Surveyor", "Measures and costs construction work."], ["estimator", "Estimator", "Estimates the cost of jobs."],
  ]),

  // ── Trainees and entry level
  ...group("Engineering", ["pms_employee", ...EVERYONE], [
    ["graduate-trainee", "Graduate Trainee", "New graduate learning on the job."], ["management-trainee", "Management Trainee", "Future manager learning the business."],
    ["intern-software", "Software Intern", "Intern in engineering."], ["intern-qa", "QA Intern", "Intern in testing."],
    ["intern-design", "Design Intern", "Intern in design."], ["intern-data", "Data Intern", "Intern in data."],
    ["intern-devops", "DevOps Intern", "Intern in DevOps."], ["intern-product", "Product Intern", "Intern in product."],
    ["research-intern", "Research Intern", "Intern in research."], ["summer-intern", "Summer Intern", "Short-term intern."],
  ]),
  ...group("Marketing", ["smms_employee", "cms_viewer", ...EVERYONE], [
    ["intern-marketing", "Marketing Intern", "Intern in marketing."], ["intern-content", "Content Intern", "Intern in content."],
    ["intern-social-media", "Social Media Intern", "Intern in social media."], ["intern-seo", "SEO Intern", "Intern in search."],
  ]),
  ...group("Sales & Business Development", ["lms_agent", ...EVERYONE], [
    ["intern-sales", "Sales Intern", "Intern in sales."], ["intern-business-development", "Business Development Intern", "Intern in business development."],
  ]),
  ...group("Operations & Admin", ["dept_manager", ...EVERYONE], [
    ["intern-operations", "Operations Intern", "Intern in operations."], ["intern-admin", "Administration Intern", "Intern in administration."],
    ["intern-legal", "Legal Intern", "Intern in legal."], ["intern-customer-support", "Customer Support Intern", "Intern in support."],
  ]),

  // ── Contract, freelance and external
  ...group("Engineering", ["pms_employee", "chat_employee", "sop_employee", "workspace_member"], [
    ["freelance-developer", "Freelance Developer", "External developer: assigned projects and chat only."], ["freelance-designer", "Freelance Designer", "External designer: assigned projects and chat only."],
    ["freelance-writer", "Freelance Writer", "External writer: assigned projects and chat only."], ["external-consultant", "External Consultant", "Outside consultant: assigned projects and chat only."],
    ["contract-developer", "Contract Developer", "Contract developer: assigned projects and chat only."], ["vendor-resource", "Vendor Resource", "Person from a vendor: assigned projects and chat only."],
    ["outsourced-team-member", "Outsourced Team Member", "Person from an outsourcing partner: assigned projects and chat only."], ["part-time-consultant", "Part-time Consultant", "Part-time outside help: assigned projects and chat only."],
  ]),
];

/** Every built-in designation. */
export const DESIGNATION_TEMPLATES: DesignationTemplate[] = [...CORE_TEMPLATES, ...EXTRA_TEMPLATES];

export const DESIGNATION_DEPARTMENTS: string[] = [...new Set(DESIGNATION_TEMPLATES.map((d) => d.department))];

export function designationTemplate(key: string): DesignationTemplate | undefined {
  return DESIGNATION_TEMPLATES.find((d) => d.key === key);
}

/** Invitations sent before designations existed carry an older preset name: it still means the same job. */
const LEGACY_PRESETS: Record<string, string> = {
  admin: "director",
  hr: "hr-manager",
  project_manager: "project-manager",
  developer: "team-member",
  sales: "sales-manager",
  finance: "finance-manager",
  marketing: "marketing-manager",
};

/** The designation key an invitation's preset stands for ("director" for the Director), or null when unknown. */
export function presetToDesignationKey(preset: string): string | null {
  const key = LEGACY_PRESETS[preset] ?? preset;
  return key === "director" || designationTemplate(key) ? key : null;
}
