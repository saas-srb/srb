/**
 * Search keywords and titles for each product, written for how people actually search: the job (CRM, payroll, helpdesk), the buyer
 * (small business, agency, institute) and the intent (free, software, tool). Descriptions come from the product's own copy, so
 * nothing is claimed that the product page does not say. No competitor names.
 */
export interface ProductSeo {
  /** The page title before the brand suffix: the product and what it is, in the words buyers search. */
  title: string;
  /** The words a buyer types into a search box. */
  keywords: string[];
}

export const PRODUCT_SEO: Record<string, ProductSeo> = {
  workspace: {
    title: "CommandOS: Business Command Center & Automation",
    keywords: ["business command center", "company dashboard software", "workflow automation software", "business automation platform", "user roles and permissions software", "white label business software", "multi-product business suite", "company workspace software", "no-code automation for business", "business operating system", "automation software for small business", "admin dashboard for company"],
  },
  hrms: {
    title: "TalentOS: HR, Payroll & Recruitment Software",
    keywords: ["HR software", "payroll software India", "HRMS software", "recruitment software", "attendance and leave management", "employee management system", "HR and payroll software for small business", "applicant tracking system", "employee self service portal", "payroll management software", "free HR software", "offer letter generator", "leave management software"],
  },
  pms: {
    title: "SprintOS: Project Management & Timesheets",
    keywords: ["project management software", "timesheet software", "project costing software", "task management tool", "client project billing", "agile sprint planning tool", "project management for agencies", "project tracking software", "milestone billing software", "resource and budget tracking", "free project management software", "project management for IT companies"],
  },
  lms: {
    title: "DealFlow AI: CRM & Lead Management Software",
    keywords: ["CRM software", "lead management software", "sales pipeline software", "CRM for small business", "free CRM software", "CRM India", "lead tracking software", "sales CRM with AI", "enquiry management software", "deal tracking software", "marketing campaign CRM", "lead follow-up automation", "website lead capture CRM"],
  },
  fms: {
    title: "CashFlow AI: Accounting & Invoicing Software",
    keywords: ["accounting software", "invoicing software", "GST invoice software", "billing software for small business", "online accounting software India", "expense tracking software", "payment links software", "bank reconciliation software", "cash flow management software", "profit and loss reports", "free invoicing software", "accounts receivable software"],
  },
  prms: {
    title: "SpendIQ: Procurement & Asset Management",
    keywords: ["procurement software", "purchase order software", "purchase requisition system", "vendor management software", "asset management software", "expense claims software", "three-way invoice matching", "inventory management software", "goods receipt note software", "RFQ and vendor comparison", "procurement software for small business", "subscription tracking software"],
  },
  tms: {
    title: "Cohort AI: Training & Certificate Management",
    keywords: ["training management software", "learning management system", "LMS for training institutes", "student management software", "batch management software", "course and program management", "certificate generation software", "fee collection software for institutes", "corporate training software", "student portal software", "institute management software", "online training management system"],
  },
  messenger: {
    title: "Huddle AI: Team Chat & Meetings Software",
    keywords: ["team chat software", "business messaging app", "internal communication software", "team collaboration tool", "company announcements app", "video meetings for teams", "workplace chat for companies", "private team messenger", "group chat for business", "internal chat with channels", "team communication platform"],
  },
  sop: {
    title: "Playbook AI: SOP & Policy Management Software",
    keywords: ["SOP software", "standard operating procedure software", "policy management software", "document control software", "SOP management system", "procedure version control", "policy acknowledgement tracking", "company handbook software", "compliance procedures software", "process documentation tool", "employee policy acknowledgement"],
  },
  lpms: {
    title: "ContractFlow AI: Contract Management Software",
    keywords: ["contract management software", "agreement management software", "contract approval workflow", "legal document management", "contract template software", "contract lifecycle management", "document approval software", "contract management for small business", "legal document automation"],
  },
  dlms: {
    title: "CyberVault: Secure Document & Password Vault",
    keywords: ["document vault software", "password manager for business", "secure document storage", "encrypted document management", "company credentials vault", "digital locker for business", "secure file sharing for teams", "business password vault", "document management system", "team password manager", "secure document vault India"],
  },
  ots: {
    title: "EvalIQ: Online Test & Assessment Platform",
    keywords: ["online test software", "online assessment platform", "exam software", "candidate screening test", "hiring assessment software", "question bank software", "online examination system", "skill assessment tool", "test creator software", "MCQ test platform", "recruitment test software", "online quiz maker for institutes"],
  },
  aibots: {
    title: "AgentOS: AI Chatbots & Assistants for Business",
    keywords: ["AI chatbot for business", "custom AI assistant", "AI agent platform", "chatbot trained on your documents", "customer support chatbot", "AI assistant builder", "website AI chatbot", "knowledge base chatbot", "business AI copilot", "no-code chatbot builder", "AI chatbot for customer service"],
  },
  intelligence: {
    title: "DataBrain AI: AI Business Analytics Software",
    keywords: ["business intelligence software", "ask questions about business data", "AI data analytics for business", "natural language business reports", "BI tool for small business", "AI analytics dashboard", "live business reports", "data insights from ledger", "AI business analyst", "self-service analytics", "business reporting software"],
  },
  smms: {
    title: "ViralPulse AI: Social Media Management Tool",
    keywords: ["social media management software", "social media scheduler", "AI social media content generator", "social media campaign planner", "social media calendar tool", "content approval workflow", "social media posting tool", "social media analytics", "AI post writer", "social media marketing software for business", "schedule posts across platforms"],
  },
  seo: {
    title: "RankMax AI: SEO Audit & Rank Tracking Software",
    keywords: ["SEO software", "SEO audit tool", "rank tracking software", "keyword tracking tool", "technical SEO audit", "SEO for small business", "website SEO checker", "on-page SEO tool", "SEO reporting software", "search ranking tracker", "SEO management platform", "free SEO audit"],
  },
  cms: {
    title: "SiteCraft AI: Website Builder & CMS with AI",
    keywords: ["website builder", "CMS software", "AI website builder", "business website builder", "website builder with custom domain", "no-code website builder", "company website creator", "drag and drop website builder", "website theme builder", "build a website in minutes", "website builder with SEO", "free website builder for business"],
  },
  portal: {
    title: "ClientOS: White-Label Client & Student Portal",
    keywords: ["client portal software", "customer portal software", "white label client portal", "student portal software", "branded customer portal", "client login portal for business", "self-service portal", "client collaboration portal", "portal for agencies", "customer self service software"],
  },
  support: {
    title: "ResolveIQ: Helpdesk & Ticketing Software",
    keywords: ["helpdesk software", "customer support software", "ticketing system", "support ticket software", "AI helpdesk", "customer service software", "help desk for small business", "support request management", "knowledge base software", "customer support portal", "SLA ticket tracking"],
  },
  website: {
    title: "Sites: Business Website on Your Own Domain",
    keywords: ["company website", "business website with custom domain", "website hosting with SSL", "website for small business", "website with CMS", "professional business website", "website with enquiry forms", "website connected to CRM", "SEO friendly business website", "website on your own domain"],
  },
};

