import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { getDb, getPlatformDb } from "../src/lib/mongodb";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { DEFAULT_PAGE, parseDoc, type PBDoc } from "../src/lib/products/playbook-ai/doc";
import {
  createDocument, deleteDocument, getDocument, getDocumentActivity, getDocumentVersion, listDocuments, purgeDocument, resetPbDocumentIndexes, setLegalHold,
  setStatusPolicy, transitionDocument,
} from "../src/lib/products/playbook-ai/documents";
import { resetPbVersionIndexes } from "../src/lib/products/playbook-ai/versions";
import { resetPbAuditIndexes } from "../src/lib/products/playbook-ai/pb-audit";
import { settingsStatusPolicy, savePbSettings, getPbSettings, isLegalType, validateSettings } from "../src/lib/products/playbook-ai/pb-settings";
import { ALL_META } from "../src/lib/products/playbook-ai/catalogue/meta";
import type { PbActor } from "../src/lib/products/playbook-ai/documents-types";

// Runs only against a throwaway database: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>. Run with the server-only shim.
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const oid = () => String(new ObjectId());
const actor = (id: string, roles: string[], name: string): PbActor => ({ id, name, email: `${name.toLowerCase()}@co.test`, roles, permissionOverrides: null });
const ann = actor(oid(), ["sop_author"], "Ann"), ann2 = actor(oid(), ["sop_author"], "Anna");
const mona = actor(oid(), ["sop_manager"], "Mona"), mike = actor(oid(), ["sop_manager"], "Mike");
const adam = actor(oid(), ["sop_admin"], "Adam");
const hrAuthor = actor(oid(), ["sop_author", "hr"], "Hema");
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const bad = <T extends { ok: boolean }>(r: T, code: string) => { assert.equal(r.ok, false, "expected a failure"); const e = (r as unknown as { error: { code: string } }).error; assert.equal(e.code, code, JSON.stringify(e)); return e as Record<string, unknown> & { message: string }; };
const body = (n = "x"): PBDoc => {
  const r = parseDoc({ schemaVersion: 1, lang: "en", page: DEFAULT_PAGE, header: [], footer: [], body: [{ type: "paragraph", content: [{ type: "text", text: n }] }] }, { assignIds: true });
  if (!r.ok) throw new Error("bad doc");
  return r.doc;
};
const mk = async (a: PbActor, typeId: string | null = null) => ok(await createDocument(a, { title: "Doc", pbdoc: body(), docTypeId: typeId })).document._id;
/** Submits as `by` and approves as `approver` unless the default already approved it. */
const toApproved = async (id: string, by: PbActor, approver: PbActor) => {
  const r = ok(await transitionDocument(by, { id, transition: "submit" }));
  if (r.document.status === "in_review") ok(await transitionDocument(approver, { id, transition: "approve" }));
};
const rows = async (userId: string, type: string) => (await getDb()).collection("panel_notifications").find({ userId, type } as never).toArray();

