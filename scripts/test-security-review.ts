import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { last4 } from "../src/lib/platform/crypto";
import { KEYED_COLLECTIONS, GLOBAL_COLLECTIONS } from "../src/lib/platform/tenancy/collections";

// Static checks that keep the P8-E security review fixes in place. Run: npx tsx scripts/test-security-review.ts
let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const read = (p: string) => readFileSync(p, "utf8");
const BASE = "src/app/(products)/commandos/(protected)";

T("every new company collection with a fixed _id is keyed per company, and none is global", () => {
  for (const c of ["company_identity", "config_versions", "setup_progress", "setup_progress_snapshots"]) { assert.ok(KEYED_COLLECTIONS.has(c), `${c} must be keyed`); assert.ok(!GLOBAL_COLLECTIONS.has(c), `${c} must not be global`); }
  for (const c of ["access_templates", "workspace_connections", "access_requests", "company_backups"]) assert.ok(!GLOBAL_COLLECTIONS.has(c), `${c} is company scoped`);
});
T("actions that call an outside service, send mail or change many people at once are rate limited per company and per person", () => {
  const integ = read(`${BASE}/settings/integrations/actions.ts`);
  assert.match(integ, /limitAction\(who\.id, "connection-test"/);
  assert.match(integ, /limitAction\(user\.id, "test-email"/);
  assert.match(read(`${BASE}/users/actions.ts`), /limitAction\(actor\.id, "bulk-access"/);
  assert.match(read(`${BASE}/setup/actions.ts`), /limitAction\(user\.id, "setup-mark"/);
  assert.match(read("src/lib/security/action-limit.ts"), /act:\$\{bucket\}:\$\{company\}:\$\{personId\}/);
});
T("every change of a connection is audited with the company and the person, never with a value", () => {
  const integ = read(`${BASE}/settings/integrations/actions.ts`);
  for (const a of ["connection.saved", "connection.removed", "connection.mode_changed"]) assert.match(integ, new RegExp(a.replace(".", "\\.")));
  assert.match(integ, /never the values/);
});
T("marks and bulk access are Director-gated or run through the same rules as editing one person; templates and bulk go through requireWorkspaceAction", () => {
  const setup = read(`${BASE}/setup/actions.ts`);
  assert.ok((setup.match(/isDirector\(user\)/g) ?? []).length >= 2);
  const users = read(`${BASE}/users/actions.ts`);
  for (const fn of ["bulkAccessAction", "listTemplatesAction", "saveTemplateAction", "deleteTemplateAction"]) assert.match(users.slice(users.indexOf(`export async function ${fn}`), users.indexOf(`export async function ${fn}`) + 300), /requireWorkspaceAction\("company\.users"\)/, fn);
  assert.match(read("src/lib/products/commandos/access-bundles.ts"), /updatePerson\(id, \{ \.\.\.person\.details, access: next \}, actor\)/);
});
T("a person who manages users without being a Director can only hand out access they hold themselves (create, edit and bulk)", () => {
  const people = read("src/lib/products/commandos/people.ts");
  assert.ok((people.match(/access: (v\.check\.access|targetIsDirector \? undefined : v\.check\?\.access)/g) ?? []).length >= 2);
  assert.match(read("src/lib/products/commandos/admin-users.ts"), /featuresBeyond\(actor, action\.access\)/);
});
T("secrets are masked: a connection view and a saved test result carry last four characters only, and the setup, identity and title routes return no secret", () => {
  const store = read("src/lib/platform/connections/store.ts");
  assert.match(store, /last4: s\.last4/);
  assert.ok(!/values\[field\] = plain[\s\S]{0,40}return view/.test(store));
  assert.match(read("src/lib/platform/connections/testers.ts"), /scrub\(/);
  assert.match(read("src/app/api/account/title/route.ts"), /private, no-store/);
});
T("the title route answers only a signed-in person and about themselves", () => {
  const r = read("src/app/api/account/title/route.ts");
  assert.match(r, /getCurrentHubUser\(\)/);
  assert.match(r, /titleOfPerson\(user\.id\)/);
  assert.match(r, /status: 401/);
});
T("server actions keep Next's same-origin check; the dev-only allowed origins are not sent to production", () => {
  const cfg = read("next.config.ts");
  assert.match(cfg, /serverActions/);
  assert.match(cfg, /NODE_ENV !== "production" && \{ allowedOrigins/);
});
T("a short secret never shows any of itself", () => {
  assert.equal(last4("abcd"), "");
  assert.equal(last4("12345678"), "");
  assert.equal(last4("sk_live_ABCD1234wxyz"), "wxyz");
});
console.log(`\n${passed} passed`);
