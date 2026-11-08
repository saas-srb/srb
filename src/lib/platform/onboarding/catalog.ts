import { DESIGNATION_TEMPLATES, DIRECTOR_ROLE, DIRECTOR_TITLE, presetToDesignationKey } from "@/lib/platform/designations";

const DIRECTOR_KEY = "director";

/**
 * Starting points offered by the onboarding wizard — client-safe, no data
 * access. Everything here is a DEFAULT the owner can edit before it's applied.
 */

export const INDUSTRIES = [
  { value: "software_services", label: "Software development services" },
  { value: "saas_product", label: "SaaS / product company" },
  { value: "digital_agency", label: "Digital marketing agency" },
  { value: "ai_data", label: "AI, data & automation" },
  { value: "it_consulting", label: "IT consulting & staffing" },
  { value: "training", label: "IT training & education" },
] as const;
export type Industry = (typeof INDUSTRIES)[number]["value"];

export const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–500", "500+"] as const;

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"] as const;

export interface DepartmentTemplate {
  name: string;
  code: string;
  designations: string[];
}

const ENGINEERING: DepartmentTemplate = { name: "Engineering", code: "ENG", designations: ["Engineering Manager", "Tech Lead", "Senior Software Engineer", "Software Engineer", "Intern"] };
const QA: DepartmentTemplate = { name: "Quality Assurance", code: "QA", designations: ["QA Lead", "QA Engineer", "Automation Engineer"] };
const DESIGN: DepartmentTemplate = { name: "Design", code: "DES", designations: ["Design Lead", "UI/UX Designer"] };
const PRODUCT: DepartmentTemplate = { name: "Product", code: "PRD", designations: ["Product Manager", "Business Analyst"] };
const DELIVERY: DepartmentTemplate = { name: "Project Delivery", code: "PMO", designations: ["Delivery Head", "Project Manager", "Scrum Master"] };
const SALES: DepartmentTemplate = { name: "Sales & Business Development", code: "SAL", designations: ["Head of Sales", "Business Development Executive", "Pre-sales Consultant"] };
const MARKETING: DepartmentTemplate = { name: "Marketing", code: "MKT", designations: ["Marketing Manager", "Digital Marketing Executive", "Content Writer", "SEO Specialist"] };
const HR: DepartmentTemplate = { name: "Human Resources", code: "HR", designations: ["HR Manager", "Talent Acquisition Specialist", "HR Executive"] };
const FINANCE: DepartmentTemplate = { name: "Finance & Accounts", code: "FIN", designations: ["Finance Manager", "Accountant"] };
const OPERATIONS: DepartmentTemplate = { name: "Operations & Admin", code: "OPS", designations: ["Operations Manager", "IT Administrator", "Office Administrator"] };
const DATA: DepartmentTemplate = { name: "Data & AI", code: "DAI", designations: ["Data Science Lead", "Data Scientist", "ML Engineer", "Data Engineer"] };
const TRAINING: DepartmentTemplate = { name: "Training & Mentorship", code: "TRN", designations: ["Training Head", "Trainer", "Mentor", "Placement Coordinator"] };

export const DEPARTMENT_TEMPLATES: Record<Industry, DepartmentTemplate[]> = {
  software_services: [ENGINEERING, QA, DESIGN, DELIVERY, SALES, HR, FINANCE, OPERATIONS],
  saas_product: [ENGINEERING, QA, DESIGN, PRODUCT, SALES, MARKETING, HR, FINANCE],
  digital_agency: [MARKETING, DESIGN, { ...ENGINEERING, designations: ["Web Developer", "Senior Web Developer"] }, DELIVERY, SALES, HR, FINANCE],
  ai_data: [DATA, ENGINEERING, PRODUCT, DELIVERY, SALES, HR, FINANCE],
  it_consulting: [DELIVERY, ENGINEERING, SALES, HR, FINANCE, OPERATIONS],
  training: [TRAINING, ENGINEERING, SALES, MARKETING, HR, FINANCE],
};

