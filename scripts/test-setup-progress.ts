import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { STEPS, NOT_PART_OF_SETUP } from "../src/lib/platform/setup-progress/registry";
import { buildProgress, evaluateStep, nextSteps, scoreOf, summarize } from "../src/lib/platform/setup-progress/scoring";
import { GROUPS, NO_MARKS, PARTIAL_DEFAULT, TIER_WEIGHT, type SetupFacts, type StepDef } from "../src/lib/platform/setup-progress/types";
import { connectionState } from "../src/lib/platform/setup-progress/connection-state";
import { STATUS_CHIP, filterSteps, readSetupFilter } from "../src/lib/platform/setup-progress/filter";
import { isStuck, nextBelowSince } from "../src/lib/platform/setup-progress/platform";
import { CONNECTION_PROVIDERS, HIDDEN_FROM_COMPANIES } from "../src/lib/platform/connections/catalog";
import { PRODUCT_GROUPS } from "../src/app/(products)/commandos/(protected)/settings/products/product-groups";
import { ONBOARDING_STEPS, MODULES } from "../src/lib/platform/onboarding/catalog";
import { NAV_ITEMS, NAV_KEYS } from "../src/lib/products/commandos/nav";
import { IDENTITY_FIELDS } from "../src/lib/platform/company-identity/shared";
import { CRON_JOBS } from "../src/lib/cron/registry";

// Pure and static: the registry, the scoring, the checks with fakes, the coverage guarantee, the reminders rules. Run: npm run test:setup-progress
let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const read = (p: string) => readFileSync(p, "utf8");
const NOW = new Date("2026-11-16T10:00:00Z");

/** A company with everything done: the base every fake starts from. */
function allDone(over: Partial<SetupFacts> = {}): SetupFacts {
  const conn = (state: "done" | "partial" | "todo" = "done") => ({ state, detail: state });
  const ids = ["smtp", "resend", "sendgrid", "vapid", "razorpay", "openai", "ai-chatbot", "elevenlabs", "gemini", "twilio", "whatsapp-cloud", "livekit", "turn", "storage", "google-service-account", "pagespeed", "meta", "google", "linkedin", "x", "social-accounts", "website-tracking", "webhooks", "dealflow-sync", "domains"];
  const identity: Record<string, string | number> = Object.fromEntries(IDENTITY_FIELDS.map((k) => [k, k === "fiscalYearStartMonth" ? 4 : "x"]));
  const modules = MODULES.map((m) => m.key as string);
  const reviewed = Object.fromEntries(STEPS.filter((s) => s.manual).map((s) => [s.id, { at: "2026-11-01T00:00:00Z", by: "u" }]));
  return {
    failed: [], now: NOW, marks: { reviewed, notApplicable: {} },
    identity: { values: identity, saved: true }, onboarding: { completedSteps: ONBOARDING_STEPS.map((s) => s.key) }, modules: { on: modules },
    org: { departments: 3, teams: 2, designations: 4 }, people: { active: 5, directors: 2, pendingInvites: 0, staffWithAccess: 3 },
    connections: Object.fromEntries(ids.map((k) => [k, conn()])), domain: { customVerified: true, customPending: false }, sender: { status: "verified" }, branding: { logo: true },
    billing: { internal: false, status: "active", hasPlan: true, hasBillingDetails: true, trialDaysLeft: null, paying: true },
    security: { directors: 2, directorsWithTwoStep: 2, emailVerified: true, backups: 2 }, engagement: { pushReady: true, knowledgeItems: 4 },
    productSettings: Object.fromEntries(modules.map((m) => [m, true])), usage: Object.fromEntries(modules.map((m) => [m, 3])),
    registry: Object.fromEntries(modules.map((m) => [m, ["email", "push", "openai", "ai-chatbot", "elevenlabs", "razorpay", "twilio", "whatsapp-cloud", "livekit", "turn", "gemini", "google-service-account", "pagespeed", "meta", "google", "linkedin", "x", "social-accounts", "website-tracking", "storage", "domains"]])),
    ...over,
  };
}
const stepOf = (id: string) => STEPS.find((s) => s.id === id)!;
const state = (id: string, f: SetupFacts) => evaluateStep(stepOf(id), f);

