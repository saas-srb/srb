/**
 * CSV import: what can be imported, the CSV parser and header auto-mapping —
 * pure and client-safe (the settings page uses it to show the mapping).
 */

export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export const IMPORT_TYPES = ["leads", "clients", "employees"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export function isImportType(v: unknown): v is ImportType {
  return typeof v === "string" && (IMPORT_TYPES as readonly string[]).includes(v);
}

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  /** Header spellings that auto-map to this field (compared lower-case, letters and digits only). */
  aliases: string[];
  sample: string[];
}

export interface ImportTypeDef {
  type: ImportType;
  label: string;
  description: string;
  fields: ImportField[];
}

export const IMPORT_DEFS: Record<ImportType, ImportTypeDef> = {
  leads: {
    type: "leads",
    label: "Leads",
    description: "Added to CRM → Leads, the same as using the “New lead” form.",
    fields: [
      { key: "name", label: "Name", required: true, aliases: ["name", "fullname", "leadname", "contactname", "contact"], sample: ["Asha Verma", "Rohit Shah"] },
      { key: "email", label: "Email", required: true, aliases: ["email", "emailaddress", "mail"], sample: ["asha@example.com", "rohit@example.com"] },
      { key: "phone", label: "Phone", required: true, aliases: ["phone", "mobile", "phonenumber", "mobilenumber", "contactnumber", "tel", "telephone"], sample: ["+91 98765 43210", "+91 99887 76655"] },
      { key: "message", label: "Message / notes", aliases: ["message", "notes", "note", "requirement", "comments", "description"], sample: ["Needs a mobile app", "Website redesign"] },
    ],
  },
  clients: {
    type: "clients",
    label: "Clients",
    description: "Added to Projects → Clients.",
    fields: [
      { key: "companyName", label: "Company name", required: true, aliases: ["companyname", "company", "client", "clientname", "organisation", "organization", "account"], sample: ["Northwind Traders", "Blue Yonder Labs"] },
      { key: "contactName", label: "Contact name", required: true, aliases: ["contactname", "contact", "contactperson", "name", "primarycontact"], sample: ["Ravi Kumar", "Sara Khan"] },
      { key: "contactEmail", label: "Contact email", aliases: ["contactemail", "email", "emailaddress"], sample: ["ravi@northwind.example", "sara@blueyonder.example"] },
      { key: "contactPhone", label: "Contact phone", aliases: ["contactphone", "phone", "mobile", "phonenumber"], sample: ["+91 98111 22334", "+91 98222 33445"] },
      { key: "industry", label: "Industry", aliases: ["industry", "sector"], sample: ["Retail", "Software"] },
      { key: "website", label: "Website", aliases: ["website", "url", "site"], sample: ["https://northwind.example", "https://blueyonder.example"] },
      { key: "billingCity", label: "City", aliases: ["city", "billingcity"], sample: ["Mumbai", "Pune"] },
      { key: "billingCountry", label: "Country", aliases: ["country", "billingcountry"], sample: ["India", "India"] },
      { key: "billingGstin", label: "GSTIN", aliases: ["gstin", "gst", "gstnumber"], sample: ["", ""] },
      { key: "notes", label: "Notes", aliases: ["notes", "note", "comments"], sample: ["", "Referred by Northwind"] },
    ],
  },
  employees: {
    type: "employees",
    label: "Employees",
    description: "Added to HR → Employees as employee records. They can sign in only once invited.",
    fields: [
      { key: "firstName", label: "First name", required: true, aliases: ["firstname", "first", "givenname"], sample: ["Meera", "Arjun"] },
      { key: "lastName", label: "Last name", required: true, aliases: ["lastname", "last", "surname", "familyname"], sample: ["Nair", "Mehta"] },
      { key: "workEmail", label: "Work email", required: true, aliases: ["workemail", "email", "emailaddress", "officialemail", "companyemail"], sample: ["meera@yourcompany.example", "arjun@yourcompany.example"] },
      { key: "phone", label: "Phone", aliases: ["phone", "mobile", "phonenumber", "mobilenumber"], sample: ["+91 90000 11111", "+91 90000 22222"] },
      { key: "joiningDate", label: "Joining date (YYYY-MM-DD)", aliases: ["joiningdate", "dateofjoining", "doj", "startdate", "joined"], sample: ["2025-04-01", "2025-06-15"] },
      { key: "city", label: "City", aliases: ["city", "location"], sample: ["Kochi", "Ahmedabad"] },
    ],
  },
};

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180 parser: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF or LF, optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines carry nothing.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function csvEscape(value: string): string {
  // A leading = + - @ would run as a formula when the sample is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(value) && !/^[+\-]?[\d\s()]+$/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function sampleCsv(type: ImportType): string {
  const fields = IMPORT_DEFS[type].fields;
  const lines = [fields.map((f) => csvEscape(f.label)).join(",")];
  for (let i = 0; i < 2; i++) lines.push(fields.map((f) => csvEscape(f.sample[i] ?? "")).join(","));
  return lines.join("\r\n") + "\r\n";
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** field key → column index (or -1), matched by header name; each column is used at most once. */
export type ColumnMapping = Record<string, number>;

export function autoMap(type: ImportType, headers: readonly string[]): ColumnMapping {
  const fields = IMPORT_DEFS[type].fields;
  const normalized = headers.map(norm);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  // Exact label / key matches first, then aliases in order — so "Contact email" beats "Email" for contactEmail.
  for (const pass of [0, 1] as const) {
    for (const f of fields) {
      if (mapping[f.key] !== undefined && mapping[f.key] >= 0) continue;
      const candidates = pass === 0 ? [norm(f.label), norm(f.key)] : f.aliases;
      const idx = normalized.findIndex((h, i) => !used.has(i) && h !== "" && candidates.includes(h));
      mapping[f.key] = idx;
      if (idx >= 0) used.add(idx);
    }
  }
  return mapping;
}

export interface ImportRowIssue {
  /** 1-based line in the file, counting the header as line 1. */
  line: number;
  messages: string[];
}

export interface ImportPreview {
  ok: true;
  type: ImportType;
  total: number;
  valid: number;
  errors: ImportRowIssue[];
  duplicates: ImportRowIssue[];
  /** Employees with "send invitations": how many invitations the plan's free seats allow (null = unlimited / not inviting). */
  seatsFree: number | null;
  notes: string[];
}

export interface ImportOutcome extends ImportPreview {
  created: number;
  failed: ImportRowIssue[];
  invited: number;
  inviteIssues: ImportRowIssue[];
}

export type ImportFailure = { ok: false; error: string };