/**
 * What a person can be invited as: a designation (Director, HR Manager, Accountant …). Each one is a bundle of the REAL role literals every
 * product checks (see `platform/designations.ts`), so the invitee gets the right access in every product at once. Roles stay editable per
 * person in People & access.
 */
export const ROLE_PRESETS: { value: string; label: string; description: string; roles: string[] }[] = [
  { value: DIRECTOR_KEY, label: DIRECTOR_TITLE, description: "Full access to every product and company settings. Can change anyone's status.", roles: [DIRECTOR_ROLE] },
  ...DESIGNATION_TEMPLATES.map((d) => ({ value: d.key, label: d.title, description: d.description, roles: d.roles })),
];
export type RolePreset = string;

export function rolesForPreset(preset: string): string[] | null {
  const key = presetToDesignationKey(preset);
  if (!key) return null;
  const p = ROLE_PRESETS.find((r) => r.value === key);
  return p ? [...p.roles] : null;
}

/** The products a company can switch on or off. `core` products are always on. */
export const MODULES = [
  { key: "workspace", label: "CommandOS", description: "Everyone's home screen", core: true },
  { key: "admin", label: "CommandOS Command Center", description: "Company dashboard, users & roles", core: true },
  { key: "messenger", label: "Huddle", description: "Channels, DMs, meetings, calls", core: true },
  { key: "hrms", label: "TalentOS", description: "Employees, attendance, leave, payroll, recruitment", core: false },
  { key: "pms", label: "SprintOS", description: "Clients, projects, tasks, timesheets, costing", core: false },
  { key: "lms", label: "DealFlow", description: "Leads, pipeline, campaigns, offers", core: false },
  { key: "fms", label: "CashFlow", description: "Invoices, payments, accounting, reports", core: false },
  { key: "prms", label: "SpendIQ", description: "Vendors, purchase orders, assets, expenses", core: false },
  { key: "tms", label: "Cohort AI", description: "Programs, batches, students, certificates", core: false },
  { key: "ots", label: "EvalIQ", description: "Assessments for hiring and training", core: false },
  { key: "sop", label: "Playbook", description: "Processes and acknowledgements", core: false },
  { key: 'lpms', label: "ContractFlow", description: 'Policies, agreements, certificates and document automation', core: false },
  { key: "dlms", label: "CyberVault", description: "Company & client documents and credentials", core: false },
  { key: "cms", label: "SiteCraft", description: "Your public website and pages", core: false },
  { key: "seo", label: "RankMax", description: "Search visibility and audits", core: false },
  { key: "smms", label: "ViralPulse", description: "Posts, campaigns and approvals", core: false },
  { key: "aibots", label: "AgentOS", description: "AI bots for your team", core: false },
  { key: "intelligence", label: "DataBrain", description: "Ask questions about your business data", core: false },
  { key: "portal", label: "ClientOS", description: "External portal for clients, students, applicants", core: false },
] as const;
export type ModuleKey = (typeof MODULES)[number]["key"];

/** Sensible default selection per industry (core modules are implied). */
export const DEFAULT_MODULES: Record<Industry, ModuleKey[]> = {
  software_services: ["hrms", "pms", "lms", "fms", "prms", "sop", "lpms", "dlms", "cms", "portal"],
  saas_product: ["hrms", "pms", "lms", "fms", "sop", "lpms", "dlms", "cms", "seo", "smms", "aibots"],
  digital_agency: ["hrms", "pms", "lms", "fms", "cms", "seo", "smms", "portal"],
  ai_data: ["hrms", "pms", "lms", "fms", "sop", "lpms", "dlms", "cms", "aibots", "portal"],
  it_consulting: ["hrms", "pms", "lms", "fms", "prms", "ots", "dlms", "portal"],
  training: ["hrms", "tms", "ots", "lms", "fms", "cms", "portal"],
};

export const ONBOARDING_STEPS = [
  { key: "profile", label: "Company profile" },
  { key: "structure", label: "Departments" },
  { key: "team", label: "Invite your team" },
  { key: "branding", label: "Branding" },
  { key: "modules", label: "Choose products" },
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]["key"];
