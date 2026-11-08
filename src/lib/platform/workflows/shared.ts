/**
 * Workflow shapes, limits, validation, condition matching and `{{field}}`
 * templating — pure and client-safe (the settings form imports it too).
 */
import { eventFields, isEventType, type EventType } from "@/lib/platform/events/catalog";
import { escapeHtml } from "@/lib/platform/email/template";

export const MAX_WORKFLOWS_PER_COMPANY = 50;
export const MAX_ACTIONS_PER_WORKFLOW = 5;
export const MAX_CONDITIONS_PER_WORKFLOW = 10;

export const CONDITION_OPS = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "gt", label: "is greater than" },
  { value: "lt", label: "is less than" },
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number]["value"];

export interface WorkflowCondition {
  field: string;
  op: ConditionOp;
  value: string;
}

export type WorkflowAction =
  | { type: "email"; to: string; subject: string; body: string }
  | { type: "notify"; target: "role" | "user"; value: string; title: string; body: string }
  | { type: "whatsapp"; to: string; body: string }
  | { type: "webhook"; url: string };

export const ACTION_TYPES = [
  { value: "notify", label: "Send an in-app notification" },
  { value: "email", label: "Send an email" },
  { value: "whatsapp", label: "Send a WhatsApp message" },
  { value: "webhook", label: "Call a webhook" },
] as const;

export interface WorkflowInput {
  name: string;
  enabled: boolean;
  trigger: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
}

