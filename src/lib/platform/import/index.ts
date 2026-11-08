import "server-only";
import { getDb } from "@/lib/mongodb";
import { countSeatsUsed, writeBlockReason } from "@/lib/platform/billing/enforce";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { withEventSource } from "@/lib/platform/events";
import { inviteTeammate } from "@/lib/platform/invitations";
import { validateLeadInput } from "@/lib/lead-validation";
import { provisionLeadAndAccount } from "@/lib/lead-management/provision";
import { LEAD_RECORDS_COLLECTION } from "@/lib/lead-management/records";
import { isPortalRole, type PortalRole } from "@/lib/portal-roles";
import { validateClient } from "@/lib/products/sprintos/validation";
import { CLIENTS_COLLECTION, createClient, type ClientWriteData } from "@/lib/products/sprintos/clients";
import { recordActivity } from "@/lib/products/sprintos/activity";
import { validateEmployeeCreate } from "@/lib/products/talentos/validation";
import { EMPLOYEES_COLLECTION, createEmployee, type EmployeeWriteData } from "@/lib/products/talentos/employees";
import { rebuildHierarchyFor } from "@/lib/products/talentos/hierarchy";
import { recordAudit } from "@/lib/products/talentos/audit";
import {
  IMPORT_DEFS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  isImportType,
  parseCsv,
  type ColumnMapping,
  type ImportFailure,
  type ImportOutcome,
  type ImportPreview,
  type ImportRowIssue,
  type ImportType,
} from "@/lib/platform/import/shared";

/**
 * CSV import for leads, clients and employees. Rows are validated with each
 * product's own validator and created through each product's own create function
 * — so numbering, events, activity/audit logs and plan limits behave exactly
 * as if the rows had been typed in. Runs inside the request (≤ 1,000 rows).
 *
 * Duplicates (same email or phone as an earlier row in the file, or as an
 * existing record) are skipped, never merged.
 */

export interface ImportRequest {
  type: unknown;
  csv: unknown;
  mapping: unknown;
  /** Leads: which kind of lead (portal role). Defaults to "client". */
  leadType?: unknown;
  /** Employees: also email each one a workspace invitation (uses a seat each). Off unless explicitly true. */
  sendInvites?: unknown;
}

export interface ImportActor {
  id: string;
  email: string;
}

type Prepared =
  | { kind: "leads"; data: { name: string; email: string; phone: string; message?: string } }
  | { kind: "clients"; data: ClientWriteData }
  | { kind: "employees"; data: EmployeeWriteData };

interface Row {
  line: number;
  email: string | null;
  phone: string | null;
  prepared: Prepared;
}

interface Analysis {
  preview: ImportPreview;
  rows: Row[];
  leadType: PortalRole;
  sendInvites: boolean;
}

/** The invite role for imported employees: the standard team-member preset (editable later in Users & roles). */
const INVITE_PRESET = "developer";

function prepare(type: ImportType, input: Record<string, string>): { ok: true; row: Omit<Row, "line"> } | { ok: false; messages: string[] } {
  if (type === "leads") {
    const v = validateLeadInput(input);
    if (!v.valid) return { ok: false, messages: Object.values(v.errors) };
    return { ok: true, row: { email: v.data.email.toLowerCase(), phone: v.data.phone, prepared: { kind: "leads", data: { name: v.data.name, email: v.data.email, phone: v.data.phone, message: v.data.message } } } };
  }
  if (type === "clients") {
    const v = validateClient(input);
    if (!v.valid) return { ok: false, messages: Object.values(v.errors) };
    return { ok: true, row: { email: v.data.primaryContact.email?.toLowerCase() ?? null, phone: v.data.primaryContact.phone, prepared: { kind: "clients", data: v.data } } };
  }
  const v = validateEmployeeCreate(input);
  if (!v.valid) return { ok: false, messages: Object.values(v.errors) };
  return { ok: true, row: { email: v.data.workEmail, phone: v.data.personal.phone, prepared: { kind: "employees", data: v.data } } };
}

const DUPLICATE_FIELDS: Record<ImportType, { collection: string; email: string; phone: string }> = {
  leads: { collection: LEAD_RECORDS_COLLECTION, email: "email", phone: "phone" },
  clients: { collection: CLIENTS_COLLECTION, email: "primaryContact.email", phone: "primaryContact.phone" },
  employees: { collection: EMPLOYEES_COLLECTION, email: "workEmail", phone: "personal.phone" },
};

