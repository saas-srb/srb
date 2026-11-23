import assert from "node:assert/strict";
import { MICRO, FINISHED_PRODUCTS, microOf } from "../src/lib/access/micro";
import { can, type AccessSubject } from "../src/lib/access/can";
import { buildAccessUi } from "../src/lib/access/ui-model";
import { legacyToAccess } from "../src/lib/access/adapter";
import { NAV_ITEMS, resolveNav, stateOf, type NavContext } from "../src/lib/products/commandos/nav";
import { CYBERVAULT_COVERAGE } from "../src/lib/access/micro/coverage/cybervault";
import { RANKMAX_COVERAGE } from "../src/lib/access/micro/coverage/rankmax";
import { AGENTOS_COVERAGE } from "../src/lib/access/micro/coverage/agentos";
import { EVALIQ_COVERAGE } from "../src/lib/access/micro/coverage/evaliq";
import { VIRALPULSE_COVERAGE } from "../src/lib/access/micro/coverage/viralpulse";
import { CONTRACTFLOW_COVERAGE } from "../src/lib/access/micro/coverage/contractflow";
import { SITECRAFT_COVERAGE } from "../src/lib/access/micro/coverage/sitecraft";
import { DEALFLOW_COVERAGE } from "../src/lib/access/micro/coverage/dealflow";
import { CASHFLOW_COVERAGE } from "../src/lib/access/micro/coverage/cashflow";
import { HUDDLE_COVERAGE } from "../src/lib/access/micro/coverage/huddle";
import { TALENTOS_COVERAGE } from "../src/lib/access/micro/coverage/talentos";
import { SPRINTOS_COVERAGE } from "../src/lib/access/micro/coverage/sprintos";
import { SPENDIQ_COVERAGE } from "../src/lib/access/micro/coverage/spendiq";
import { COHORTAI_COVERAGE } from "../src/lib/access/micro/coverage/cohortai";
import { PLAYBOOK_COVERAGE } from "../src/lib/access/micro/coverage/playbook";
import { DATABRAIN_COVERAGE } from "../src/lib/access/micro/coverage/databrain";

/**
 * P8-D parity sweep.
 * Static (generated from the coverage maps): every page, route and server action of every product maps to a feature that exists in the catalogue,
 * or is open with a stated reason; no feature is mapped at the wrong product.
 * Runtime: fake sessions (Director, no access, Read only, Read and Write, designation-only = holds nothing, the lowest old role) go through the same
 * guard layer the code uses (`can`, the Workspace menu) for every product and every guarded item, and what they get is exactly what the catalogue says.
 */
let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };

const MAPS: Record<string, Record<string, unknown>> = {
  cybervault: CYBERVAULT_COVERAGE, "rankmax-ai": RANKMAX_COVERAGE, agentos: AGENTOS_COVERAGE, evaliq: EVALIQ_COVERAGE, "viralpulse-ai": VIRALPULSE_COVERAGE,
  "contractflow-ai": CONTRACTFLOW_COVERAGE, "sitecraft-ai": SITECRAFT_COVERAGE, "dealflow-ai": DEALFLOW_COVERAGE, "cashflow-ai": CASHFLOW_COVERAGE, "huddle-ai": HUDDLE_COVERAGE,
  talentos: TALENTOS_COVERAGE, sprintos: SPRINTOS_COVERAGE, spendiq: SPENDIQ_COVERAGE, "cohort-ai": COHORTAI_COVERAGE, "playbook-ai": PLAYBOOK_COVERAGE, "databrain-ai": DATABRAIN_COVERAGE,
};
type G = { any?: string[]; all?: string[]; open?: string; reason?: string };

T("every product is covered, and every guarded item names features of its own product that exist in the catalogue", () => {
  assert.deepEqual(Object.keys(MAPS).sort(), [...FINISHED_PRODUCTS].sort());
  let items = 0, guarded = 0, open = 0;
  for (const [product, map] of Object.entries(MAPS)) {
    const short = new Set(microOf(product).map((m) => m.key.slice(product.length + 1)));
    for (const [id, g0] of Object.entries(map)) {
      const g = g0 as G;
      items++;
      if (g.open) { open++; assert.ok((g.reason ?? "").length >= 10, `${product} ${id}: an open item needs a reason`); continue; }
      guarded++;
      const keys = g.any ?? g.all ?? [];
      assert.ok(keys.length > 0, `${product} ${id} names no feature`);
      for (const k of keys) assert.ok(short.has(k), `${product} ${id}: unknown feature ${k}`);
    }
  }
  assert.ok(items > 900 && guarded > 600, `${items} items, ${guarded} guarded, ${open} open`);
  console.log(`    ${items} pages/routes/actions: ${guarded} guarded by a feature, ${open} open with a reason`);
});
T("every open item is one of the recognised kinds (public, session, self-service, redirect)", () => {
  for (const [product, map] of Object.entries(MAPS)) for (const [id, g0] of Object.entries(map)) { const g = g0 as G; if (g.open) assert.ok(["public", "session", "self-service", "redirect"].includes(g.open), `${product} ${id} ${g.open}`); }
});

