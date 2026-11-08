#!/usr/bin/env node
/**
 * A standalone mock of the OpenAI Responses API for the AI Intelligence product.
 * It plays the MODEL, deterministically, for ~12 demo questions: it asks for the
 * right run_query calls, reads the real results the server sends back, and ends
 * with a final_answer whose numbers come from those results. No network, no key.
 *
 * Browser test on a production build (the app reads OPENAI_BASE_URL itself):
 *
 *   node scripts/mock-openai-intelligence.mjs --port 4010          # terminal 1
 *   OPENAI_API_KEY=sk-mock OPENAI_BASE_URL=http://127.0.0.1:4010/v1 \
 *     npx next start                                               # terminal 2 (after `next build`)
 *
 * Questions it understands (case-insensitive; anything else gets a polite "what I can answer"):
 *   - "How many active clients do we have?"                 -> KPI
 *   - "What is this month's revenue?"                       -> KPI + sentence (needs Finance access; otherwise the "not available" answer)
 *   - "Which projects are delayed?"                         -> table
 *   - "Show monthly revenue for this year as a chart."      -> line chart + table
 *   - "Who are our top 5 clients by revenue?"               -> table + bar chart
 *   - "Show project-wise expenses."                         -> bar chart + table
 *   - "How much is unpaid?"                                 -> two KPIs
 *   - "Which employees joined this year?"                   -> table
 *   - "How many leads came in by source?"                   -> pie chart + table
 *   - "Which employees are assigned to each active project?"-> table
 *   - "hi" / "what can you do?"                             -> text, no queries
 *   - "What is the capital of France?"                      -> polite refusal (company data only)
 *
 * Tests can import { startMock } and pass extra scenarios (see scripts/test-intelligence-chat.ts).
 */
import http from "node:http";
import { pathToFileURL } from "node:url";

const TZ = "Asia/Kolkata";
const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
};
export function ranges(now = new Date()) {
  const today = isoDay(now);
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { today, year: y, monthStart: `${y}-${pad(m)}-01`, monthEnd: `${y}-${pad(m)}-${last}`, yearStart: `${y}-01-01`, yearEnd: `${y}-12-31` };
}

