import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { GLOBAL_COLLECTIONS, KEYED_COLLECTIONS } from "../src/lib/platform/tenancy/collections";
import { PB_COLLECTIONS, PB_KEYED_COLLECTIONS } from "../src/lib/products/playbook-ai/pb-collections";
import { PLAYBOOK_PERMISSIONS, PLAYBOOK_PERMISSION_KEY, PLAYBOOK_PERMISSION_META, PLAYBOOK_ROLE_PERMISSIONS, playbookCan } from "../src/lib/playbook-roles";
import { SOP_ROLES } from "../src/lib/sop-roles";
import { PERMISSION_GROUPS } from "../src/lib/products/commandos/permission-catalog";
import { DEFAULT_PAGE, EXPOSED_ORIENTATIONS, EXPOSED_PAGE_SIZES, PAGE_SIZES } from "../src/lib/products/playbook-ai/doc";

// Pure: no database, no network. Run with: npx tsx scripts/test-playbook-foundation.ts
let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

console.log("tenancy registration");
t("pb collection names are unique and prefixed pb_", () => {
  const names = Object.values(PB_COLLECTIONS);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.match(n, /^pb_[a-z_]+$/);
});
t("every fixed-_id pb collection is registered as KEYED, so two companies cannot collide", () => {
  assert.deepEqual([...PB_KEYED_COLLECTIONS].sort(), ["pb_brand", "pb_counters", "pb_settings"]);
  for (const n of PB_KEYED_COLLECTIONS) assert.ok(KEYED_COLLECTIONS.has(n), `${n} missing from KEYED_COLLECTIONS`);
});
t("random-id pb collections are NOT keyed, and no pb collection is global (all are company-scoped)", () => {
  for (const n of Object.values(PB_COLLECTIONS)) {
    assert.equal(GLOBAL_COLLECTIONS.has(n), false, `${n} must not be global`);
    if (!(PB_KEYED_COLLECTIONS as readonly string[]).includes(n)) assert.equal(KEYED_COLLECTIONS.has(n), false, `${n} must not be keyed`);
  }
});
t("the tenancy file lists no stray pb_ keyed collection", () => {
  for (const n of KEYED_COLLECTIONS) if (n.startsWith("pb_")) assert.ok((PB_KEYED_COLLECTIONS as readonly string[]).includes(n), `${n} is keyed but not declared by the product`);
});

console.log("permissions");
t("every permission has a unique override key, a label and a description", () => {
  const keys = PLAYBOOK_PERMISSIONS.map((p) => PLAYBOOK_PERMISSION_KEY[p]);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^playbookdoc\.can[A-Za-z]+$/);
  for (const p of PLAYBOOK_PERMISSIONS) {
    assert.ok(PLAYBOOK_PERMISSION_META[p].label.length > 2);
    assert.ok(PLAYBOOK_PERMISSION_META[p].description.length > 10);
  }
});
t("the Director's permission catalog lists every key, derived from the same table", () => {
  const group = PERMISSION_GROUPS.find((g) => g.module === "Playbook documents");
  assert.ok(group, "catalog group missing");
  assert.deepEqual(group!.permissions.map((p) => p.key).sort(), PLAYBOOK_PERMISSIONS.map((p) => PLAYBOOK_PERMISSION_KEY[p]).sort());
  const all = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
  assert.equal(new Set(all).size, all.length, "catalog keys must be unique across modules");
});
t("role tiers: reader < author < manager < admin", () => {
  const can = (role: string, p: (typeof PLAYBOOK_PERMISSIONS)[number]) => playbookCan({ roles: [role] }, p);
  assert.equal(can("sop_employee", "VIEW"), true);
  assert.equal(can("sop_employee", "CREATE"), false);
  assert.equal(can("sop_author", "CREATE"), true);
  assert.equal(can("sop_author", "USE_AI"), true);
  assert.equal(can("sop_author", "APPROVE"), false);
  assert.equal(can("sop_author", "ISSUE"), false);
  assert.equal(can("sop_author", "SEND_FOR_SIGNATURE"), false);
  assert.equal(can("sop_manager", "APPROVE"), true);
  assert.equal(can("sop_manager", "ISSUE"), true);
  assert.equal(can("sop_manager", "SEND_FOR_SIGNATURE"), true);
  assert.equal(can("sop_manager", "MANAGE_TEMPLATES"), false);
  assert.equal(can("sop_manager", "MANAGE_RETENTION"), false);
  for (const p of PLAYBOOK_PERMISSIONS) assert.equal(can("sop_admin", p), true, `admin ${p}`);
  for (const p of PLAYBOOK_PERMISSIONS) assert.equal(can("super_admin", p), true, `director ${p}`);
});
t("retention, purge and legal hold are their own permission, admin-only by default (decision 7)", () => {
  for (const role of SOP_ROLES) {
    const has = PLAYBOOK_ROLE_PERMISSIONS[role].includes("MANAGE_RETENTION");
    assert.equal(has, role === "super_admin" || role === "sop_admin", role);
  }
});
t("reviewing a template (legal review stamp) is its own permission, admin-only by default (decision 1)", () => {
  for (const role of SOP_ROLES) assert.equal(PLAYBOOK_ROLE_PERMISSIONS[role].includes("REVIEW_TEMPLATES"), role === "super_admin" || role === "sop_admin", role);
});
t("Director overrides can grant or revoke, except that a super_admin always keeps access", () => {
  const key = PLAYBOOK_PERMISSION_KEY.APPROVE;
  assert.equal(playbookCan({ roles: ["sop_author"], permissionOverrides: { [key]: true } }, "APPROVE"), true);
  assert.equal(playbookCan({ roles: ["sop_manager"], permissionOverrides: { [key]: false } }, "APPROVE"), false);
  assert.equal(playbookCan({ roles: ["super_admin"], permissionOverrides: { [key]: false } }, "APPROVE"), true);
});
t("people with no Playbook role, and HRMS employees, get the right tier", () => {
  assert.equal(playbookCan({ roles: [] }, "VIEW"), false);
  assert.equal(playbookCan({ roles: ["unrelated_role"] }, "VIEW"), false);
  assert.equal(playbookCan({ roles: ["employee"] }, "VIEW"), true);
  assert.equal(playbookCan({ roles: ["employee"] }, "CREATE"), false);
  assert.equal(playbookCan({ roles: ["hr"] }, "ISSUE"), true);
});

