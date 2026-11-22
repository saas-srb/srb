import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MICRO, FINISHED_PRODUCTS, microOf, type Guard } from "../src/lib/access/micro";
import { CYBERVAULT_COVERAGE, CYBERVAULT_EXTRA, CYBERVAULT_ROOTS } from "../src/lib/access/micro/coverage/cybervault";
import { AGENTOS_COVERAGE, AGENTOS_EXTRA, AGENTOS_ROOTS } from "../src/lib/access/micro/coverage/agentos";
import { EVALIQ_COVERAGE, EVALIQ_EXTRA, EVALIQ_ROOTS } from "../src/lib/access/micro/coverage/evaliq";
import { VIRALPULSE_COVERAGE, VIRALPULSE_EXTRA, VIRALPULSE_ROOTS } from "../src/lib/access/micro/coverage/viralpulse";
import { CONTRACTFLOW_COVERAGE, CONTRACTFLOW_EXTRA, CONTRACTFLOW_ROOTS } from "../src/lib/access/micro/coverage/contractflow";
import { SITECRAFT_COVERAGE, SITECRAFT_EXTRA, SITECRAFT_ROOTS } from "../src/lib/access/micro/coverage/sitecraft";
import { DEALFLOW_COVERAGE, DEALFLOW_EXTRA, DEALFLOW_ROOTS, DEALFLOW_LIBS } from "../src/lib/access/micro/coverage/dealflow";
import { CASHFLOW_COVERAGE, CASHFLOW_EXTRA, CASHFLOW_ROOTS } from "../src/lib/access/micro/coverage/cashflow";
import { HUDDLE_COVERAGE, HUDDLE_EXTRA, HUDDLE_ROOTS } from "../src/lib/access/micro/coverage/huddle";
import { TALENTOS_COVERAGE, TALENTOS_EXTRA, TALENTOS_ROOTS } from "../src/lib/access/micro/coverage/talentos";
import { STAGED } from "../src/lib/access/micro/staged";
import { RANKMAX_COVERAGE, RANKMAX_EXTRA, RANKMAX_ROOTS } from "../src/lib/access/micro/coverage/rankmax";