/** Words that describe the whole platform: used on the home page and added to every page after its own keywords. */
export const BASE_KEYWORDS = [
  "SelfRun AI",
  "business automation software",
  "AI business platform",
  "all-in-one business software",
  "business management software",
  "ERP alternative for small business",
  "CRM and HR and accounting in one platform",
  "free business software",
  "white label business software",
  "business software for startups and SMEs",
  "automate business processes",
];

/** schema.org `applicationSubCategory` for each product: what kind of software it is. */
export const PRODUCT_CATEGORY: Record<string, string> = {
  workspace: "Business automation software", hrms: "HR and payroll software", pms: "Project management software", lms: "CRM software",
  fms: "Accounting and invoicing software", prms: "Procurement and asset management software", tms: "Learning and training management software",
  messenger: "Team communication software", sop: "SOP and policy management software", lpms: "Contract management software",
  dlms: "Document and password vault software", ots: "Online assessment software", aibots: "AI chatbot and assistant software",
  intelligence: "Business intelligence software", smms: "Social media management software", seo: "SEO software",
  cms: "Website builder and CMS", portal: "Client portal software", support: "Helpdesk and ticketing software", website: "Business website platform",
};

/** Who each product is for, as schema.org audiences. */
export const PRODUCT_AUDIENCE: Record<string, string> = {
  workspace: "Business owners and administrators", hrms: "HR teams and employees", pms: "Project managers, agencies and delivery teams", lms: "Sales teams and business owners",
  fms: "Finance teams and business owners", prms: "Procurement and operations teams", tms: "Training institutes and corporate training teams", messenger: "Teams and companies",
  sop: "Operations and compliance teams", lpms: "Legal, sales and operations teams", dlms: "Companies and IT administrators", ots: "Recruiters, institutes and trainers",
  aibots: "Support teams and business owners", intelligence: "Managers and business owners", smms: "Marketing teams", seo: "Marketing teams and website owners",
  cms: "Marketing teams and business owners", portal: "Agencies, institutes and service businesses", support: "Customer support teams", website: "Businesses of any size",
};