console.log("scoring");
const mk = (id: string, tier: StepDef["tier"], check: StepDef["check"]): StepDef => ({ id, group: "company", title: id, description: id, why: id, tier, minutes: 2, href: "/x", feature: "company.setup", needs: [], covers: [], check });
const done = () => ({ status: "done" as const, detail: "" });
const todo = () => ({ status: "todo" as const, detail: "" });
const base: SetupFacts = { failed: [], now: NOW, marks: NO_MARKS };
T("weights by tier: required 3, recommended 2, optional 1; partial counts a fraction; the percentage is weighted done over weighted applicable", () => {
  assert.deepEqual(TIER_WEIGHT, { required: 3, recommended: 2, optional: 1 });
  const defs = [mk("a", "required", done), mk("b", "recommended", todo), mk("c", "optional", todo)];
  assert.equal(buildProgress(defs, base).summary.percent, 50); // 3 of 6
  const half = [mk("a", "required", done), mk("b", "recommended", () => ({ status: "partial", detail: "", fraction: 0.5 })), mk("c", "optional", todo)];
  assert.equal(buildProgress(half, base).summary.percent, 66); // (3 + 1) / 6
  assert.equal(PARTIAL_DEFAULT, 0.5);
  assert.equal(scoreOf("partial"), 0.5);
  assert.equal(scoreOf("partial", 2), 1, "a fraction is clamped to 0..1");
  assert.equal(scoreOf("notApplicable"), null);
});
T("'not applicable' and 'could not check' steps are left out of both sides", () => {
  const f = { ...base, marks: { reviewed: {}, notApplicable: { c: { reason: "we have none", at: "x", by: "u" } } } };
  const defs = [mk("a", "required", done), mk("c", "optional", todo)];
  const p = buildProgress(defs, f);
  assert.deepEqual([p.summary.percent, p.summary.applicable, p.summary.notApplicable], [100, 1, 1]);
  const unknownDef: StepDef = { ...mk("u", "required", done), needs: ["org"] };
  const q = buildProgress([mk("a", "required", done), unknownDef], { ...base, failed: ["org"] });
  assert.equal(q.summary.unknown, 1);
  assert.equal(q.summary.applicable, 1);
  assert.equal(q.steps[1].status, "unknown");
  assert.equal(q.summary.percent, 99, "never 100 while a step could not be checked");
});
T("100% means exactly one thing: every step that applies is done; one open step keeps it at 99 or lower", () => {
  const defs = [mk("a", "required", done), mk("b", "required", done), mk("c", "optional", done)];
  assert.deepEqual([buildProgress(defs, base).summary.percent, buildProgress(defs, base).summary.complete], [100, true]);
  const nearly = [...Array(40)].map((_, i) => mk(`s${i}`, "optional", i === 0 ? todo : done));
  assert.equal(buildProgress(nearly, base).summary.percent, 97);
  const huge = [...Array(1000)].map((_, i) => mk(`h${i}`, "optional", i === 0 ? todo : done));
  assert.equal(buildProgress(huge, base).summary.percent, 99, "999 of 1000 rounds down, never up to 100");
  assert.equal(buildProgress([], base).summary.percent, 100, "nothing applies: complete");
});
T("a Director may mark OPTIONAL steps not applicable, never required or recommended ones", () => {
  const marks = { reviewed: {}, notApplicable: { r: { reason: "x", at: "x", by: "u" }, rec: { reason: "x", at: "x", by: "u" }, o: { reason: "no need", at: "x", by: "u" } } };
  const f = { ...base, marks };
  assert.equal(evaluateStep(mk("r", "required", todo), f).status, "todo");
  assert.equal(evaluateStep(mk("rec", "recommended", todo), f).status, "todo");
  const o = evaluateStep(mk("o", "optional", todo), f);
  assert.deepEqual([o.status, o.mark, o.detail], ["notApplicable", "notApplicable", "Marked not applicable: no need"]);
  assert.equal(evaluateStep(mk("o2", "optional", todo), base).canMarkNotApplicable, true);
  assert.equal(evaluateStep(mk("r2", "required", todo), base).canMarkNotApplicable, false);
});
T("a 'reviewed' mark completes a step that cannot be derived, and only those", () => {
  const manual = { ...mk("m", "recommended", todo), manual: true };
  assert.equal(evaluateStep(manual, base).status, "todo");
  assert.equal(evaluateStep(manual, { ...base, marks: { reviewed: { m: { at: "2026-11-16T00:00:00Z", by: "u" } }, notApplicable: {} } }).status, "done");
  assert.equal(evaluateStep(mk("n", "recommended", todo), { ...base, marks: { reviewed: { n: { at: "x", by: "u" } }, notApplicable: {} } }).status, "todo", "a derived step ignores a stray reviewed mark");
});
T("products appear and disappear as they are switched on and off, and the percentage recalculates; only products that are on count", () => {
  const defs: StepDef[] = [mk("core", "required", done), { ...mk("p1", "required", todo), product: "pms" }, { ...mk("p2", "required", done), product: "hrms" }];
  const off = buildProgress(defs, { ...base, modules: { on: [] } });
  assert.deepEqual([off.summary.applicable, off.summary.percent], [1, 100]);
  const on = buildProgress(defs, { ...base, modules: { on: ["pms", "hrms"] } });
  assert.deepEqual([on.summary.applicable, on.summary.percent], [3, 66]);
  assert.deepEqual(on.summary.products.map((p) => [p.module, p.percent]).sort(), [["hrms", 100], ["pms", 0]]);
  const none = buildProgress(defs, { ...base, modules: { on: ["hrms"] } });
  assert.equal(none.steps.find((s) => s.id === "p1")!.status, "notApplicable");
});
T("a check that throws is 'could not check', never a crash; the rest still count", () => {
  const boom = mk("boom", "required", () => { throw new Error("x"); });
  const p = buildProgress([boom, mk("ok", "required", done)], base);
  assert.equal(p.steps[0].status, "unknown");
  assert.equal(p.summary.percent, 99);
});
T("minutes left add up what is not done (a partial step counts half), and the next steps are required first, never blocked", () => {
  const defs = [{ ...mk("a", "optional", todo), minutes: 10 }, { ...mk("b", "required", todo), minutes: 5 }, { ...mk("c", "required", done), minutes: 99 }, { ...mk("d", "required", todo), minutes: 1, dependsOn: ["b"] }];
  const p = buildProgress(defs, base);
  assert.equal(p.summary.minutesLeft, 16);
  assert.deepEqual(p.next.map((s) => s.id), ["b", "a"], "d waits for b; required before optional");
  assert.deepEqual(nextSteps(p.steps, 1).map((s) => s.id), ["b"]);
  assert.equal(summarize(p.steps, defs).groups[0].key, "company");
});

