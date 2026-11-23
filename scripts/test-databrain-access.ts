import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { dbCanAsk } from "../src/lib/databrain-access";
import { holdsLegacy, holdsProduct } from "../src/lib/access/holds";
import { legacyToAccess } from "../src/lib/access/adapter";
import { microOf } from "../src/lib/access/micro";
import { resolveNav, type NavContext } from "../src/lib/products/commandos/nav";
import type { AccessSubject } from "../src/lib/access/can";

let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const subj = (roles: string[], overrides: Record<string, boolean> | null = null) => legacyToAccess({ roles, permissionOverrides: overrides }) as AccessSubject;

T("DataBrain has one feature: open it and ask questions (Write, because asking saves a conversation)", () => {
  const m = microOf("databrain-ai");
  assert.equal(m.length, 1);
  assert.equal(m[0].key, "databrain-ai.ask.use");
  assert.equal(m[0].level, "write");
});
T("the Director, a DataBrain user and a DataBrain admin may ask; nobody else", () => {
  assert.equal(dbCanAsk({ subject: { isDirector: true, access: {} } }), true);
  assert.equal(dbCanAsk({ subject: subj(["intelligence_user"]) }), true);
  assert.equal(dbCanAsk({ subject: subj(["intelligence_admin"]) }), true);
  assert.equal(dbCanAsk({ subject: subj(["hr"]) }), false);
  assert.equal(dbCanAsk({ subject: { isDirector: false, access: {} } }), false);
  assert.equal(dbCanAsk(null), false);
  assert.equal(dbCanAsk({ subject: undefined as never }), false);
});
T("Read only is not enough to ask, and a Director's removal of the product closes it", () => {
  assert.equal(dbCanAsk({ subject: { isDirector: false, access: { "databrain-ai": { "databrain-ai.ask.use": "read" } } } }), false);
  assert.equal(dbCanAsk({ subject: subj(["intelligence_user"], { "intelligence.canUse": false }) }), false);
});
T("a bare holder with only roles (a script or job) gets what its roles give", () => {
  assert.equal(dbCanAsk({ roles: ["intelligence_user"] }), true);
  assert.equal(dbCanAsk({ roles: ["hr"] }), false);
});
T("the Workspace opens the DataBrain tile from the same feature", () => {
  const ctx = (roles: string[]): NavContext => ({ user: { roles, permissionOverrides: null }, platformAccess: false, unavailablePanels: new Set(), panels: {} });
  const open = (roles: string[]) => resolveNav(ctx(roles)).allowed.includes("product.intelligence");
  assert.equal(open(["intelligence_user"]), true);
  assert.equal(open(["hr"]), false);
});
T("the cross-product checks answer from micro features: leads, projects, invoices, employees, procurement", () => {
  assert.equal(holdsLegacy({ roles: ["lms_agent"] }, "dealflow-ai", "lms.VIEW_LEADS"), true);
  assert.equal(holdsLegacy({ roles: ["hr"] }, "dealflow-ai", "lms.VIEW_LEADS"), false);
  assert.equal(holdsLegacy({ roles: ["hr"] }, "talentos", "hrms.canViewAllEmployees"), true);
  assert.equal(holdsLegacy({ roles: ["employee"] }, "talentos", "hrms.canViewAllEmployees"), false);
  assert.equal(holdsProduct({ roles: ["hr"] }, "sprintos"), false);
  assert.equal(holdsProduct({ roles: ["pms_manager"] }, "sprintos"), true);
  assert.equal(holdsProduct(null, "sprintos"), false);
});
T("static: no DataBrain code, and no Workspace menu or company-wide data rule, imports an old role file (the Workspace menu keeps only the admin, DataBrain-free and portal rules)", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = ["src/app/(products)/databrain-ai", "src/app/(products)/api/databrain-ai", "src/lib/products/databrain-ai", "src/components/products/databrain-ai"].flatMap(walk).filter((f) => /\.tsx?$/.test(f));
  files.push("src/lib/intelligence-auth.ts", "src/lib/platform/access.ts", "src/lib/products/commandos/nav.ts", "src/lib/ai/agent/entities/intelligence.ts");
  const bad = files.filter((f) => /import \{[^}]*\}\s*from "@\/lib\/[a-z]+-roles"/.test(readFileSync(f, "utf8")) && !/nav\.ts$/.test(f));
  assert.deepEqual(bad, []);
});

console.log(`\n${passed} passed`);
process.exit(0);