(async () => {
  await t("settings validation (pure)", () => {
    assert.equal(validateSettings({ approval: { default: { requireDifferentApprover: "yes" } } }).ok, false);
    assert.equal(validateSettings({ retentionMonths: { default: 0 } }).ok, false);
    assert.equal(validateSettings({ categoryRoles: { hr: ["HR!"] } }).ok, false);
    assert.equal(validateSettings({ legalTypes: ["nope"] }).ok, false);
    const v = validateSettings({ approval: { byType: { "ct.nda": { requireDifferentApprover: true } } }, retentionMonths: { default: 84, byType: { "hr.offer": null } }, categoryRoles: { hr: ["hr", "hr"] } });
    assert.ok(v.ok && v.value.categoryRoles.hr.length === 1 && v.value.retentionMonths.default === 84);
  });

  const db0 = await runAsCompany("co_a", () => getDb());
  assert.ok(db0.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  resetPbDocumentIndexes(); resetPbVersionIndexes(); resetPbAuditIndexes();
  setStatusPolicy(settingsStatusPolicy);

  await runAsCompany("co_a", async () => {
    const db = await getDb();
    const users = [ann, ann2, mona, mike, adam, hrAuthor];
    await db.collection("admin_users").insertMany(users.map((u) => ({ _id: new ObjectId(u.id), name: u.name, email: u.email, roles: u.roles, status: "active" })) as never[]);

    await t("default (owner decision 5): an author's own document is approved as soon as it is submitted, recorded as automatic", async () => {
      const id = await mk(ann);
      const r = ok(await transitionDocument(ann, { id, transition: "submit" }));
      assert.equal(r.autoApproved, true);
      assert.equal(r.document.status, "approved");
      assert.equal(r.document.review!.decision, "auto_approved");
      const kinds = [1, 2].map(async (n) => ok(await getDocumentVersion(ann, id, n)).version.kind);
      assert.deepEqual(await Promise.all(kinds), ["submit", "approve"]);
      assert.ok(ok(await getDocumentActivity(adam, id)).items.some((i) => i.action === "auto_approve"));
      assert.equal((await rows(mona.id, "sop_doc_review_requested")).length, 0, "nobody is asked to review a document that needed no review");
      // an author cannot issue, however: issuing stays with ISSUE
      bad(await transitionDocument(ann, { id, transition: "issue" }), "forbidden");
      ok(await transitionDocument(mona, { id, transition: "issue" }));
    });

    await t("someone else submitting the author's draft still goes to review, and approvers are notified", async () => {
      const id = await mk(ann);
      const r = ok(await transitionDocument(mona, { id, transition: "submit" }));
      assert.equal(r.autoApproved, false);
      assert.equal(r.document.status, "in_review");
      const toMike = await rows(mike.id, "sop_doc_review_requested");
      assert.equal(toMike.length, 1);
      assert.match(String((toMike[0] as { link: string }).link), new RegExp(`/playbook-ai/documents/${id}$`));
      assert.equal((await rows(mona.id, "sop_doc_review_requested")).length, 0, "the person who asked is not notified");
      assert.equal((await rows(ann.id, "sop_doc_review_requested")).length, 0, "authors are not approvers");
    });

    await t("reject needs a reason, sends the document back and tells the author with the reason; approval notifies too", async () => {
      const id = await mk(ann);
      ok(await transitionDocument(mona, { id, transition: "submit" }));
      bad(await transitionDocument(mike, { id, transition: "reject" }), "reason_required");
      bad(await transitionDocument(ann, { id, transition: "reject", reason: "no" }), "forbidden");
      const rej = ok(await transitionDocument(mike, { id, transition: "reject", reason: "Clause 4 is wrong" }));
      assert.equal(rej.document.status, "draft");
      assert.equal(rej.document.review!.reason, "Clause 4 is wrong");
      const n = await rows(ann.id, "sop_doc_rejected");
      assert.equal(n.length, 1);
      assert.match(String((n[0] as { body: string }).body), /Clause 4 is wrong/);
      await toApproved(id, mona, mike);
      assert.equal((await rows(ann.id, "sop_doc_approved")).length, 1);
      ok(await transitionDocument(mike, { id, transition: "issue" }));
      assert.equal((await rows(ann.id, "sop_doc_issued")).length, 2, "one for the first test document and one for this one");
      assert.equal((await rows(mike.id, "sop_doc_issued")).length, 0, "the person who issued is not told");
    });

    await t("company setting per type: require a different approver (no auto-approve, no self-approval)", async () => {
      assert.ok((await savePbSettings(adam, { approval: { byType: { "ct.nda": { requireDifferentApprover: true } } } })).ok);
      const nda = await mk(mona, "ct.nda");
      const r = ok(await transitionDocument(mona, { id: nda, transition: "submit" }));
      assert.equal(r.autoApproved, false);
      assert.equal(r.document.status, "in_review");
      assert.equal(bad(await transitionDocument(mona, { id: nda, transition: "approve" }), "self_approval").message, "A different person must approve this document.");
      ok(await transitionDocument(mike, { id: nda, transition: "approve" }));
      // another type keeps the default
      const other = await mk(mona, "ct.msa");
      assert.equal(ok(await transitionDocument(mona, { id: other, transition: "submit" })).autoApproved, true);
      // and the company default can be switched too
      assert.ok((await savePbSettings(adam, { approval: { default: { autoApproveOwn: false }, byType: { "ct.nda": { requireDifferentApprover: true } } } })).ok);
      const third = await mk(ann);
      assert.equal(ok(await transitionDocument(ann, { id: third, transition: "submit" })).document.status, "in_review");
      assert.ok((await savePbSettings(adam, { approval: { default: { autoApproveOwn: true } } })).ok);
    });

    await t("legal types need the lawyer-review confirmation at issue; it is recorded with user and time", async () => {
      const legal = ALL_META.find((m) => m.legal.review)!;
      const plain = ALL_META.find((m) => !m.legal.review)!;
      const st = await getPbSettings();
      assert.ok(isLegalType(st, legal.id) && !isLegalType(st, plain.id));
      const id = await mk(mona, legal.id);
      await toApproved(id, mona, mike);
      bad(await transitionDocument(mike, { id, transition: "issue" }), "legal_ack_required");
      assert.equal(ok(await getDocument(mike, id)).document.status, "approved");
      const iss = ok(await transitionDocument(mike, { id, transition: "issue", legalReviewConfirmed: true, now: new Date("2026-11-03T05:00:00Z") }));
      assert.equal(iss.document.legalAck!.by, mike.id);
      assert.ok(ok(await getDocumentActivity(adam, id)).items.some((i) => i.action === "legal_ack" && i.actorId === mike.id));
      // a non-legal type does not ask; a company can mark more types as legal
      const p = await mk(mona, plain.id);
      await toApproved(p, mona, mike);
      ok(await transitionDocument(mike, { id: p, transition: "issue" }));
      assert.ok((await savePbSettings(adam, { legalTypes: [plain.id] })).ok);
      const q = await mk(mona, plain.id);
      await toApproved(q, mona, mike);
      bad(await transitionDocument(mike, { id: q, transition: "issue" }), "legal_ack_required");
      assert.ok((await savePbSettings(adam, { legalTypes: [] })).ok);
    });

    await t("category access: HR documents only for HR roles, their author and a Director", async () => {
      assert.ok((await savePbSettings(adam, { categoryRoles: { hr: ["hr"] } })).ok);
      const hrDoc = await mk(mona, "hr.offer");
      const open = await mk(mona, "ct.msa");
      const own = await mk(ann, "hr.offer"); // an author's own document stays theirs
      bad(await getDocument(mike, hrDoc), "not_found"); // a manager without the hr role
      ok(await getDocument(mike, open));
      ok(await getDocument(hrAuthor, hrDoc));
      ok(await getDocument(mona, hrDoc)); // its author
      ok(await getDocument(ann, own));
      const ids = (a: PbActor) => listDocuments(a, { pageSize: 100 }).then((r) => ok(r).items.map((i) => i._id));
      const mikeSees = await ids(mike);
      assert.ok(!mikeSees.includes(hrDoc) && mikeSees.includes(open));
      assert.ok((await ids(hrAuthor)).includes(hrDoc));
      assert.ok((await ids(ann)).includes(own));
      assert.ok(!(await ids(mike)).includes(own));
      bad(await transitionDocument(mike, { id: hrDoc, transition: "submit" }), "not_found");
      assert.ok((await savePbSettings(adam, { categoryRoles: {} })).ok);
      ok(await getDocument(mike, hrDoc));
    });

    await t("retention and legal hold: purge only after the retention period, never under a hold; settings need rights", async () => {
      assert.equal((await savePbSettings(ann, { retentionMonths: { default: 12 } })).ok, false);
      assert.equal((await savePbSettings(mona, { retentionMonths: { default: 12 } })).ok, false);
      assert.ok((await savePbSettings(adam, { retentionMonths: { default: 12, byType: { "ct.nda": null } } })).ok);
      const id = await mk(mona);
      await toApproved(id, mona, mike);
      const issuedAt = new Date("2026-04-10T05:00:00Z");
      ok(await transitionDocument(mike, { id, transition: "issue", now: issuedAt }));
      ok(await transitionDocument(mike, { id, transition: "archive" }));
      bad(await deleteDocument(mona, id), "bad_status"); // issued documents are never soft-deleted
      bad(await purgeDocument(mona, id), "forbidden");
      const early = bad(await purgeDocument(adam, id, { now: new Date("2027-03-01T00:00:00Z") }), "retention_active");
      assert.equal(String(early.keepUntil).slice(0, 10), "2027-04-10");
      ok(await setLegalHold(adam, { id, hold: true, reason: "tax notice" }));
      bad(await purgeDocument(adam, id, { now: new Date("2030-01-01T00:00:00Z") }), "legal_hold");
      ok(await setLegalHold(adam, { id, hold: false }));
      ok(await purgeDocument(adam, id, { now: new Date("2027-04-11T00:00:00Z") }));
      bad(await getDocument(adam, id), "not_found");
      // a type with no retention set has no period at all
      const nda = await mk(mona, "ct.nda");
      await toApproved(nda, mona, adam);
      ok(await transitionDocument(adam, { id: nda, transition: "issue" }));
      ok(await transitionDocument(adam, { id: nda, transition: "archive" }));
      ok(await purgeDocument(adam, nda));
    });
  });

  await runAsCompany("co_a", async () => {
    // `savePbSettings` replaces the whole settings document with what it is given (the settings form posts everything).
    assert.ok((await savePbSettings(adam, { approval: { byType: { "ct.nda": { requireDifferentApprover: true } } } })).ok);
  });
  await runAsCompany("co_b", async () => {
    await t("two companies: approval rules and category access are per company", async () => {
      const st = await getPbSettings();
      assert.deepEqual(st.categoryRoles, {});
      assert.equal(st.approval.default.autoApproveOwn, true);
      assert.equal(st.approval.byType["ct.nda"], undefined);
      assert.equal((await savePbSettings(adam, { approval: { byType: { "ct.nda": { requireDifferentApprover: false } } } })).ok, true);
    });
  });
  await runAsCompany("co_a", async () => {
    await t("company A keeps its own rules", async () => {
      assert.equal((await getPbSettings()).approval.byType["ct.nda"]?.requireDifferentApprover, true);
    });
  });
  await (await getPlatformDb()).dropDatabase();
  console.log("test-pb-approvals: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