console.log("the registry");
T("every step has a unique id, plain wording, a tier, minutes, a real deep link, a permission and the facts it reads", () => {
  const ids = STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(STEPS.length >= 55, `${STEPS.length} steps`);
  for (const s of STEPS) {
    assert.ok(s.title.length >= 8 && s.description.endsWith(".") && s.why.length > 10, s.id);
    assert.ok(s.minutes >= 1 && s.minutes <= 15, s.id);
    assert.ok(GROUPS.some((g) => g.key === s.group), s.id);
    for (const d of s.dependsOn ?? []) assert.ok(ids.includes(d), `${s.id} depends on missing ${d}`);
    if (s.product) assert.ok(MODULES.some((m) => m.key === s.product), `${s.id}: ${s.product} is not a product`);
  }
  for (const t of ["required", "recommended", "optional"]) assert.ok(STEPS.some((s) => s.tier === t), t);
});
const ROUTES = (() => {
  const out: RegExp[] = [];
  const walk = (dir: string, rel: string[]) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, /^\(.*\)$/.test(e) ? rel : [...rel, e]);
      else if (e === "page.tsx") out.push(new RegExp("^/" + rel.map((s) => (/^\[.*\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|\\]/g, "\\$&"))).join("/") + "/?$"));
    }
  };
  walk("src/app", []);
  return out;
})();
T("every step's deep link points at a page that exists, and its permission is a real Workspace item", () => {
  for (const s of STEPS) {
    const path = s.href.split("?")[0].split("#")[0];
    assert.ok(ROUTES.some((r) => r.test(path)), `${s.id}: no page for ${s.href}`);
    assert.ok(NAV_KEYS.includes(s.feature), `${s.id}: ${s.feature} is not a nav key`);
  }
});
T("COVERAGE: every Integrations card, every product card, every onboarding step and every setup-related sidebar item has a step or a reasoned 'not part of setup'", () => {
  const covered = new Set(STEPS.flatMap((s) => s.covers));
  const need = new Set<string>();
  for (const p of CONNECTION_PROVIDERS.filter((x) => !HIDDEN_FROM_COMPANIES.includes(x.key) && x.fields.length >= 0)) need.add(`integration:${p.key}`);
  for (const k of ["ai-chatbot", "dealflow-sync", "webhooks"]) need.add(`integration:${k}`);
  for (const g of PRODUCT_GROUPS) for (const p of g.products) need.add(`product:${p.key}`);
  for (const o of ONBOARDING_STEPS) need.add(`onboarding:${o.key}`);
  for (const i of NAV_ITEMS) if (/^(company\.|account\.|manage\.push|manage\.chatbot)/.test(i.key)) need.add(`nav:${i.key}`);
  const missing = [...need].filter((k) => !covered.has(k) && !(k in NOT_PART_OF_SETUP));
  assert.deepEqual(missing, [], `no step and no reason for: ${missing.join(", ")}`);
});
T("the 'not part of setup' list holds no dead entries: each names a real item, has a real reason and is not also covered", () => {
  const covered = new Set(STEPS.flatMap((s) => s.covers));
  for (const [k, why] of Object.entries(NOT_PART_OF_SETUP)) {
    assert.ok(why.length > 15, k);
    assert.ok(!covered.has(k), `${k} is listed as not part of setup but a step covers it`);
    const [kind, id] = k.split(/:(.+)/);
    if (kind === "nav") assert.ok(NAV_KEYS.includes(id), k);
    if (kind === "product") assert.ok(PRODUCT_GROUPS.some((g) => g.products.some((p) => p.key === id)), k);
  }
  for (const c of covered) assert.ok(/^(onboarding|integration|product|nav):/.test(c), c);
});
T("everything the old wizard asked is a step: profile, departments, team, branding and products", () => {
  for (const o of ONBOARDING_STEPS) assert.ok(STEPS.some((s) => s.covers.includes(`onboarding:${o.key}`)), o.key);
});