export interface WorkflowView extends WorkflowInput {
  id: string;
  trigger: EventType;
  /** Signs webhook calls (`X-Webhook-Signature`). */
  secret: string;
  lastRun: { status: "success" | "failed"; at: string; error: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunView {
  id: string;
  status: "success" | "failed";
  error: string | null;
  at: string;
  test: boolean;
  eventType: string;
  label: string | null;
  results: { action: string; ok: boolean; detail: string }[];
}

/** The flat values conditions and templates read: the event's data plus the built-ins. */
export type EventContext = Record<string, string | number | boolean | null>;

// ---------------------------------------------------------------------------
// Templating
// ---------------------------------------------------------------------------

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function valueOf(ctx: EventContext, field: string): string {
  // Own properties only: `{{constructor}}` and friends resolve to nothing.
  const v = Object.prototype.hasOwnProperty.call(ctx, field) ? ctx[field] : null;
  return v === null || v === undefined ? "" : String(v);
}

/** Replaces `{{field}}` with the event's value (unknown fields become empty). `html` escapes each value. */
export function renderTemplate(template: string, ctx: EventContext, opts: { html?: boolean } = {}): string {
  return template.replace(TOKEN, (_m, field: string) => (opts.html ? escapeHtml(valueOf(ctx, field)) : valueOf(ctx, field)));
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function matchesCondition(c: WorkflowCondition, ctx: EventContext): boolean {
  const actual = valueOf(ctx, c.field).trim();
  const expected = c.value.trim();
  switch (c.op) {
    case "eq":
      return actual.toLowerCase() === expected.toLowerCase();
    case "neq":
      return actual.toLowerCase() !== expected.toLowerCase();
    case "contains":
      return expected !== "" && actual.toLowerCase().includes(expected.toLowerCase());
    case "gt":
    case "lt": {
      const a = num(actual);
      const b = num(expected);
      if (a === null || b === null) return false;
      return c.op === "gt" ? a > b : a < b;
    }
    default:
      return false;
  }
}

/** All conditions must match (none = always). */
export function matchesAll(conditions: readonly WorkflowCondition[], ctx: EventContext): boolean {
  return conditions.every((c) => matchesCondition(c, ctx));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9 ()-]{6,18}$/;
const ONLY_TOKEN = /^\{\{\s*[a-zA-Z0-9_]+\s*\}\}$/;

export function isEmailAddress(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type ValidateResult = { ok: true; data: WorkflowInput & { trigger: EventType } } | { ok: false; error: string };

export function validateWorkflow(raw: unknown): ValidateResult {
  const input = (raw ?? {}) as Record<string, unknown>;
  const name = str(input.name, 120);
  if (!name) return { ok: false, error: "Give the automation a name." };
  if (!isEventType(input.trigger)) return { ok: false, error: "Choose what triggers this automation." };
  const trigger = input.trigger;
  const fields = new Set(eventFields(trigger).map((f) => f.key));

  const rawConditions = Array.isArray(input.conditions) ? input.conditions : [];
  if (rawConditions.length > MAX_CONDITIONS_PER_WORKFLOW) return { ok: false, error: `An automation can have at most ${MAX_CONDITIONS_PER_WORKFLOW} conditions.` };
  const conditions: WorkflowCondition[] = [];
  for (const rc of rawConditions) {
    const c = (rc ?? {}) as Record<string, unknown>;
    const field = str(c.field, 60);
    const op = str(c.op, 20);
    const value = str(c.value, 200);
    if (!fields.has(field)) return { ok: false, error: "A condition uses a field this trigger doesn't have." };
    if (!CONDITION_OPS.some((o) => o.value === op)) return { ok: false, error: "A condition has an unknown comparison." };
    if ((op === "gt" || op === "lt") && num(value) === null) return { ok: false, error: `"${field}" is compared as a number — enter a number.` };
    if (op === "contains" && !value) return { ok: false, error: `Enter the text "${field}" should contain.` };
    conditions.push({ field, op: op as ConditionOp, value });
  }

  const rawActions = Array.isArray(input.actions) ? input.actions : [];
  if (rawActions.length === 0) return { ok: false, error: "Add at least one action." };
  if (rawActions.length > MAX_ACTIONS_PER_WORKFLOW) return { ok: false, error: `An automation can have at most ${MAX_ACTIONS_PER_WORKFLOW} actions.` };
  const actions: WorkflowAction[] = [];
  for (const ra of rawActions) {
    const a = (ra ?? {}) as Record<string, unknown>;
    if (a.type === "email") {
      const to = str(a.to, 254);
      const subject = str(a.subject, 200);
      const body = typeof a.body === "string" ? a.body.trim().slice(0, 4000) : "";
      if (!isEmailAddress(to) && !ONLY_TOKEN.test(to)) return { ok: false, error: "Email action: enter an email address, or a field like {{actorEmail}}." };
      if (!subject) return { ok: false, error: "Email action: enter a subject." };
      if (!body) return { ok: false, error: "Email action: enter a message." };
      actions.push({ type: "email", to, subject, body });
    } else if (a.type === "notify") {
      const target = a.target === "user" ? "user" : "role";
      const value = str(a.value, 80);
      const title = str(a.title, 200);
      if (!value) return { ok: false, error: `Notification action: choose a ${target === "user" ? "person" : "role"}.` };
      if (!title) return { ok: false, error: "Notification action: enter a title." };
      actions.push({ type: "notify", target, value, title, body: str(a.body, 1000) });
    } else if (a.type === "whatsapp") {
      const to = str(a.to, 40);
      const body = typeof a.body === "string" ? a.body.trim().slice(0, 1000) : "";
      const label = "WhatsApp";
      if (!PHONE_RE.test(to) && !ONLY_TOKEN.test(to)) return { ok: false, error: `${label} action: enter a phone number with country code (+91…), or a field like {{phone}}.` };
      if (!body) return { ok: false, error: `${label} action: enter a message.` };
      actions.push({ type: a.type, to, body });
    } else if (a.type === "webhook") {
      const url = str(a.url, 2000);
      let parsed: URL | null = null;
      try {
        parsed = new URL(url);
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.protocol !== "https:") return { ok: false, error: "Webhook action: enter a full https:// URL." };
      if (parsed.username || parsed.password) return { ok: false, error: "Webhook action: the URL can't contain a username or password." };
      actions.push({ type: "webhook", url: parsed.toString() });
    } else {
      return { ok: false, error: "Unknown action type." };
    }
  }

  return { ok: true, data: { name, enabled: input.enabled !== false, trigger, conditions, actions } };
}
