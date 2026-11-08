import { getPrompt } from "@/lib/prompts/store";
import type { CatalogView, FieldDef, ViewEntity } from "@/lib/products/databrain-ai/catalog/types";
import { addDays } from "@/lib/products/databrain-ai/dates";
import { LIMITS } from "@/lib/products/databrain-ai/query/plan";

/** The model's instructions and the per-request catalog text. Pure (testable without a database). */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Calendar ranges the model should use verbatim for relative dates (computed in the company time zone). */
export function dateHints(today: string): string[] {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const monthStart = `${y}-${pad(m)}-01`;
  const monthEnd = `${y}-${pad(m)}-${lastDay(y, m)}`;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const q0 = Math.floor((m - 1) / 3) * 3 + 1;
  const fyStartYear = m >= 4 ? y : y - 1;
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  return [
    `today = ${today} (${WEEKDAYS[dow]})`,
    `this month = ${monthStart} to ${monthEnd}`,
    `last month = ${py}-${pad(pm)}-01 to ${py}-${pad(pm)}-${lastDay(py, pm)}`,
    `this quarter = ${y}-${pad(q0)}-01 to ${y}-${pad(q0 + 2)}-${lastDay(y, q0 + 2)}`,
    `this year = ${y}-01-01 to ${y}-12-31 (last year = ${y - 1}-01-01 to ${y - 1}-12-31)`,
    `financial year (India, April-March) = ${fyStartYear}-04-01 to ${fyStartYear + 1}-03-31`,
    `last 7 days = ${addDays(today, -6)} to ${today}; last 30 days = ${addDays(today, -29)} to ${today}; last 90 days = ${addDays(today, -89)} to ${today}`,
  ];
}

function typeText(f: FieldDef): string {
  switch (f.type) {
    case "enum":
      return `enum[${f.enumValues!.map((e) => e.value).join("|")}]`;
    case "money":
      return "money(rupees)";
    case "date":
      return f.storage === "isoDate" ? "date" : "datetime";
    default:
      return f.type;
  }
}

const CODE_TOKEN = /^[A-Za-z0-9_.-]{1,32}$/;

function entityText(e: ViewEntity): string {
  const stats: string[] = [];
  if (e.stats.count !== null) stats.push(`${e.stats.count} records`);
  if (e.stats.from && e.stats.to) stats.push(`${e.def.dateField ?? "date"} ${e.stats.from} to ${e.stats.to}`);
  const lines = [`- ${e.def.key} — ${e.def.label}${stats.length ? ` [${stats.join("; ")}]` : ""}: ${e.def.description}`];
  lines.push(`  fields: ${[...e.fields.values()].map((f) => `${f.key}${f.expr ? `(${f.label})` : ""}:${typeText(f)}`).join(", ")}`);
  // Live values come from company records, so they are DATA, not instructions: only short code-like tokens are shown here
  // (stages, currencies, leave codes); free-form values (names, industries …) reach the model only through the describe_entity tool result.
  const live = Object.entries(e.stats.values).flatMap(([k, v]) => {
    const tokens = v.filter((x) => CODE_TOKEN.test(x));
    return tokens.length === 0 ? [] : [`${k}=[${tokens.join("|")}]${tokens.length < v.length ? " (more: describe_entity)" : ""}`];
  });
  if (live.length) lines.push(`  values: ${live.join("; ")}`);
  if (e.relations.size) lines.push(`  joins (parent records): ${[...e.relations.values()].map((r) => `${r.key}->${r.to}`).join(", ")} — use "${[...e.relations.keys()][0]}.<field>" in select/filters`);
  return lines.join("\n");
}

export async function catalogText(view: CatalogView): Promise<string> {
  const parts = [view.entities.size ? [...view.entities.values()].map(entityText).join("\n") : await getPrompt("databrain.no_data")];
  if (view.restricted.length) parts.push(await getPrompt("databrain.restricted", { labels: view.restricted.map((r) => r.label).join(", ") }));
  return parts.join("\n");
}

/** The analyst's instructions: the "Data analyst instructions" prompt, with today's ranges and what this person may query filled in. */
export async function systemPrompt(view: CatalogView): Promise<string> {
  return getPrompt("databrain.system", { timezone: view.timezone, date_hints: dateHints(view.today).map((l) => `- ${l}`).join("\n"), max_joins: LIMITS.maxJoins, catalog: await catalogText(view) });
}

/** Describe-entity tool output for one entity (fields, valid values, relations). */
export function describeEntityText(e: ViewEntity): Record<string, unknown> {
  return {
    entity: e.def.key,
    label: e.def.label,
    description: e.def.description,
    records: e.stats.count,
    fields: [...e.fields.values()].map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type === "money" ? "money_rupees" : f.type,
      ...(f.enumValues ? { values: f.enumValues.map((v) => `${v.value} (${v.label})`) } : {}),
      ...(e.stats.values[f.key] ? { knownValues: e.stats.values[f.key] } : {}),
      filterable: f.filterable,
      groupable: f.groupable,
      aggregatable: f.aggregatable,
      ...(f.type === "date" ? { dateFormat: f.storage === "isoDate" ? "date" : "datetime (company time zone)" } : {}),
    })),
    relations: [...e.relations.values()].map((r) => ({ key: r.key, to: r.to, label: r.label })),
  };
}

// ── Example questions for the sidebar, from what this user can actually query ──

const EXAMPLES: Record<string, string[]> = {
  clients: ["How many active clients do we have?"],
  projects: ["Which projects are delayed?", "How many projects are in progress by priority?"],
  project_members: ["Which employees are assigned to each active project?"],
  tasks: ["How many tasks are overdue, by assignee?"],
  timesheets: ["How many hours were logged per project this month?"],
  employees: ["Which employees joined this year?", "How many employees are there in each department?"],
  leave_requests: ["How many leave requests are pending approval?"],
  leads: ["How many leads came in by source this month?"],
  invoices: ["What is this month's revenue?", "How much is unpaid, and which invoices are overdue?", "Show monthly revenue for this year as a chart."],
  receipts: ["How much did we collect last month?"],
  expenses: ["Show project-wise expenses."],
  vendors: ["How many active vendors do we have by category?"],
  purchase_orders: ["What is the total value of open purchase orders by vendor?"],
};
const CROSS: [string[], string][] = [
  [["invoices", "clients"], "Who are our top 5 clients by revenue?"],
  [["leads", "invoices"], "Give me a report on leads and revenue this quarter."],
];

export function exampleQuestions(view: CatalogView, max = 8): string[] {
  const out: string[] = [];
  for (const [need, q] of CROSS) if (need.every((k) => view.entities.has(k))) out.push(q);
  const pool = [...view.entities.keys()].map((k) => EXAMPLES[k] ?? []);
  for (let round = 0; out.length < max; round++) {
    const before = out.length;
    for (const list of pool) if (list[round] && out.length < max) out.push(list[round]);
    if (out.length === before) break;
  }
  return out.slice(0, max);
}
