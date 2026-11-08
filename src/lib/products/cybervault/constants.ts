/** Pure DLMS vocabulary — safe to import from client components. */

export type Option = { value: string; label: string };

export const SCOPES = ["company", "client"] as const;
export type Scope = (typeof SCOPES)[number];
export const SCOPE_LABEL: Record<Scope, string> = { company: "Company", client: "Client" };

export const RECORD_TYPES = ["credential", "document", "link", "note"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];
export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  credential: "Credential",
  document: "Document",
  link: "URL / Account",
  note: "Note",
};

export const STATUSES = ["active", "archived"] as const;
export type RecordStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<RecordStatus, string> = { active: "Active", archived: "Archived" };

/** Account type of a stored credential. */
export const CREDENTIAL_TYPES: Option[] = [
  { value: "admin", label: "Admin account" },
  { value: "hosting", label: "Hosting" },
  { value: "cloud", label: "Cloud" },
  { value: "domain", label: "Domain" },
  { value: "email", label: "Email" },
  { value: "social", label: "Social / platform" },
  { value: "government", label: "Government / official portal" },
  { value: "saas", label: "Software / SaaS" },
  { value: "api", label: "API credential" },
  { value: "database", label: "Database / server" },
  { value: "other", label: "Other" },
];

export const DOCUMENT_CATEGORIES: Option[] = [
  { value: "agreements", label: "Agreements" },
  { value: "contracts", label: "Contracts" },
  { value: "kyc", label: "KYC" },
  { value: "company_documents", label: "Company Documents" },
  { value: "client_documents", label: "Client Documents" },
  { value: "project_documents", label: "Project Documents" },
  { value: "certificates", label: "Certificates" },
  { value: "licenses", label: "Licenses" },
  { value: "government_documents", label: "Government Documents" },
  { value: "credentials_documents", label: "Credentials / Documents" },
  { value: "other", label: "Other" },
];

export const LINK_TYPES: Option[] = [
  { value: "website", label: "Website URL" },
  { value: "admin_url", label: "Admin URL" },
  { value: "hosting", label: "Hosting" },
  { value: "git", label: "Git repository" },
  { value: "cloud", label: "Cloud account" },
  { value: "email", label: "Email account" },
  { value: "domain", label: "Domain account" },
  { value: "third_party", label: "Third-party service" },
  { value: "government", label: "Government portal" },
  { value: "other", label: "Other link" },
];

export const NOTE_TYPES: Option[] = [
  { value: "access_instructions", label: "Access instructions" },
  { value: "setup", label: "Setup information" },
  { value: "deployment", label: "Deployment notes" },
  { value: "credential_info", label: "Credential information" },
  { value: "account_instructions", label: "Account instructions" },
  { value: "business_info", label: "Important business information" },
  { value: "general", label: "General" },
];

export const CATEGORY_OPTIONS: Record<RecordType, Option[]> = {
  credential: CREDENTIAL_TYPES,
  document: DOCUMENT_CATEGORIES,
  link: LINK_TYPES,
  note: NOTE_TYPES,
};

export function labelOf(options: Option[], value: string | null | undefined): string {
  return options.find((o) => o.value === value)?.label ?? (value ? value : "—");
}

export const EXPIRY_FILTERS: Option[] = [
  { value: "expired", label: "Expired" },
  { value: "expiring", label: "Expiring soon" },
  { value: "valid", label: "Valid" },
  { value: "none", label: "No expiry set" },
];

export type ExpiryState = "none" | "valid" | "expiring" | "expired";

export const LIMITS = {
  /** Vercel caps a request body at 4.5 MB — stay under it so uploads work in production. */
  fileBytes: 4 * 1024 * 1024,
  name: 160,
  text: 2000,
  note: 20000,
  secret: 2000,
  defaultWarnDays: 30,
  /** How long a revealed secret stays on screen before it re-masks. */
  revealSeconds: 30,
  pageSize: 200,
} as const;