function pick(doc: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), doc);
}

async function existingKeys(type: ImportType, rows: Row[]): Promise<{ emails: Set<string>; phones: Set<string> }> {
  const f = DUPLICATE_FIELDS[type];
  const emails = [...new Set(rows.map((r) => r.email).filter((v): v is string => !!v))];
  const phones = [...new Set(rows.map((r) => r.phone).filter((v): v is string => !!v))];
  const or: Record<string, unknown>[] = [];
  // Stored emails may not be lower-cased everywhere, so match case-insensitively via a collation.
  if (emails.length) or.push({ [f.email]: { $in: emails } });
  if (phones.length) or.push({ [f.phone]: { $in: phones } });
  if (or.length === 0) return { emails: new Set(), phones: new Set() };
  const docs = await (await getDb())
    .collection(f.collection)
    .find({ deletedAt: null, $or: or }, { projection: { [f.email]: 1, [f.phone]: 1 }, collation: { locale: "en", strength: 2 } })
    .toArray();
  return {
    emails: new Set(docs.map((d) => pick(d, f.email)).filter((v): v is string => typeof v === "string").map((v) => v.toLowerCase())),
    phones: new Set(docs.map((d) => pick(d, f.phone)).filter((v): v is string => typeof v === "string")),
  };
}

async function freeSeats(): Promise<number | null> {
  const limit = (await getEntitlements()).limits.seats;
  if (limit === null) return null;
  const [used, pending] = await Promise.all([countSeatsUsed(), (await getDb()).collection("company_invitations").countDocuments({ status: "pending", expiresAt: { $gt: new Date() } })]);
  return Math.max(0, limit - used - pending);
}

async function analyze(req: ImportRequest): Promise<Analysis | ImportFailure> {
  if (!isImportType(req.type)) return { ok: false, error: "Choose what to import: leads, clients or employees." };
  const type = req.type;
  const def = IMPORT_DEFS[type];
  if (typeof req.csv !== "string" || req.csv.trim() === "") return { ok: false, error: "The file is empty." };
  if (Buffer.byteLength(req.csv, "utf8") > IMPORT_MAX_BYTES) return { ok: false, error: "The file is larger than 2 MB. Split it into smaller files." };

  const table = parseCsv(req.csv);
  if (table.length < 2) return { ok: false, error: "The file needs a header row and at least one row of data." };
  const header = table[0];
  const body = table.slice(1);
  if (body.length > IMPORT_MAX_ROWS) return { ok: false, error: `The file has ${body.length.toLocaleString("en-IN")} rows; the limit is ${IMPORT_MAX_ROWS.toLocaleString("en-IN")} per file. Split it into smaller files.` };

  const rawMapping = (req.mapping && typeof req.mapping === "object" ? req.mapping : {}) as Record<string, unknown>;
  const mapping: ColumnMapping = {};
  const usedColumns = new Set<number>();
  for (const f of def.fields) {
    const idx = Number(rawMapping[f.key]);
    const valid = Number.isInteger(idx) && idx >= 0 && idx < header.length;
    if (valid && usedColumns.has(idx)) return { ok: false, error: `Column "${header[idx]}" is mapped to more than one field.` };
    if (valid) usedColumns.add(idx);
    mapping[f.key] = valid ? idx : -1;
    if (f.required && !valid) return { ok: false, error: `Choose which column holds "${f.label}".` };
  }

  const errors: ImportRowIssue[] = [];
  const duplicates: ImportRowIssue[] = [];
  const candidates: Row[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const input: Record<string, string> = {};
    for (const f of def.fields) input[f.key] = mapping[f.key] >= 0 ? (cells[mapping[f.key]] ?? "").trim() : "";
    const p = prepare(type, input);
    if (p.ok) candidates.push({ line, ...p.row });
    else errors.push({ line, messages: p.messages });
  });

  const existing = await existingKeys(type, candidates);
  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, number>();
  const rows: Row[] = [];
  for (const row of candidates) {
    const why: string[] = [];
    if (row.email && existing.emails.has(row.email)) why.push(`${row.email} already exists.`);
    else if (row.email && seenEmail.has(row.email)) why.push(`Same email as line ${seenEmail.get(row.email)}.`);
    if (row.phone && existing.phones.has(row.phone)) why.push(`Phone ${row.phone} already exists.`);
    else if (row.phone && seenPhone.has(row.phone)) why.push(`Same phone as line ${seenPhone.get(row.phone)}.`);
    if (why.length) {
      duplicates.push({ line: row.line, messages: why });
      continue;
    }
    if (row.email) seenEmail.set(row.email, row.line);
    if (row.phone) seenPhone.set(row.phone, row.line);
    rows.push(row);
  }

  const sendInvites = type === "employees" && req.sendInvites === true;
  const notes: string[] = [];
  let seatsFree: number | null = null;
  if (sendInvites) {
    seatsFree = await freeSeats();
    if (seatsFree !== null && seatsFree < rows.length) {
      notes.push(
        seatsFree === 0
          ? "Your plan has no free user seats, so no invitations will be sent. The employee records are still created; add seats in Settings → Billing to invite them later."
          : `Your plan has ${seatsFree} free user seat${seatsFree === 1 ? "" : "s"}: the first ${seatsFree} employee${seatsFree === 1 ? "" : "s"} will be invited, the rest are created without an invitation.`,
      );
    }
  } else if (type === "employees") {
    notes.push("No invitation emails will be sent. Employees are added as records; invite them later from Users & roles.");
  }

  return {
    rows,
    leadType: isPortalRole(req.leadType) ? req.leadType : "client",
    sendInvites,
    preview: { ok: true, type, total: body.length, valid: rows.length, errors, duplicates, seatsFree, notes },
  };
}