console.log("the checks, with fakes, group by group");
T("a company with everything done is 100%, every step done or reviewed, and the 'reviewed' steps are exactly the ones that cannot be derived", () => {
  const p = buildProgress(STEPS, allDone());
  assert.deepEqual(p.steps.filter((s) => s.status !== "done").map((s) => `${s.id}:${s.status}`), []);
  assert.deepEqual([p.summary.percent, p.summary.complete, p.summary.minutesLeft], [100, true, 0]);
});
T("company identity: names, address, registrations, contact, locale each read the real fields; partial says what is missing", () => {
  const f = allDone();
  const without = (k: string): SetupFacts => ({ ...f, identity: { saved: true, values: { ...f.identity!.values, [k]: "" } } });
  assert.equal(state("company:names", without("legalName")).status, "partial");
  assert.match(state("company:names", without("legalName")).detail, /Legal name/);
  assert.equal(state("company:address", without("city")).status, "partial");
  assert.equal(state("company:registrations", without("gstin")).status, "partial");
  assert.equal(state("company:contact", { ...f, identity: { saved: true, values: { ...f.identity!.values, email: "", phone: "" } } }).status, "todo");
  assert.equal(state("company:locale", f).status, "done");
  assert.equal(state("company:profile", { ...f, onboarding: { completedSteps: [] } }).status, "todo");
});
T("organization and people: departments, teams, job titles, invitations, access, a second Director", () => {
  const f = allDone();
  assert.equal(state("org:departments", { ...f, org: { departments: 0, teams: 0, designations: 0 } }).status, "todo");
  assert.equal(state("org:teams", f).status, "done");
  assert.equal(state("people:invite", { ...f, people: { active: 1, directors: 1, pendingInvites: 0, staffWithAccess: 0 }, onboarding: { completedSteps: [] } }).status, "todo");
  assert.equal(state("people:invite", { ...f, people: { active: 1, directors: 1, pendingInvites: 2, staffWithAccess: 0 } }).status, "done");
  assert.equal(state("people:access", { ...f, people: { active: 4, directors: 1, pendingInvites: 0, staffWithAccess: 0 } }).status, "partial");
  assert.equal(state("people:backup-admin", { ...f, people: { ...f.people!, directors: 1 } }).status, "todo");
  assert.equal(state("people:pending", { ...f, people: { ...f.people!, pendingInvites: 2 } }).status, "partial");
});
T("products and product settings: only products that are on; saved settings or a review; prerequisite connections for the three that need them", () => {
  const f = allDone({ marks: NO_MARKS });
  assert.equal(state("product-settings:hrms", { ...f, productSettings: { hrms: false } }).status, "todo");
  assert.equal(state("product-settings:hrms", { ...f, productSettings: { hrms: true } }).status, "done");
  assert.equal(state("product-settings:pms", { ...f, modules: { on: ["hrms"] } }).status, "notApplicable");
  const c = (over: Record<string, "done" | "todo" | "partial">) => ({ ...f.connections!, ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, { state: v, detail: v }])) });
  assert.equal(state("product-settings:aibots", { ...f, connections: c({ openai: "todo" }), productSettings: { aibots: false } }).status, "todo");
  assert.equal(state("product-settings:aibots", { ...f, connections: c({ openai: "todo" }), productSettings: { aibots: true } }).status, "partial");
  assert.equal(state("product-settings:seo", { ...f, connections: c({ "google-service-account": "done" }) }).status, "done");
  assert.equal(state("product-settings:smms", { ...f, connections: c({ meta: "todo", google: "todo", linkedin: "todo", x: "todo" }) }).status, "partial");
  assert.equal(state("first:hrms", { ...f, usage: { hrms: 0 } }).status, "todo");
  assert.equal(state("products:choose", { ...f, onboarding: { completedSteps: [] } }).status, "todo");
});
T("integrations: 'Included default' is done; own keys are done when Test passes, partial when untested or failed; only cards the products on actually use count", () => {
  assert.deepEqual(connectionState("using_srb").state, "done");
  assert.deepEqual(connectionState("using_own", { testable: true, lastTestOk: true }).state, "done");
  assert.deepEqual(connectionState("using_own", { testable: true, lastTestOk: null }).state, "partial");
  assert.deepEqual(connectionState("using_own", { testable: false, lastTestOk: null }).state, "done");
  assert.deepEqual(connectionState("needs_attention").state, "partial");
  assert.deepEqual(connectionState("srb_unavailable").state, "todo");
  assert.deepEqual(connectionState("not_set_up").state, "todo");
  const f = allDone();
  const withConn = (over: Record<string, "done" | "partial" | "todo">): SetupFacts => ({ ...f, connections: { ...f.connections!, ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, { state: v, detail: v }])) } });
  assert.equal(state("integration:email", withConn({ smtp: "todo", resend: "todo", sendgrid: "partial" })).status, "partial");
  assert.equal(state("integration:email", withConn({ smtp: "todo", resend: "done", sendgrid: "todo" })).status, "done");
  assert.equal(state("integration:ai", withConn({ openai: "todo", "ai-chatbot": "todo" })).status, "todo");
  assert.equal(state("integration:payments", { ...f, registry: Object.fromEntries(Object.keys(f.registry!).map((m) => [m, ["email"]])) }).status, "notApplicable", "no product on uses Razorpay");
  assert.equal(state("integration:social", { ...f, modules: { on: ["hrms"] }, registry: { hrms: ["email"] } }).status, "notApplicable");
  assert.equal(state("integration:webhooks", withConn({ webhooks: "todo" })).status, "todo");
});
T("branding, billing, system, security, engagement", () => {
  const f = allDone();
  assert.equal(state("branding:logo", { ...f, branding: { logo: false } }).status, "todo");
  assert.equal(state("branding:domain", { ...f, domain: { customVerified: false, customPending: true } }).status, "partial");
  assert.equal(state("branding:sender", { ...f, sender: { status: "failed" } }).status, "partial");
  assert.equal(state("billing:plan", { ...f, billing: { ...f.billing!, internal: true } }).status, "notApplicable");
  assert.equal(state("billing:plan", { ...f, billing: { ...f.billing!, paying: false, status: "trialing", trialDaysLeft: 9 } }).status, "partial");
  assert.equal(state("billing:details", { ...f, billing: { ...f.billing!, hasBillingDetails: false } }).status, "todo");
  assert.equal(state("system:notifications", { ...f, marks: NO_MARKS }).status, "todo");
  assert.equal(state("system:letterhead", { ...f, marks: NO_MARKS }).status, "partial");
  assert.equal(state("security:two-step", { ...f, security: { ...f.security!, directorsWithTwoStep: 1 } }).status, "partial");
  assert.equal(state("security:two-step", { ...f, security: { ...f.security!, directorsWithTwoStep: 0 } }).status, "todo");
  assert.equal(state("security:backup", { ...f, security: { ...f.security!, backups: 0 } }).status, "todo");
  assert.equal(state("security:email", { ...f, security: { ...f.security!, emailVerified: false } }).status, "todo");
  assert.equal(state("engagement:chatbot", { ...f, engagement: { pushReady: true, knowledgeItems: 0 } }).status, "todo");
  assert.equal(state("engagement:chatbot", { ...f, modules: { on: ["hrms"] }, registry: { hrms: ["email"] } }).status, "notApplicable", "no chatbot, no knowledge step");
  assert.equal(state("engagement:push", { ...f, engagement: { pushReady: false, knowledgeItems: 1 } }).status, "todo");
});
T("one fact group failing makes only its steps 'could not check'; everything else still counts", () => {
  const f = allDone({ failed: ["security"], security: undefined });
  const p = buildProgress(STEPS, f);
  const unknown = p.steps.filter((s) => s.status === "unknown").map((s) => s.id);
  assert.deepEqual(unknown.sort(), ["security:backup", "security:email", "security:two-step"]);
  assert.equal(p.summary.percent, 99);
  assert.equal(p.steps.filter((s) => s.status === "done").length, STEPS.length - 3);
});
T("a fresh company starts low and a plan-only internal company has no billing steps", () => {
  const f: SetupFacts = { failed: [], now: NOW, marks: NO_MARKS, identity: { values: { currency: "INR", timeZone: "Asia/Kolkata", fiscalYearStartMonth: 4, language: "en" }, saved: false }, onboarding: { completedSteps: [] }, modules: { on: ["messenger"] }, org: { departments: 0, teams: 0, designations: 0 }, people: { active: 1, directors: 1, pendingInvites: 0, staffWithAccess: 0 }, connections: { smtp: { state: "done", detail: "" }, resend: { state: "todo", detail: "" }, sendgrid: { state: "todo", detail: "" }, storage: { state: "done", detail: "" } }, domain: { customVerified: false, customPending: false }, sender: { status: "none" }, branding: { logo: false }, billing: { internal: false, status: "trialing", hasPlan: true, hasBillingDetails: false, trialDaysLeft: 10, paying: false }, security: { directors: 1, directorsWithTwoStep: 0, emailVerified: false, backups: 0 }, engagement: { pushReady: false, knowledgeItems: 0 }, productSettings: {}, usage: {}, registry: { messenger: ["email", "push", "storage"] } };
  const p = buildProgress(STEPS, f);
  assert.ok(p.summary.percent < 25, `${p.summary.percent}`);
  assert.ok(p.summary.minutesLeft > 30);
  assert.ok(p.next.length === 3 && p.next.every((n) => n.tier === "required"));
});