const REVENUE_STATUSES = ["sent", "partially_paid", "paid", "overdue"];
export const call = (name, args) => ({ kind: "call", name, args });
export const say = (text) => ({ kind: "text", text });
export const finish = (blocks) => call("final_answer", { blocks });
/** Makes the mock answer with an HTTP error (for failure-path tests). */
export const httpError = (status, message = "mock failure") => ({ kind: "http", status, message });
const inr = (n) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)}`;
const denied = (out) => typeof out?.error === "string" && /not available/i.test(out.error);
const UNAVAILABLE = "That information isn't available to you because of your access permissions in this workspace.";
const FAILED = "I couldn't run that analysis. Please try rephrasing the question.";

/** If the first tool result was an error, the final answer for it; otherwise null. */
function failure(ctx) {
  const out = ctx.outputs[0];
  if (!out || !out.error) return null;
  return finish([{ type: "text", text: denied(out) ? UNAVAILABLE : FAILED }]);
}

export const DEFAULT_SCENARIOS = [
  {
    match: /^(hi|hello|hey)\b|what can you (do|answer)|^help\b/i,
    run: () => finish([{ type: "text", text: "Hello! I'm your AI Data Analyst. I answer questions from your company's own data — for example clients, projects, employees, leads, invoices and expenses — as numbers, tables and charts. Try: \"How many active clients do we have?\"" }]),
  },
  {
    match: /capital of|weather|stock price|news|president|poem|joke|bitcoin|recipe/i,
    run: () => finish([{ type: "text", text: "I can only answer questions from your company's own data, so I can't help with that. Ask me about your clients, projects, people, leads or finances instead." }]),
  },
  {
    match: /how many (active )?clients|active clients/i,
    run: (ctx) => {
      if (ctx.step === 0) return call("run_query", { entity: "clients", aggregates: [{ op: "count", as: "active_clients" }], filters: [{ field: "status", op: "eq", value: "active" }] });
      return failure(ctx) ?? finish([{ type: "text", text: `You have ${ctx.outputs[0].rows[0].active_clients} active clients.` }, { type: "kpi", label: "Active clients", queryId: "q1", column: "active_clients" }]);
    },
  },
  {
    match: /top\s*(\d+\s*)?clients|best clients|biggest clients/i,
    run: (ctx) => {
      if (ctx.step === 0) return call("run_query", { entity: "invoices", select: [{ field: "customerName", as: "client" }], aggregates: [{ op: "sum", field: "totalAmount", as: "revenue" }], filters: [{ field: "status", op: "in", value: REVENUE_STATUSES }], sort: [{ by: "revenue", dir: "desc" }], limit: 5 });
      const f = failure(ctx);
      if (f) return f;
      const rows = ctx.outputs[0].rows;
      return finish([
        { type: "text", text: rows.length ? `${rows[0].client} is the top client by invoiced revenue (${inr(rows[0].revenue)}).` : "There are no invoices yet, so no data." },
        { type: "table", queryId: "q1", title: "Top clients by revenue" },
        { type: "chart", chartType: "bar", queryId: "q1", x: "client", y: ["revenue"], title: "Revenue by client (₹)" },
      ]);
    },
  },
  {
    match: /monthly revenue|revenue.*(chart|trend|by month)|(chart|trend).*revenue/i,
    run: (ctx) => {
      const r = ranges();
      if (ctx.step === 0) return call("run_query", { entity: "invoices", select: [{ field: "invoiceDate", bucket: "month", as: "month" }], aggregates: [{ op: "sum", field: "totalAmount", as: "revenue" }], filters: [{ field: "status", op: "in", value: REVENUE_STATUSES }, { field: "invoiceDate", op: "between", value: [r.yearStart, r.yearEnd] }] });
      const f = failure(ctx);
      if (f) return f;
      const o = ctx.outputs[0];
      return finish([
        { type: "text", text: o.rowCount ? `Invoiced revenue for ${r.year} across ${o.rowCount} month${o.rowCount === 1 ? "" : "s"} with invoices (total ${inr(o.totals?.revenue ?? 0)}).` : `No invoices were raised in ${r.year}: no data.` },
        { type: "chart", chartType: "line", queryId: "q1", x: "month", y: ["revenue"], title: `Monthly revenue ${r.year} (₹)` },
        { type: "table", queryId: "q1", title: "Revenue by month" },
      ]);
    },
  },
  {
    match: /project.?wise expenses|expenses? (by|per) project/i,
    run: (ctx) => {
      if (ctx.step === 0) return call("run_query", { entity: "expenses", select: [{ field: "projectName", as: "project" }], aggregates: [{ op: "sum", field: "amount", as: "spent" }], filters: [{ field: "projectId", op: "is_null", value: false }, { field: "approvalStatus", op: "in", value: ["approved", "reimbursed"] }], sort: [{ by: "spent", dir: "desc" }] });
      const f = failure(ctx);
      if (f) return f;
      const o = ctx.outputs[0];
      return finish([
        { type: "text", text: o.rowCount ? `Approved spend by project (before GST), highest first. Total ${inr(o.totals?.spent ?? 0)}.` : "No project expenses recorded: no data." },
        { type: "chart", chartType: "bar", queryId: "q1", x: "project", y: ["spent"], title: "Expenses by project (₹)" },
        { type: "table", queryId: "q1", title: "Project-wise expenses" },
      ]);
    },
  },
  {
    match: /unpaid|outstanding|owed|overdue invoices/i,
    run: (ctx) => {
      if (ctx.step === 0) return call("run_query", { entity: "invoices", aggregates: [{ op: "count", as: "open_invoices" }, { op: "sum", field: "balance", as: "balance_due" }], filters: [{ field: "status", op: "in", value: ["sent", "partially_paid", "overdue"] }] });
      const f = failure(ctx);
      if (f) return f;
      const row = ctx.outputs[0].rows[0];
      return finish([
        { type: "text", text: `${row.open_invoices} invoice${row.open_invoices === 1 ? " is" : "s are"} unpaid, with ${inr(row.balance_due ?? 0)} still due.` },
        { type: "kpi", label: "Unpaid invoices", queryId: "q1", column: "open_invoices" },
        { type: "kpi", label: "Balance due", queryId: "q1", column: "balance_due", format: "money" },
      ]);
    },
  },
  {
    match: /revenue|sales this month|income/i,
    run: (ctx) => {
      const r = ranges();
      if (ctx.step === 0) return call("run_query", { entity: "invoices", aggregates: [{ op: "sum", field: "totalAmount", as: "revenue" }, { op: "count", as: "invoices" }], filters: [{ field: "status", op: "in", value: REVENUE_STATUSES }, { field: "invoiceDate", op: "between", value: [r.monthStart, r.monthEnd] }] });
      const f = failure(ctx);
      if (f) return f;
      const row = ctx.outputs[0].rows[0];
      return finish([
        { type: "text", text: `This month's revenue (invoiced, excluding draft and cancelled invoices) is ${inr(row.revenue ?? 0)} across ${row.invoices} invoice${row.invoices === 1 ? "" : "s"}.` },
        { type: "kpi", label: "Revenue this month", queryId: "q1", column: "revenue", format: "money" },
      ]);
    },
  },
  {
    match: /delayed|overdue projects|late projects/i,
    run: (ctx) => {
      if (ctx.step === 0) return call("run_query", { entity: "projects", select: [{ field: "projectCode" }, { field: "name" }, { field: "status" }, { field: "endDate", as: "due_date" }, { field: "progressPercent", as: "progress" }], filters: [{ field: "isDelayed", op: "eq", value: true }], sort: [{ by: "due_date" }] });
      const f = failure(ctx);
      if (f) return f;
      const o = ctx.outputs[0];
      return finish([
        { type: "text", text: o.rowCount ? `${o.rowCount} active project${o.rowCount === 1 ? " is" : "s are"} past ${o.rowCount === 1 ? "its" : "their"} end date.` : "No projects are delayed." },
        ...(o.rowCount ? [{ type: "table", queryId: "q1", title: "Delayed projects" }] : []),
      ]);
    },
  },
  {
    match: /joined|new (hires|employees)/i,
    run: (ctx) => {
      const r = ranges();
      if (ctx.step === 0) return call("run_query", { entity: "employees", select: [{ field: "employeeCode" }, { field: "firstName" }, { field: "lastName" }, { field: "joiningDate" }], filters: [{ field: "joiningDate", op: "between", value: [r.yearStart, r.yearEnd] }], sort: [{ by: "joiningDate" }] });
      const f = failure(ctx);
      if (f) return f;
      const o = ctx.outputs[0];
      return finish([{ type: "text", text: o.rowCount ? `${o.rowCount} employee${o.rowCount === 1 ? "" : "s"} joined in ${r.year}.` : `Nobody joined in ${r.year}: no data.` }, ...(o.rowCount ? [{ type: "table", queryId: "q1", title: `Joined in ${r.year}` }] : [])]);
    },
  },
  {
    match: /leads?.*(source|channel)|by source/i,
    run: (ctx) => {
      if (ctx.step === 0) return call("run_query", { entity: "leads", select: [{ field: "source" }], aggregates: [{ op: "count", as: "leads" }], sort: [{ by: "leads", dir: "desc" }] });
      const f = failure(ctx);
      if (f) return f;
      const o = ctx.outputs[0];
      return finish([
        { type: "text", text: o.rowCount ? `${o.totals?.leads ?? 0} leads across ${o.rowCount} source${o.rowCount === 1 ? "" : "s"}.` : "No leads yet: no data." },
        ...(o.rowCount ? [{ type: "chart", chartType: "pie", queryId: "q1", x: "source", y: ["leads"], title: "Leads by source" }, { type: "table", queryId: "q1" }] : []),
      ]);
    },
  },
  {
    match: /assigned to|working on|team (members )?(of|on)/i,
    run: (ctx) => {
      if (ctx.step === 0) return call("run_query", { entity: "project_members", select: [{ field: "project.name", as: "project" }, { field: "employee.firstName", as: "first_name" }, { field: "employee.lastName", as: "last_name" }, { field: "role" }], filters: [{ field: "project.status", op: "in", value: ["planning", "in_progress", "review", "testing"] }, { field: "active", op: "eq", value: true }], sort: [{ by: "project" }, { by: "first_name" }] });
      const f = failure(ctx);
      if (f) return f;
      const o = ctx.outputs[0];
      return finish([{ type: "text", text: o.rowCount ? `${o.rowCount} active assignment${o.rowCount === 1 ? "" : "s"} on active projects.` : "Nobody is assigned to an active project: no data." }, ...(o.rowCount ? [{ type: "table", queryId: "q1", title: "Project team" }] : [])]);
    },
  },
  {
    match: /.*/,
    run: () => finish([{ type: "text", text: "I can answer questions about your company's data — clients, projects, people, leads, invoices and expenses. For example: \"How many active clients do we have?\" or \"Which projects are delayed?\"" }]),
  },
];

