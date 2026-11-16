import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ObjectId } from "mongodb";
import { displayTitle, FALLBACK_TITLE, type TitleLookups } from "../src/lib/platform/organization/title";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { createDepartment, createDesignation } from "../src/lib/platform/organization";
import { titleOfPerson, titlesOfPeople } from "../src/lib/platform/organization/title-server";

// One title for a person everywhere: pure, static (no component prints a role name) and on a throwaway database. Run: npm run test:person-title
let passed = 0;
const T = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const read = (p: string) => readFileSync(p, "utf8");
const walk = (d: string, out: string[] = []): string[] => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(tsx?)$/.test(e)) out.push(p); } return out; };

const lookups: TitleLookups = { designations: new Map([["d1", { title: "Senior Developer", departmentId: "dep1" }], ["d2", { title: "Accountant", departmentId: null }]]), departments: new Map([["dep1", "Engineering"]]) };

(async () => {
  console.log("the accessor (pure)");
  await T("a person's title is the designation chosen when they were created, with the department as an optional line", () => {
    assert.deepEqual(displayTitle({ designationId: "d1" }, lookups), { title: "Senior Developer", department: "Engineering", line: "Engineering · Senior Developer" });
    assert.deepEqual(displayTitle({ designationId: "d2" }, lookups), { title: "Accountant", department: null, line: "Accountant" });
    assert.equal(displayTitle({ designationIds: ["d2", "d1"] }, lookups).title, "Accountant", "the first designation is the main one");
    assert.equal(displayTitle({ designationId: "director" }, lookups).title, "Director");
  });
  await T("without a designation (or with one that no longer exists) the words are 'Team member', never a role name", () => {
    for (const p of [null, undefined, {}, { designationId: null }, { designationId: "gone" }]) assert.equal(displayTitle(p as never, lookups).title, FALLBACK_TITLE);
    assert.equal(FALLBACK_TITLE, "Team member");
  });

  console.log("no screen prints a role name for a person (static)");
  await T("no product menu or component passes or computes a product role label; only the Platform Console and Client Portal menus use fixed words", () => {
    const offenders: string[] = [];
    for (const f of [...walk("src/components"), ...walk("src/app")]) {
      const s = read(f);
      if (/\bprimary\w*RoleLabel\b/.test(s) && !/\/lib\//.test(f)) offenders.push(`${f}: primary role label`);
      if (/roleLabel=/.test(s) && !/PlatformProfileMenu|PortalProfileMenu|UnifiedProfileMenu|AccountDrawer/.test(f)) offenders.push(`${f}: roleLabel prop`);
      if (/<UnifiedProfileMenu[\s\S]*?roleLabel=/.test(s) && !/fixedTitle/.test(s)) offenders.push(`${f}: unified menu with a role label`);
      if (/_ROLE_META\[[^\]]+\]\.label/.test(s) && /ProfileMenu/.test(f)) offenders.push(`${f}: role names in a profile menu`);
    }
    assert.deepEqual(offenders, []);
  });
  await T("the shared menu asks the organization service for the title; the account drawer shows the title, not the assigned roles", () => {
    const m = read("src/components/platform/panel/UnifiedProfileMenu.tsx");
    assert.match(m, /usePersonTitle\(\)/);
    assert.ok(!/isSuperAdmin/.test(m) && !/"Director" : \(roleLabel/.test(m), "no more guessing Director from role names");
    assert.ok(!/Assigned roles/.test(read("src/components/platform/panel/AccountDrawer.tsx")));
    assert.match(read("src/app/api/account/title/route.ts"), /titleOfPerson/);
  });
  await T("CyberVault's settings chip and SiteCraft's admin bar use the title too", () => {
    assert.match(read("src/lib/products/cybervault/access.ts"), /titlesOfPeople/);
    assert.match(read("src/app/(products)/api/sitecraft-ai/admin-bar/route.ts"), /titleOfPerson/);
  });

  console.log("on a throwaway database");
  const platform = await getPlatformDb();
  assert.ok(platform.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await platform.dropDatabase();
  await runAsCompany("co_t", async () => {
    const dep = await createDepartment({ name: "Engineering" }, "u1");
    const des = await createDesignation({ title: "Tech Lead", departmentId: dep._id }, "u1");
    const users = (await getDb()).collection("admin_users");
    const a = await users.insertOne({ email: "a@t.test", roles: ["employee"], designationId: des._id, status: "active" } as never);
    const b = await users.insertOne({ email: "b@t.test", roles: ["super_admin"], designationId: "director", status: "active" } as never);
    const c = await users.insertOne({ email: "c@t.test", roles: ["hrms_manager"], status: "active" } as never);
    await T("the same person has the same title in every product: the one accessor reads the organization service", async () => {
      assert.deepEqual(await titleOfPerson(String(a.insertedId)), { title: "Tech Lead", department: "Engineering", line: "Engineering · Tech Lead" });
      assert.equal((await titleOfPerson(String(b.insertedId))).title, "Director");
      assert.equal((await titleOfPerson(String(c.insertedId))).title, "Team member", "a manager role does not become a title");
      assert.equal((await titleOfPerson("not-an-id")).title, "Team member");
    });
    await T("many people at once (directory, comments, approvals): one title each, unknown ids get the fallback", async () => {
      const m = await titlesOfPeople([String(a.insertedId), String(b.insertedId), String(c.insertedId), String(new ObjectId())]);
      assert.deepEqual([...m.values()].map((t) => t.title), ["Tech Lead", "Director", "Team member", "Team member"]);
    });
    await T("an archived designation still names the people who hold it; renaming it renames it everywhere at once", async () => {
      const col = (await getDb()).collection("hrms_designations");
      await col.updateOne({ _id: des._id as never }, { $set: { title: "Engineering Lead" } });
      assert.equal((await titleOfPerson(String(a.insertedId))).title, "Engineering Lead");
    });
  });
  await runAsCompany("co_other", async () => {
    await T("another company's people never see this company's designations", async () => {
      const u = await (await getDb()).collection("admin_users").insertOne({ email: "z@o.test", designationId: "someone-elses", status: "active" } as never);
      assert.equal((await titleOfPerson(String(u.insertedId))).title, "Team member");
    });
  });
  await platform.dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