console.log("search and filters, the Console list and reminders");
T("search matches the title and sentence; To do holds everything open; Done holds done and not applicable; the address is read safely", () => {
  const p = buildProgress(STEPS, allDone({ productSettings: Object.fromEntries(MODULES.map((m) => [m.key, false])), marks: NO_MARKS }));
  assert.ok(filterSteps(p.steps, { q: "logo", show: "all" }).some((s) => s.id === "branding:logo"));
  const todoList = filterSteps(p.steps, { q: "", show: "todo" });
  assert.ok(todoList.length > 0 && todoList.every((s) => ["todo", "partial", "unknown"].includes(s.status)));
  const doneList = filterSteps(p.steps, { q: "", show: "done" });
  assert.ok(doneList.every((s) => ["done", "notApplicable"].includes(s.status)));
  assert.equal(todoList.length + doneList.length, p.steps.length);
  assert.deepEqual(readSetupFilter({ q: " x ", show: "bogus" }), { q: "x", show: "all" });
  assert.deepEqual(readSetupFilter({ show: "todo" }), { q: "", show: "todo" });
  assert.deepEqual(Object.values(STATUS_CHIP), ["Done", "In progress", "To do", "Not applicable", "Could not check"]);
});
T("Console: 'stuck' is under 50% for 7 or more days; the clock starts when it drops below and resets when it recovers", () => {
  const d = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
  assert.equal(isStuck({ percent: 30, belowSince: d(8) }, NOW), true);
  assert.equal(isStuck({ percent: 30, belowSince: d(6) }, NOW), false);
  assert.equal(isStuck({ percent: 60, belowSince: d(20) }, NOW), false);
  assert.equal(isStuck(null, NOW), false);
  assert.deepEqual([nextBelowSince(null, 20, NOW), nextBelowSince(d(3), 20, NOW), nextBelowSince(d(3), 70, NOW)], [NOW, d(3), null]);
});