// The catalogue-wide coverage test: for every FINISHED product, every page route, route handler and server action is mapped to micro feature(s)
// (or says why it needs none), the code really mentions the keys, every micro feature guards something, and no legacy role check remains.
// Add a product here when it is finished (see docs/people-access-v2.md).
const PRODUCTS: Record<string, { roots: string[]; coverage: Record<string, Guard>; extra: Record<string, string>; libDirs: string[]; legacyAllowed: string[]; legacyNames: RegExp; typed?: { modules: string[]; whats: string[] } }> = {
  cybervault: {
    roots: CYBERVAULT_ROOTS,
    coverage: CYBERVAULT_COVERAGE,
    extra: CYBERVAULT_EXTRA,
    libDirs: ["src/lib/products/cybervault", "src/components/products/cybervault", "src/lib/ai/agent/entities/dlms.ts"],
    // sign-in entry gates and the legacy role screens are still allowed to name the old role file
    legacyAllowed: ["src/lib/dlms-auth.ts", "src/lib/products/cybervault/access.ts", "src/components/products/cybervault/DlmsProfileMenu.tsx", "src/lib/ai/agent/entities/dlms.ts"],
    legacyNames: /\b(dlmsCan|isDlmsManagerTier|isDlmsAdmin)\b/,
    typed: { modules: ["credentials", "documents", "urls", "notes"], whats: ["view", "create", "edit", "delete", "upload"] },
  },
  agentos: {
    roots: AGENTOS_ROOTS,
    coverage: AGENTOS_COVERAGE,
    extra: AGENTOS_EXTRA,
    libDirs: ["src/lib/products/agentos", "src/components/products/agentos", "src/lib/ai/agent/entities/aibots.ts"],
    // sign-in entry gates; the AI file only uses the old function for the offer list (what the agent shows), never for reading or running
    legacyAllowed: ["src/lib/aibots-auth.ts", "src/components/products/agentos/AibotsProfileMenu.tsx", "src/lib/ai/agent/entities/aibots.ts"],
    legacyNames: /\b(aibotsCan|isAibotsManagerTier)\b/,
  },
  evaliq: {
    roots: EVALIQ_ROOTS,
    coverage: EVALIQ_COVERAGE,
    extra: EVALIQ_EXTRA,
    libDirs: ["src/lib/products/evaliq", "src/components/products/evaliq", "src/lib/ai/agent/entities/ots.ts"],
    // sign-in entry gates; the AI file only uses the old function for the offer list (what the agent shows), never for reading or running
    legacyAllowed: ["src/lib/ots-auth.ts", "src/components/products/evaliq/OtsProfileMenu.tsx", "src/lib/ai/agent/entities/ots.ts"],
    legacyNames: /\b(otsCan|isOtsStaff)\b/,
  },
  "viralpulse-ai": {
    roots: VIRALPULSE_ROOTS,
    coverage: VIRALPULSE_COVERAGE,
    extra: VIRALPULSE_EXTRA,
    libDirs: ["src/lib/products/viralpulse-ai", "src/components/products/viralpulse-ai", "src/lib/ai/agent/entities/smms.ts"],
    // sign-in entry gates; the AI file only uses the old function for the offer list (what the agent shows), never for reading or running
    legacyAllowed: ["src/lib/smms-auth.ts", "src/components/products/viralpulse-ai/SmmsProfileMenu.tsx", "src/lib/ai/agent/entities/smms.ts"],
    legacyNames: /\b(smmsCan)\b/,
  },
  "contractflow-ai": {
    roots: CONTRACTFLOW_ROOTS,
    coverage: CONTRACTFLOW_COVERAGE,
    extra: CONTRACTFLOW_EXTRA,
    libDirs: ["src/lib/products/contractflow-ai", "src/components/products/contractflow-ai", "src/lib/ai/agent/entities/lpms.ts"],
    // sign-in entry gates; the AI file only uses the old function for the offer list (what the agent shows), never for reading or running
    legacyAllowed: ["src/lib/lpms-auth.ts", "src/components/products/contractflow-ai/LpmsProfileMenu.tsx", "src/lib/ai/agent/entities/lpms.ts"],
    legacyNames: /\b(lpmsCan|isLpmsManagerTier|isLpmsAdmin)\b/,
  },
  "sitecraft-ai": {
    roots: SITECRAFT_ROOTS,
    coverage: SITECRAFT_COVERAGE,
    extra: SITECRAFT_EXTRA,
    libDirs: ["src/lib/products/sitecraft-ai", "src/components/products/sitecraft-ai"],
    legacyAllowed: ["src/lib/cms-auth.ts", "src/components/products/sitecraft-ai/CmsProfileMenu.tsx"],
    legacyNames: /\b(cmsCan)\b/,
  },
  "dealflow-ai": {
    roots: DEALFLOW_ROOTS,
    coverage: DEALFLOW_COVERAGE,
    extra: DEALFLOW_EXTRA,
    libDirs: DEALFLOW_LIBS,
    // entry gate (hasLmsAccess) only; the old per-permission function is no longer used by the product
    legacyAllowed: ["src/lib/lms-auth.ts", "src/components/products/dealflow-ai/LmsProfileMenu.tsx"],
    legacyNames: /\b(lmsCan\([^,]+, ?"[A-Z_]+"|isLmsAdmin|canManageLeads|canManageCampaigns|canViewLmsAnalytics)/,
  },
  "cashflow-ai": {
    roots: CASHFLOW_ROOTS,
    coverage: CASHFLOW_COVERAGE,
    extra: CASHFLOW_EXTRA,
    libDirs: ["src/lib/products/cashflow-ai", "src/components/products/cashflow-ai", "src/lib/fms-access.ts", "src/lib/ai/agent/entities/fms.ts"],
    // sign-in entry gates only; the old per-capability functions are no longer called by the product
    legacyAllowed: ["src/lib/fms-auth.ts", "src/components/products/cashflow-ai/FmsProfileMenu.tsx"],
    legacyNames: /@\/lib\/fms-roles"[^\n]*\b(can[A-Z]\w+|isFmsAdmin)\b|import \{[^}]*\b(can[A-Z]\w+|isFmsAdmin)\b[^}]*\} from "@\/lib\/fms-roles"/,
  },
  "huddle-ai": {
    roots: HUDDLE_ROOTS,
    coverage: HUDDLE_COVERAGE,
    extra: HUDDLE_EXTRA,
    libDirs: ["src/lib/products/huddle-ai", "src/components/products/huddle-ai", "src/lib/messenger-access.ts", "src/lib/ai/agent/entities/messenger.ts"],
    // sign-in entry gate and the role screens; the old capability functions are no longer called by the product
    legacyAllowed: ["src/lib/messenger-auth.ts", "src/components/products/huddle-ai/MessengerProfileMenu.tsx", "src/lib/products/huddle-ai/conversations.ts"],
    legacyNames: /import \{[^}]*\b(isChatAdmin|canCreateTeamChannel|canPostAnnouncements|canViewWorkspaceAnalytics|canViewAuditLog|hasChatStaffRole)\b[^}]*\} from "@\/lib\/messenger-roles"/,
  },
  talentos: {
    roots: TALENTOS_ROOTS,
    coverage: TALENTOS_COVERAGE,
    extra: TALENTOS_EXTRA,
    // staged: only the converted modules' folders are enforced so far (see micro/staged.ts); the product-wide helpers are listed once
    libDirs: ["src/lib/talentos-access.ts", "src/lib/products/talentos/scope.ts", "src/lib/products/talentos/page-guard.tsx", "src/components/products/talentos/MyLeavePanel.tsx"],
    legacyAllowed: [],
    legacyNames: /import \{[^}]*\b(can[A-Z]\w+|hasStaffRole|isEmployeeOnly)\b[^}]*\} from "@\/lib\/hrms-roles"/,
  },
  "rankmax-ai": {
    roots: RANKMAX_ROOTS,
    coverage: RANKMAX_COVERAGE,
    extra: RANKMAX_EXTRA,
    libDirs: ["src/lib/products/rankmax-ai", "src/components/products/rankmax-ai", "src/lib/ai/agent/entities/seo.ts"],
    // sign-in entry gates; the AI file only uses the old function for the offer list (what the agent shows), never for reading or running
    legacyAllowed: ["src/lib/seo-auth.ts", "src/lib/products/rankmax-ai/people.ts", "src/components/products/rankmax-ai/SeoProfileMenu.tsx", "src/lib/ai/agent/entities/seo.ts"],
    legacyNames: /\b(seoCan|isSeoManagerTier)\b/,
  },
};

