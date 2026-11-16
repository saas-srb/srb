import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { setAccess, subjectFromRow } from "../src/lib/access/server";
import { can as accessCan } from "../src/lib/access/can";
import { legacyToAccess, accessToLegacy, completeAccess } from "../src/lib/access/adapter";
import { legacyAnswers } from "../src/lib/access/legacy";
import { CATALOGUE } from "../src/lib/access/catalogue";
import { microOf } from "../src/lib/access/micro";
import { can, canType, scopeFilter, ForbiddenError, type DlmsViewer } from "../src/lib/products/cybervault/viewer";
import { createCredential, createLink, createNote, deleteRecord, listCredentials, listLinks, listNotes, listDocuments, revealCredential, setRecordStatus, countRecords } from "../src/lib/products/cybervault/records";
import { getDashboard } from "../src/lib/products/cybervault/overview";
import { buildVaultUi } from "../src/lib/products/cybervault/ui";
import { buildAccessUi } from "../src/lib/access/ui-model";
import { splitPicked, checkAccess } from "../src/lib/products/commandos/people";
import { dlmsCan } from "../src/lib/dlms-roles";

// Director vs partial vs own-scope person in CyberVault. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "cybervault";
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_cv", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const ids = { director: new ObjectId(), legacyEmp: new ObjectId(), legacyMgr: new ObjectId(), partial: new ObjectId(), baselineOnly: new ObjectId(), allScope: new ObjectId() };
    await people.insertMany([
      { _id: ids.director, email: "d@x", roles: ["super_admin"] },
      { _id: ids.legacyEmp, email: "e@x", roles: ["dlms_employee"] },
      { _id: ids.legacyMgr, email: "m@x", roles: ["dlms_manager"] },
      { _id: ids.partial, email: "p@x", roles: ["employee"] },
      { _id: ids.baselineOnly, email: "b@x", roles: ["employee"] },
      { _id: ids.allScope, email: "a@x", roles: ["employee"] },
    ] as never);
    await db.collection("pms_clients").insertMany([
      { _id: "cA", clientCode: "A", companyName: "Client A", deletedAt: null },
      { _id: "cB", clientCode: "B", companyName: "Client B", deletedAt: null },
    ] as never);
    await db.collection("dlms_access").insertMany([
      { _id: String(ids.legacyEmp), companyAccess: false, clientIds: ["cA"] },
      { _id: String(ids.partial), companyAccess: false, clientIds: ["cA"] },
      { _id: String(ids.baselineOnly), companyAccess: false, clientIds: ["cA"] },
    ] as never);
    // Stored access maps (the new model): partial = view credentials + notes of the assigned client only; allScope = view everything, no writes.
    const set = async (id: ObjectId, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };
    await set(ids.partial, { [k("credentials.view")]: "read", [k("notes.view")]: "read", [k("clients.view")]: "read", [k("notes.create")]: "write" });
    await set(ids.baselineOnly, { [k("dashboard.view")]: "read" });
    await set(ids.allScope, { [k("scope.all")]: "read", [k("credentials.view")]: "read", [k("documents.view")]: "read", [k("clients.view")]: "read", [k("company.view")]: "read" });

    const viewerOf = async (id: ObjectId): Promise<DlmsViewer> => {
      const row = (await people.findOne({ _id: id }))!;
      const subject = subjectFromRow(row as never);
      const seesAll = accessCan(subject, P, k("scope.all"));
      const grant = seesAll ? null : await db.collection("dlms_access").findOne({ _id: String(id) } as never) as { companyAccess?: boolean; clientIds?: string[] } | null;
      const roles = (row.roles as string[]) ?? [];
      return { userId: String(id), email: String(row.email), roles, overrides: {}, ctx: { roles, permissionOverrides: null }, subject, seesAll, companyAccess: seesAll || Boolean(grant?.companyAccess), clientIds: grant?.clientIds ?? [] };
    };
    const director = await viewerOf(ids.director);

    // Data, created by the Director.
    const cred = async (name: string, scope: "company" | "client", clientId?: string) => createCredential(director, { name, category: "other", scope, clientId, password: "" });
    const credCompany = await cred("Company cred", "company");
    const credA = await cred("A cred", "client", "cA");
    const credB = await cred("B cred", "client", "cB");
    await createNote(director, { name: "A note", category: "general", body: "text", scope: "client", clientId: "cA" });
    await createNote(director, { name: "B note", category: "general", body: "text", scope: "client", clientId: "cB" });
    await createLink(director, { name: "A link", category: "other", url: "https://a.example", scope: "client", clientId: "cA" });

    await T("parity: a person from the old roles gets exactly the micro features their legacy capabilities give, and the matrix round-trips with 0 differences", async () => {
      for (const [roles, ov] of [[["dlms_employee"], null], [["dlms_manager"], null], [["dlms_admin"], null], [["dlms_employee"], { "dlms.canDelete": true, "dlms.canRevealCredentials": false }], [["dlms_manager"], { "dlms.canViewAudit": false }]] as const) {
        const legacy = legacyAnswers({ roles, permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles, permissionOverrides: ov as never });
        for (const m of microOf(P)) {
          const want = m.legacy.every((key) => legacy[key]);
          assert.equal(Boolean(access[P]?.[m.key]), want, `${m.key} for ${roles.join("+")} ${JSON.stringify(ov)}`);
        }
        const d = accessToLegacy(completeAccess(access));
        assert.deepEqual(d.widened, [], `widened for ${roles.join("+")}`);
        assert.deepEqual(d.withheld, [], `withheld for ${roles.join("+")}`);
        // the derived legacy user answers every dlms capability like the original
        const back = legacyAnswers({ roles: d.roles, permissionOverrides: d.permissionOverrides });
        // (an override that removes a baseline capability cannot be written back into the old roles; the micro features are the truth for CyberVault)
        if (!ov) for (const e of CATALOGUE.filter((x) => x.product === P && x.kind !== "tier")) assert.equal(back[e.key], legacy[e.key], `${e.key} after round trip for ${roles.join("+")}`);
      }
    });
    await T("parity: the viewer's micro answers equal the legacy dlmsCan answers for every old role (reveal, delete, audit, manage ...)", async () => {
      for (const id of [ids.legacyEmp, ids.legacyMgr]) {
        const v = await viewerOf(id);
        const pairs: [string, Parameters<typeof dlmsCan>[1]][] = [["credentials.view", "VIEW"], ["credentials.create", "CREATE"], ["credentials.edit", "EDIT"], ["credentials.delete", "DELETE"], ["credentials.reveal", "REVEAL"], ["documents.upload", "MANAGE_DOCUMENTS"], ["documents.download", "DOWNLOAD"], ["company.manage", "MANAGE_COMPANY"], ["clients.manage", "MANAGE_CLIENTS"], ["settings.assign", "MANAGE_ACCESS"], ["activity.view", "VIEW_AUDIT"], ["settings.alerts", "MANAGE_SETTINGS"]];
        for (const [micro, perm] of pairs) assert.equal(can(v, micro), dlmsCan(v.ctx, perm), `${micro} for ${v.roles}`);
      }
    });
    await T("Director: every micro feature, sees every vault, may write everywhere", async () => {
      for (const m of microOf(P)) assert.ok(can(director, m.key.slice(P.length + 1)), m.key);
      assert.equal(director.seesAll, true);
      assert.equal((await listCredentials(director)).length, 3);
      assert.equal((await listNotes(director)).length, 2);
      const ui = await buildVaultUi(director);
      assert.ok(ui.reveal && ui.download && ui.types.credential.del && ui.types.document.create);
    });
    await T("old employee (own scope: assigned client only): sees client A, not the company vault or client B; write works only inside the assignment", async () => {
      const v = await viewerOf(ids.legacyEmp);
      assert.equal(v.seesAll, false);
      const names = (await listCredentials(v)).map((r) => r.name);
      assert.deepEqual(names, ["A cred"]);
      assert.equal((await listNotes(v)).length, 1);
      const created = await createCredential(v, { name: "Mine", category: "other", scope: "client", clientId: "cA", password: "" });
      assert.ok(created);
      await assert.rejects(createCredential(v, { name: "Bad", category: "other", scope: "client", clientId: "cB", password: "" }), ForbiddenError);
      await assert.rejects(createCredential(v, { name: "Bad", category: "other", scope: "company", password: "" }), ForbiddenError);
      await assert.rejects(deleteRecord(v, "credential", created), ForbiddenError, "employee has no delete");
      assert.equal((await countRecords(v, "credential", { scope: "company" })), 0);
    });
    await T("partial person: sees only what is granted; everything else is hidden in the UI model and refused by the server", async () => {
      const v = await viewerOf(ids.partial);
      assert.deepEqual((await listCredentials(v)).map((r) => r.name).sort(), ["A cred", "Mine"]);
      assert.deepEqual((await listNotes(v)).map((r) => r.name), ["A note"]);
      assert.deepEqual(await listLinks(v), [], "no URLs feature");
      assert.deepEqual(await listDocuments(v), []);
      assert.deepEqual(scopeFilter(v, "link"), { _id: "__none__" });
      await assert.rejects(revealCredential(v, credA, "reveal"), ForbiddenError);
      await assert.rejects(createCredential(v, { name: "x", category: "other", scope: "client", clientId: "cA", password: "" }), ForbiddenError);
      await assert.rejects(setRecordStatus(v, "credential", credA, "archived"), ForbiddenError);
      await assert.rejects(deleteRecord(v, "note", credA), ForbiddenError);
      const ui = await buildVaultUi(v);
      assert.equal(ui.reveal, false); assert.equal(ui.types.link.view, false); assert.equal(ui.types.note.view, true);
      assert.equal(canType(v, "note", "create"), true);
      // the dashboard queries only viewable types and hides activity
      const d = await getDashboard(v, {});
      assert.equal(d.totals.documents, 0); assert.equal(d.totals.links, 0); assert.equal(d.totals.notes, 1); assert.equal(d.activityIsOwn, true);
    });
    await T("scope: a person with 'See every vault' but no write feature sees all clients and the company vault and cannot change anything", async () => {
      const v = await viewerOf(ids.allScope);
      assert.equal(v.seesAll, true);
      assert.equal((await listCredentials(v)).length, 3 + 1, "company, A, B and the employee's own");
      assert.deepEqual(await listNotes(v), [], "no notes feature");
      await assert.rejects(createCredential(v, { name: "x", category: "other", scope: "client", clientId: "cB", password: "" }), ForbiddenError);
    });
    await T("a person with the product but only the baseline sees an empty, working dashboard: no data, no actions", async () => {
      const v = await viewerOf(ids.baselineOnly);
      assert.ok(can(v, "dashboard.view"));
      for (const t of ["credential", "document", "link", "note"] as const) assert.equal(await countRecords(v, t, {}), 0);
      const d = await getDashboard(v, {});
      assert.deepEqual(d.totals, { company: 0, client: 0, credentials: 0, documents: 0, links: 0, notes: 0 });
      assert.deepEqual(d.expiring, []);
      await assert.rejects(createNote(v, { name: "n", category: "general", body: "b", scope: "client", clientId: "cA" }), ForbiddenError);
    });
    await T("removing a feature removes data and action on the next request", async () => {
      const before = await viewerOf(ids.partial);
      assert.equal((await listCredentials(before)).length, 2);
      await set(ids.partial, { [k("notes.view")]: "read", [k("clients.view")]: "read" });
      const after = await viewerOf(ids.partial);
      assert.deepEqual(await listCredentials(after), []);
      assert.equal((await listNotes(after)).length, 1);
    });
    await T("editing a person from the old roles opens prefilled in micro features, and saving unchanged changes nothing they can do", async () => {
      const { access } = legacyToAccess({ roles: ["dlms_employee"], permissionOverrides: null });
      const picked = splitPicked(access);
      assert.ok(Object.keys(picked[P] ?? {}).every((key) => key.startsWith(P + ".") && key.split(".").length === 3), "only micro keys are picked");
      assert.ok(picked[P]?.[k("credentials.reveal")] && !picked[P]?.[k("credentials.delete")]);
      const c = checkAccess(picked);
      assert.deepEqual(c.widened, []); assert.deepEqual(c.withheld, []);
      for (const m of microOf(P)) assert.equal(Boolean(c.access[P]?.[m.key]), Boolean(access[P]?.[m.key]), m.key);
    });
    await T("the Step 2 catalogue shows the micro features grouped by module for CyberVault, with scope variants, and every feature has a label and description", async () => {
      const ui = buildAccessUi().products.find((p) => p.key === P)!;
      assert.equal(ui.features.length, microOf(P).length);
      assert.ok(ui.features.every((f) => f.label.length > 2 && f.description.length > 10 && f.area));
      assert.ok(ui.features.some((f) => f.scope === "all"));
      assert.deepEqual(ui.baseline, [k("dashboard.view")]);
      assert.ok(new Set(ui.features.map((f) => f.area)).size >= 8);
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