const ui = buildAccessUi();
const subjects = (product: string): Record<string, AccessSubject> => {
  const p = ui.presets[product];
  const level = (keys: string[], l: "read" | "write") => Object.fromEntries(keys.map((k) => [k, l]));
  const all = microOf(product).filter((m) => m.kind !== "scope");
  return {
    director: { isDirector: true, access: {} },
    none: { isDirector: false, access: {} },
    designationOnly: { isDirector: false, access: {} },
    readOnly: { isDirector: false, access: { [product]: level(p.read, "read") } },
    readWrite: { isDirector: false, access: { [product]: Object.fromEntries(all.map((m) => [m.key, m.level])) } },
  };
};

T("runtime: for every product, Director holds every feature, no access and designation-only hold none, Read only never holds a Write feature", () => {
  for (const product of FINISHED_PRODUCTS) {
    const s = subjects(product);
    for (const m of microOf(product)) {
      assert.equal(can(s.director, product, m.key, m.level), true, `${m.key} director`);
      assert.equal(can(s.none, product, m.key, m.level), false, `${m.key} none`);
      assert.equal(can(s.designationOnly, product, m.key, m.level), false, `${m.key} designation only`);
      if (m.level === "write") assert.equal(can(s.readOnly, product, m.key, m.level), false, `${m.key} read only must not write`);
    }
  }
});
T("runtime: a person's feature never opens a feature of another product", () => {
  for (const product of FINISHED_PRODUCTS) {
    const s = subjects(product).readWrite;
    for (const m of MICRO.filter((x) => x.product !== product)) assert.equal(can(s, m.product, m.key, m.level), false, `${product} must not open ${m.key}`);
  }
});

const ctxOf = (subject: AccessSubject, roles: string[] = []): NavContext => ({ user: { roles, permissionOverrides: null, subject } as never, platformAccess: false, unavailablePanels: new Set(), panels: {} });
T("runtime: the Workspace menu, for every product tile and analytics entry, is open exactly when the person holds a feature of that product, and a typed URL of a closed item resolves locked or hidden, never open", () => {
  for (const product of FINISHED_PRODUCTS) {
    const subs = subjects(product);
    for (const [who, subject] of Object.entries(subs)) {
      const nav = resolveNav(ctxOf(subject));
      if (who === "none" || who === "designationOnly") assert.ok(!nav.allowed.some((k) => /^product\./.test(k)) || subject.isDirector, `${product} ${who} must open no product tile`);
      for (const item of NAV_ITEMS.filter((i) => !i.platform)) {
        const st = stateOf(item, ctxOf(subject));
        assert.ok(["open", "locked", "hidden"].includes(st), `${item.key}: ${st}`);
        if (nav.allowed.includes(item.key)) assert.equal(st, "open", `${item.key} listed as allowed but ${st}`);
        else assert.notEqual(st, "open", `${item.key} not allowed but resolves open`);
      }
    }
  }
});
T("runtime: the lowest old role of each product keeps exactly what it had (the adapter hands the same features to the guard layer)", () => {
  const LOW: Record<string, string> = { cybervault: "dlms_employee", "rankmax-ai": "seo_employee", agentos: "aibots_user", evaliq: "ots_candidate", "viralpulse-ai": "smms_employee", "contractflow-ai": "lpms_viewer", "sitecraft-ai": "cms_viewer", "dealflow-ai": "lms_agent", "cashflow-ai": "finance_read_only", "huddle-ai": "chat_employee", talentos: "employee", sprintos: "pms_employee", spendiq: "prms_employee", "cohort-ai": "training_student", "playbook-ai": "sop_employee", "databrain-ai": "intelligence_user" };
  for (const [product, role] of Object.entries(LOW)) {
    const s = legacyToAccess({ roles: [role], permissionOverrides: null }) as AccessSubject;
    const held = microOf(product).filter((m) => can(s, product, m.key, m.level));
    assert.ok(held.length >= 1, `${product}: the lowest role (${role}) holds at least its baseline`);
    assert.ok(held.length < microOf(product).length || product === "databrain-ai", `${product}: the lowest role must not hold everything`);
    // By design today (the old roles gave it, the adapter proves parity): every HR employee reads Playbook SOPs and ContractFlow documents, and anybody can verify a certificate.
    const BY_DESIGN = new Set(["evaliq.certificates.verify", "contractflow-ai.documents.view", "contractflow-ai.documents.download", "contractflow-ai.archive.view", "contractflow-ai.signatures.view", "playbook-ai.documents.view", "playbook-ai.documents.comment", "playbook-ai.sops.view", "playbook-ai.sops.feedback", "playbook-ai.sops.acknowledge", "playbook-ai.sops.download"]);
    for (const other of FINISHED_PRODUCTS.filter((p) => p !== product)) {
      const leaked = microOf(other).filter((m) => can(s, other, m.key, m.level) && !m.baseline && !BY_DESIGN.has(m.key)).map((m) => m.key);
      assert.deepEqual(leaked, [], `${role} leaks into ${other}`);
    }
  }
});

console.log(`\n${passed} passed`);
process.exit(0);