console.log("dependencies and build configuration");
t("the editor and DOCX dependencies are installed and every @tiptap package is MIT (no paid or private packages)", () => {
  const pkg = JSON.parse(read("package.json"));
  for (const d of ["@tiptap/core", "@tiptap/pm", "@tiptap/react", "@tiptap/starter-kit", "@tiptap/extension-table", "docx"]) assert.ok(pkg.dependencies[d], `${d} missing`);
  assert.ok(!Object.keys(pkg.dependencies).some((d) => d.startsWith("@tiptap-pro") || d === "@tiptap/extension-comments"), "no paid TipTap packages");
  const dir = path.join(ROOT, "node_modules/@tiptap");
  const names = readdirSync(dir);
  assert.ok(names.length >= 20);
  for (const n of names) assert.equal(JSON.parse(readFileSync(path.join(dir, n, "package.json"), "utf8")).license, "MIT", `@tiptap/${n}`);
  assert.equal(JSON.parse(read("node_modules/docx/package.json")).license, "MIT");
});
t("docx runs on the server only (serverExternalPackages) next to the other large server libraries", () => {
  assert.match(read("next.config.ts"), /serverExternalPackages: \[[^\]]*"docx"/);
});

console.log("page defaults");
t("A4 portrait is the only exposed page size and orientation, and the defaults are sensible", () => {
  assert.deepEqual([...EXPOSED_PAGE_SIZES], ["A4"]);
  assert.deepEqual([...EXPOSED_ORIENTATIONS], ["portrait"]);
  assert.deepEqual(Object.keys(PAGE_SIZES), ["A4"]);
  assert.equal(DEFAULT_PAGE.size, "A4");
});

console.log("route and navigation scaffold");
t("the documents page, nav entry and layout flag exist and are permission-gated", () => {
  const page = read("src/app/(products)/playbook-ai/(protected)/documents/page.tsx");
  assert.match(page, /playbookCan\(ctx, "SETTINGS"\)/);
  assert.match(page, /redirect\("\/playbook-ai\/login"\)/);
  assert.match(read("src/lib/products/playbook-ai/nav.ts"), /\/playbook-ai\/documents/);
  assert.match(read("src/app/(products)/playbook-ai/(protected)/layout.tsx"), /documents: playbookCan\(ctx, "SETTINGS"\)/);
  assert.ok(existsSync(path.join(ROOT, "src/lib/products/playbook-ai/doc/validate.ts")));
});

console.log(`\nall ${passed} tests passed`);
