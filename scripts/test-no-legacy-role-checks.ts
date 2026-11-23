import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every product is on micro features. This fails when a page, action, route, library file or component outside the adapter calls an old role-file
 * capability function (`xCan`, `hasXAccess`, `canX`, `isXAdmin` ...). The few files that may still name one are listed here WITH the reason; an entry whose
 * file no longer needs it is reported as stale, so the list can only shrink.
 */
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const read = (p: string) => readFileSync(p, "utf8");
const IMPORT = /import \{([^}]*)\} from "@\/lib\/([a-z]+-roles)"/g;
const CAPABILITY = /^(\w+Can|has\w+Access|is\w+(Tier|Admin|Staff\w*|Only)|can[A-Z]\w+|hasStaffRole|has\w+Role)$/;

const ENTRY = "Sign-in entry gate: decides only whether the person holds the product at all (the adapter keeps the roles array identical to what their micro features give). Capability checks all use micro features.";
const ALLOWED: Record<string, string> = {
  ...Object.fromEntries([
    "agentos", "cashflow-ai", "cohort-ai", "cybervault", "dealflow-ai", "evaliq", "huddle-ai", "playbook-ai", "rankmax-ai", "sitecraft-ai", "spendiq", "sprintos", "viralpulse-ai",
  ].map((p) => [`src/app/(products)/${p}/(protected)/layout.tsx`, ENTRY])),
  ...Object.fromEntries(["aibots", "cms", "dlms", "lms", "lpms", "ots", "seo", "smms", "sop"].map((p) => [`src/lib/${p}-auth.ts`, ENTRY])),
  "src/lib/cross-module-sso.ts": "Single sign-on module list: which modules a person's roles open (entry gate for each).",
  "src/lib/products/commandos/admin-users-shared.ts": "People list: shows which legacy roles a person holds (the adapter's derived roles) for the account drawer.",
  "src/lib/products/commandos/dealflow-access-migration.ts": "The one-time migration that gave existing DealFlow users the new access (reads legacy roles by design).",
  "src/lib/products/commandos/nav.ts": "Director test (`hasAdminAccess`) and the Workspace analytics permission, which are Workspace rules and not a product's.",
  "src/lib/products/spendiq/requisitions.ts": "The requisition approval ladder (who approves at which level) is a workflow rule by role, gated by requisitions.approve.",
};

const roots = ["src/app", "src/components", "src/lib"];
const files = roots.flatMap(walk).filter((f) => /\.tsx?$/.test(f) && !f.startsWith("src/lib/access/") && !/^src\/lib\/[a-z]+-roles\.ts$/.test(f) && !/permission-catalog|role-catalog/.test(f));
const offenders = new Map<string, string[]>();
for (const f of files) {
  const t = read(f);
  for (const m of t.matchAll(IMPORT)) {
    const names = m[1].split(",").map((n) => n.trim().split(" as ")[0].replace(/^type /, "")).filter(Boolean).filter((n) => CAPABILITY.test(n));
    if (names.length) offenders.set(f, [...(offenders.get(f) ?? []), ...names]);
  }
}

let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };

T("no product page, action, route, library file or component calls an old role-file capability function outside the listed entry gates", () => {
  const bad = [...offenders.keys()].filter((f) => !(f in ALLOWED));
  assert.deepEqual(bad.map((f) => `${f}: ${offenders.get(f)!.join(", ")}`), []);
});
T("the allowlist has no stale entry (every listed file still needs its exception)", () => {
  const stale = Object.keys(ALLOWED).filter((f) => !offenders.has(f));
  assert.deepEqual(stale, []);
});
T("the allowed files never use the old capability functions for anything but the reason given (entry gates carry no `Can(` calls)", () => {
  for (const f of Object.keys(ALLOWED).filter((x) => /-auth\.ts$|\(protected\)\/layout\.tsx$/.test(x))) {
    const names = offenders.get(f)!;
    assert.ok(names.every((n) => /^has\w+Access$/.test(n)), `${f} imports ${names.join(", ")}`);
  }
});
T("the Workspace menu, company-wide data areas and DataBrain read micro features (access/holds.ts), not role files", () => {
  for (const f of ["src/lib/platform/access.ts", "src/lib/products/databrain-ai/catalog/access.ts", "src/lib/products/commandos/nav.ts"]) assert.match(read(f), /@\/lib\/access\/holds/, f);
});

console.log(`\n${passed} passed`);
process.exit(0);