/** Dry run: what would happen, without writing anything. */
export async function previewImport(req: ImportRequest): Promise<ImportPreview | ImportFailure> {
  const a = await analyze(req);
  return "preview" in a ? a.preview : a;
}

async function createRow(row: Row, leadType: PortalRole, actor: ImportActor): Promise<void> {
  const p = row.prepared;
  if (p.kind === "leads") {
    // The CRM's own lead path, in quiet mode: the lead record plus the account record the pipeline
    // links to, but no wallet sign-up bonus, referral reward, welcome notification or chat message.
    await provisionLeadAndAccount({ source: "manual", type: leadType, name: p.data.name, email: p.data.email, phone: p.data.phone, message: p.data.message ?? null, actorId: actor.id, quiet: true });
  } else if (p.kind === "clients") {
    const client = await createClient(p.data, actor.id);
    await recordActivity({ actorId: actor.id, actorEmail: actor.email, action: "create", entity: "client", entityId: client._id, entityLabel: client.companyName, summary: "Imported from CSV" });
  } else {
    const employee = await createEmployee(p.data, actor.id);
    await rebuildHierarchyFor(employee._id);
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "create", entity: "employee", entityId: employee._id, entityLabel: `${employee.firstName} ${employee.lastName} (${employee.employeeCode})`, summary: "Imported from CSV" });
  }
}

/** Validates again, then creates every valid, non-duplicate row. `origin` is this workspace's origin (for invitation links). */
export async function runImport(req: ImportRequest, actor: ImportActor, origin: string): Promise<ImportOutcome | ImportFailure> {
  const readOnly = await writeBlockReason();
  if (readOnly) return { ok: false, error: readOnly };
  const a = await analyze(req);
  if (!("preview" in a)) return a;

  const failed: ImportRowIssue[] = [];
  const inviteIssues: ImportRowIssue[] = [];
  let created = 0;
  let invited = 0;
  await withEventSource("import", async () => {
    for (const row of a.rows) {
      try {
        await createRow(row, a.leadType, actor);
        created++;
      } catch (err) {
        console.error(`[import] ${a.preview.type} line ${row.line} failed`, err);
        failed.push({ line: row.line, messages: ["Couldn't be saved. Check the row and try again."] });
        continue;
      }
      if (a.sendInvites && row.prepared.kind === "employees") {
        const e = row.prepared.data;
        // `inviteTeammate` enforces the plan's seat limit (active users + invitations already out).
        const res = await inviteTeammate({ email: e.workEmail, name: `${e.firstName} ${e.lastName}`.trim(), preset: INVITE_PRESET, departmentId: e.professional.departmentId }, actor, origin);
        if (res.ok) invited++;
        else inviteIssues.push({ line: row.line, messages: [res.error] });
      }
    }
  });
  return { ...a.preview, created, failed, invited, inviteIssues };
}
