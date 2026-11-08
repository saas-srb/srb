/**
 * The business events the platform knows about — client-safe, no data access.
 * `fields` are what workflow conditions and `{{field}}` templates can read;
 * every event also carries the built-ins in `COMMON_FIELDS`.
 */

export interface EventFieldDef {
  key: string;
  label: string;
}

export interface EventTypeDef {
  type: string;
  label: string;
  /** Which area of the product it belongs to — decides who may see it (see `access.ts`). */
  area: "leads" | "clients" | "projects" | "tasks" | "invoices" | "employees" | "leave" | "intelligence";
  fields: EventFieldDef[];
  /** Used by "Send test" and as placeholder help in the workflow form. */
  sample: Record<string, string | number | boolean>;
}

export const COMMON_FIELDS: EventFieldDef[] = [
  { key: "label", label: "Record name" },
  { key: "url", label: "Link to the record" },
  { key: "actorEmail", label: "Who did it (email)" },
  { key: "source", label: "How it happened (app or import)" },
];

export const EVENT_TYPES = [
  {
    type: "lead.created",
    label: "Lead created",
    area: "leads",
    fields: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "code", label: "Lead code" },
      { key: "leadType", label: "Lead type (client, trainee, intern, job_applicant)" },
      { key: "leadSource", label: "Lead source" },
    ],
    sample: { name: "Asha Verma", email: "asha@example.com", phone: "+91 98765 43210", code: "LEAD-2026-0001", leadType: "client", leadSource: "manual" },
  },
  {
    type: "lead.status_changed",
    label: "Lead status changed",
    area: "leads",
    fields: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "status", label: "New stage" },
      { key: "previousStatus", label: "Previous stage" },
      { key: "outcome", label: "Outcome (open, won or lost)" },
      { key: "won", label: "Won (true / false)" },
    ],
    sample: { name: "Asha Verma", email: "asha@example.com", status: "project_started", previousStatus: "proposal_sent", outcome: "won", won: true },
  },
  {
    type: "client.created",
    label: "Client created",
    area: "clients",
    fields: [
      { key: "companyName", label: "Company name" },
      { key: "clientCode", label: "Client code" },
      { key: "contactName", label: "Contact name" },
      { key: "contactEmail", label: "Contact email" },
      { key: "industry", label: "Industry" },
    ],
    sample: { companyName: "Northwind Traders", clientCode: "CLI-0001", contactName: "Ravi Kumar", contactEmail: "ravi@example.com", industry: "Retail" },
  },
  {
    type: "project.created",
    label: "Project created",
    area: "projects",
    fields: [
      { key: "name", label: "Project name" },
      { key: "projectCode", label: "Project code" },
      { key: "priority", label: "Priority" },
      { key: "status", label: "Status" },
      { key: "estimatedBudget", label: "Estimated budget" },
    ],
    sample: { name: "Website redesign", projectCode: "PRJ-0001", priority: "high", status: "planning", estimatedBudget: 500000 },
  },
  {
    type: "task.created",
    label: "Task created",
    area: "tasks",
    fields: [
      { key: "title", label: "Title" },
      { key: "taskCode", label: "Task code" },
      { key: "priority", label: "Priority" },
      { key: "dueDate", label: "Due date" },
    ],
    sample: { title: "Design the home page", taskCode: "TSK-0001", priority: "medium", dueDate: "2026-01-15" },
  },
  {
    type: "task.completed",
    label: "Task completed",
    area: "tasks",
    fields: [
      { key: "title", label: "Title" },
      { key: "taskCode", label: "Task code" },
      { key: "priority", label: "Priority" },
    ],
    sample: { title: "Design the home page", taskCode: "TSK-0001", priority: "medium" },
  },
  {
    type: "invoice.created",
    label: "Invoice created",
    area: "invoices",
    fields: [
      { key: "invoiceNumber", label: "Invoice number" },
      { key: "customerName", label: "Customer" },
      { key: "totalAmount", label: "Total amount" },
      { key: "currency", label: "Currency" },
      { key: "dueDate", label: "Due date" },
    ],
    sample: { invoiceNumber: "INV-2026-0001", customerName: "Northwind Traders", totalAmount: 118000, currency: "INR", dueDate: "2026-01-31" },
  },
  {
    type: "invoice.paid",
    label: "Invoice paid",
    area: "invoices",
    fields: [
      { key: "invoiceNumber", label: "Invoice number" },
      { key: "customerName", label: "Customer" },
      { key: "totalAmount", label: "Total amount" },
      { key: "currency", label: "Currency" },
    ],
    sample: { invoiceNumber: "INV-2026-0001", customerName: "Northwind Traders", totalAmount: 118000, currency: "INR" },
  },
  {
    type: "employee.created",
    label: "Employee added",
    area: "employees",
    fields: [
      { key: "name", label: "Name" },
      { key: "workEmail", label: "Work email" },
      { key: "employeeCode", label: "Employee code" },
    ],
    sample: { name: "Meera Nair", workEmail: "meera@example.com", employeeCode: "YO-0042" },
  },
  {
    type: "leave.requested",
    label: "Leave requested",
    area: "leave",
    fields: [
      { key: "leaveType", label: "Leave type" },
      { key: "days", label: "Days" },
      { key: "startDate", label: "From" },
      { key: "endDate", label: "To" },
      { key: "reason", label: "Reason" },
    ],
    sample: { leaveType: "CL", days: 2, startDate: "2026-01-12", endDate: "2026-01-13", reason: "Family function" },
  },
  {
    // Audit trail of AI Intelligence questions. Never carries answer data or rows — only the question (capped) and what was touched.
    type: "intelligence.question",
    label: "AI question asked",
    area: "intelligence",
    fields: [
      { key: "question", label: "Question" },
      { key: "entities", label: "Data areas queried" },
      { key: "queries", label: "Queries run" },
      { key: "rows", label: "Rows returned" },
      { key: "outcome", label: "Outcome (answered, refused or failed)" },
    ],
    sample: { question: "How many active clients do we have?", entities: "clients", queries: 1, rows: 1, outcome: "answered" },
  },
] as const satisfies readonly EventTypeDef[];

export type EventType = (typeof EVENT_TYPES)[number]["type"];
export type EventArea = EventTypeDef["area"];

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && EVENT_TYPES.some((e) => e.type === value);
}

export function eventDef(type: string): EventTypeDef | undefined {
  return EVENT_TYPES.find((e) => e.type === type);
}

export function eventLabel(type: string): string {
  return eventDef(type)?.label ?? type;
}

/** Every field a condition or template may reference for an event type. */
export function eventFields(type: string): EventFieldDef[] {
  return [...(eventDef(type)?.fields ?? []), ...COMMON_FIELDS];
}