const lastUserIndex = (items) => {
  for (let i = items.length - 1; i >= 0; i--) if (items[i] && items[i].role === "user") return i;
  return -1;
};
const questionOf = (item) => (typeof item?.content === "string" ? item.content : Array.isArray(item?.content) ? item.content.map((c) => c.text ?? "").join(" ") : "");

/** Starts the mock. Returns { url, requests, hits(), close() }. `scenarios` run before the defaults. */
export function startMock({ port = 0, scenarios = [], tokensPerCall = 150 } = {}) {
  const requests = [];
  const all = [...scenarios, ...DEFAULT_SCENARIOS];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.method !== "POST" || !/\/responses$/.test(req.url ?? "")) {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "mock: only POST /v1/responses" } }));
      }
      const body = raw ? JSON.parse(raw) : {};
      requests.push(body);
      const items = Array.isArray(body.input) ? body.input : [];
      const qi = lastUserIndex(items);
      const question = questionOf(items[qi]);
      const after = items.slice(qi + 1);
      const outputs = after.filter((i) => i.type === "function_call_output").map((i) => {
        try {
          return JSON.parse(i.output);
        } catch {
          return { raw: i.output };
        }
      });
      const ctx = { question, step: outputs.length, outputs, body, history: items.slice(0, qi) };
      const scenario = all.find((s) => (s.match instanceof RegExp ? s.match.test(question) : s.match(question, ctx)));
      let step = scenario.run(ctx);
      // tool_choice forced to final_answer but the script wants another query: give a short text answer instead.
      if (body.tool_choice && typeof body.tool_choice === "object" && body.tool_choice.name === "final_answer" && step?.name !== "final_answer") step = finish([{ type: "text", text: "I couldn't complete that analysis." }]);
      const n = requests.length;
      if (step.kind === "http") {
        res.writeHead(step.status, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: step.message, type: "server_error" } }));
      }
      const output =
        step.kind === "call"
          ? [{ type: "function_call", id: `fc_${n}`, call_id: `call_${n}`, name: step.name, arguments: JSON.stringify(step.args), status: "completed" }]
          : [{ type: "message", id: `msg_${n}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: step.text, annotations: [] }] }];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: `resp_${n}`, object: "response", created_at: 0, status: "completed", model: body.model ?? "mock", output, usage: { input_tokens: Math.floor(tokensPerCall * 0.8), output_tokens: Math.ceil(tokensPerCall * 0.2), total_tokens: tokensPerCall } }));
    });
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => {
      const { port: p } = server.address();
      resolve({ url: `http://127.0.0.1:${p}/v1`, requests, hits: () => requests.length, close: () => server.close() });
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--port");
  const port = i > 0 ? Number(process.argv[i + 1]) : 4010;
  startMock({ port }).then((m) => console.log(`Mock OpenAI (AI Intelligence) listening on ${m.url}\nStart the app with OPENAI_API_KEY=sk-mock OPENAI_BASE_URL=${m.url}`));
}