console.log("wiring (static)");
T("Setup progress is the first item under Organization Setup, for Directors like the rest, and the sidebar shows its percentage", () => {
  const items = NAV_ITEMS.filter((i) => i.section === "company");
  assert.equal(items[0].key, "company.progress");
  assert.equal(items[0].group, "Organization Setup");
  assert.equal(items[0].href, "/commandos/setup");
  assert.match(read("src/components/hub/WorkspaceShell.tsx"), /company\.progress/);
  assert.match(read("src/components/hub/HubSidebar.tsx"), /data-nav-badge/);
});
T("ONE percentage everywhere: the old five-step strip count is gone; the strip, the dashboard card and the page all read the same function", () => {
  assert.match(read("src/lib/platform/onboarding/state.ts"), /setup-progress/);
  assert.ok(!/state\.completedSteps\.length/.test(read("src/lib/platform/onboarding/state.ts")));
  assert.match(read("src/components/products/commandos/SetupBanner.tsx"), /percent/);
  assert.match(read("src/app/(products)/commandos/(protected)/page.tsx"), /SetupSummaryCard/);
  assert.match(read("src/app/(products)/commandos/(protected)/setup/page.tsx"), /getSetupProgress/);
  assert.match(read("src/app/(platform)/console/companies/CompaniesGrid.tsx"), /Setup %/);
  assert.match(read("src/app/(platform)/console/companies/CompaniesFilterBar.tsx"), /value="stuck"/);
});
T("reminders ride on an existing daily job (no extra route or function) and are listed in the Notification center", () => {
  assert.ok(!CRON_JOBS.some((j) => j.key === "setup-reminders"), "no job of its own");
  assert.ok(!existsSync("src/app/api/setup/cron/route.ts"), "no extra route");
  const backups = CRON_JOBS.find((j) => j.key === "backups")!;
  assert.match(backups.description, /setup reminders/);
  assert.match(backups.schedule, /^\d+ \d+ \* \* \*$/, "daily only");
  assert.match(read("src/lib/cron/jobs.ts"), /runSetupReminders/);
  const store = read("src/lib/notify/center/store.ts");
  assert.match(store, /key: "setup_reminder"/);
  assert.match(store, /key: "setup_digest"/);
  assert.ok(!/\/api\/setup\/cron/.test(read("vercel.json")));
});

console.log(`\n${passed} passed`);
process.exit(0);