let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const read = (p: string) => readFileSync(p, "utf8");
const APP = "src/app/(products)/";

function items(roots: string[]): { id: string; file: string; text: string }[] {
  const out: { id: string; file: string; text: string }[] = [];
  for (const root of roots) for (const f of walk(root)) {
    const base = f.split("/").pop()!;
    const id = relative(APP.slice(0, -1), f).replace(/^\(products\)\//, "");
    const rel = relative("src/app/(products)", f);
    if (base === "page.tsx" || base === "route.ts") out.push({ id: rel, file: f, text: read(f) });
    else if (/(^actions.*|-actions)\.ts$/.test(base)) {
      const text = read(f);
      const fns = [...text.matchAll(/export async function (\w+)/g)];
      fns.forEach((m, i) => out.push({ id: `${rel}#${m[1]}`, file: f, text: text.slice(m.index!, fns[i + 1]?.index ?? text.length) }));
    }
    void id;
  }
  return out;
}

T("the micro catalogue is well formed: stable keys, unique, labelled, grouped product -> module -> feature, with Read/Write meaning", () => {
  assert.ok(FINISHED_PRODUCTS.length >= 1);
  assert.equal(new Set(MICRO.map((m) => m.key)).size, MICRO.length);
  for (const m of MICRO) {
    assert.match(m.key, /^[a-z-]+\.[a-z]+\.[a-z]+$/, m.key);
    assert.ok(m.key.startsWith(`${m.product}.`));
    assert.ok(m.label.length > 3 && m.description.length >= 12 && m.module.length > 2, m.key);
    assert.ok(m.level === "read" || m.level === "write");
    assert.ok(m.legacy.length > 0, `${m.key} must name the legacy capability that gives parity`);
  }
});

for (const [product, cfg] of Object.entries(PRODUCTS)) {
  const found = items(cfg.roots);
  const shortKeys = new Set(microOf(product).map((m) => m.key.slice(product.length + 1)));
  T(`${product}: every page, route handler and server action is mapped (none unmapped, none stale)`, () => {
    const ids = new Set(found.map((i) => i.id));
    const unmapped = [...ids].filter((id) => !(id in cfg.coverage));
    assert.deepEqual(unmapped, [], `unmapped in ${product}: ${unmapped.join(", ")}`);
    const stale = Object.keys(cfg.coverage).filter((id) => !ids.has(id));
    assert.deepEqual(stale, [], `mapped but missing in ${product}: ${stale.join(", ")}`);
    assert.ok(found.length >= (STAGED[product] ? 5 : 15), "the enumeration found the product");
  });
  T(`${product}: every key in the map is a real micro feature, and the code of each mapped item mentions its guard`, () => {
    for (const it of found) {
      const g = cfg.coverage[it.id];
      if ("open" in g) { assert.ok(g.reason.length > 10, `${it.id} needs a reason`); continue; }
      const keys = "any" in g ? g.any : g.all;
      for (const key of keys) assert.ok(shortKeys.has(key), `${it.id} maps to unknown feature ${key}`);
      const layoutText = g.viaLayout ? (() => { let d = it.file.split("/").slice(0, -1); while (d.length > 2) { try { return read([...d, "layout.tsx"].join("/")); } catch { d = d.slice(0, -1); } } return ""; })() : "";
      const mentions = (g.viaLayout && (g.via ? layoutText.includes(g.via) : keys.some((key) => layoutText.includes(`"${key}"`)))) || keys.some((key) => it.text.includes(`"${key}"`)) || (g.via ? it.text.includes(g.via) : false) || /requireWorkspaceAction|lockedUnless\(/.test(it.text) && keys.some((key) => it.text.includes(key));
      assert.ok(mentions, `${it.id} does not enforce ${keys.join(" / ")}`);
    }
  });
  T(`${product}: every micro feature guards something (a mapped item, or a named place in the code that really uses it)`, () => {
    const mapped = new Set(Object.values(cfg.coverage).flatMap((g) => ("open" in g ? [] : "any" in g ? g.any : g.all)));
    const code = [...cfg.roots, ...cfg.libDirs].flatMap((d) => (statSync(d).isDirectory() ? walk(d) : [d])).map(read).join("\n");
    const viaType = Boolean(cfg.typed) && /typeKey\(/.test(code);
    const pendingModules = new Set(STAGED[product]?.pending ?? []);
    const moduleOf = new Map(microOf(product).map((m) => [m.key.slice(product.length + 1), m.module]));
    for (const key of shortKeys) {
      if (mapped.has(key)) continue;
      if (pendingModules.has(moduleOf.get(key) ?? "")) continue; // its module is not converted yet (staged); the ledger lists it
      assert.ok(key in cfg.extra, `${key} guards nothing mapped: say where it is enforced`);
      const [mod, what] = key.split(".");
      const literal = code.includes(`"${key}"`);
      const typed = viaType && cfg.typed!.modules.includes(mod) && cfg.typed!.whats.includes(what);
      assert.ok(literal || typed, `${key} is not used anywhere in the code`);
    }
    for (const key of Object.keys(cfg.extra)) assert.ok(shortKeys.has(key), `${key} in extra is not a feature`);
  });
  T(`${product}: every literal key passed to the checks exists, so a typo can never silently deny or allow`, () => {
    const code = [...cfg.roots, ...cfg.libDirs].flatMap((d) => (statSync(d).isDirectory() ? walk(d) : [d])).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ f, t: read(f) }));
    const pats = [/\bhrCan\(\s*[\w.{}]+\s*,\s*"([a-z.]+)"/g, /hrPage\("([a-z.]+)"/g, /requireHrAct\([^,]+,\s*"\w+",\s*"([a-z.]+)"/g, /\bhrCan\(\{ subject \}, "([a-z.]+)"/g, /(?:requireChatPage|requireSessionFor|requireChat)\("([a-z.]+)"/g, /\bchatCan\(\s*[\w.{}: ]+\s*,\s*"([a-z.]+)"/g, /\bF\("([a-z.]+)"/g, /\bfmsCan\(\s*\w+\s*,\s*"([a-z.]+)"/g, /(?:requireLms\w*|useLmsCan|isAuthorizedLmsRequest)\((?:req, )?"([a-z.]+)"/g, /\blmsCan\(\s*[\w.]+\s*,\s*"([a-z.]+)"/g, /\bcan\(\s*[\w.]+\s*,\s*"([a-z.]+)"/g, /lockedUnless\(\s*\w+\s*,\s*"([a-z.]+)"/g, /\brun\(\s*(?:id \? )?"([a-z]+\.[a-z.]+)"/g, /\bcan\("([a-z.]+)"\)/g, /featureScope\("([a-z.]+)"\)/g, /typeKey\(\w+, "(view|create|edit|delete)"\)/g];
    let n = 0;
    for (const { f, t } of code) for (const re of pats) for (const m of t.matchAll(re)) {
      n++;
      if (/^(view|create|edit|delete)$/.test(m[1])) continue;
      assert.ok(shortKeys.has(m[1]), `${f} uses unknown key "${m[1]}"`);
    }
    assert.ok(n > (STAGED[product] ? 5 : 15), `found ${n} checks`);
    // `run(id ? "a" : "b"` has a second key
    for (const { f, t } of code) for (const m of t.matchAll(/run\(id \? "[a-z.]+" : "([a-z.]+)"/g)) assert.ok(shortKeys.has(m[1]), `${f} ${m[1]}`);
  });
  T(`${product}: no legacy role check remains (the old role-file permission functions are not called)`, () => {
    const files = [...cfg.roots, ...cfg.libDirs].flatMap((d) => (statSync(d).isDirectory() ? walk(d) : [d])).filter((f) => /\.tsx?$/.test(f));
    const bad = files.filter((f) => !cfg.legacyAllowed.includes(f) && cfg.legacyNames.test(read(f)));
    assert.deepEqual(bad, []);
    // the one allowed file that still names the old permission function only offers tools: the server re-checks through the micro features
    try { assert.ok(!cfg.legacyNames.test(read(`src/lib/products/${product}/viewer.ts`))); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  });
}

console.log(`\n${passed} passed`);
