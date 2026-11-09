import assert from "node:assert/strict";
import { getDb, getPlatformDb } from "../src/lib/mongodb";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { DEFAULT_PAGE, parseDoc, type PBDoc } from "../src/lib/products/playbook-ai/doc";
import {
  acquireLock, breakLock, compareVersions, createDocument, deleteDocument, getDocument, getDocumentActivity, getDocumentVersion, listDocuments, listDocumentVersions,
  purgeDocument, releaseLock, resetPbDocumentIndexes, restoreDeletedDocument, revertToVersion, saveDraft, saveVersion, setLegalHold, setStatusPolicy,
  transitionDocument, updatePageSettings, attachSealedExport,
} from "../src/lib/products/playbook-ai/documents";
import * as versionsModule from "../src/lib/products/playbook-ai/versions";
import { insertVersion, resetPbVersionIndexes } from "../src/lib/products/playbook-ai/versions";
import { listPbAudit, resetPbAuditIndexes } from "../src/lib/products/playbook-ai/pb-audit";
import { diffDocs, summarizeDiff, wordDiff } from "../src/lib/products/playbook-ai/diff";
import { NEUTRAL_STATUS_POLICY, documentCapabilities, nextStatus, transitionsFrom } from "../src/lib/products/playbook-ai/status";
import type { PbActor, PbDocumentRecord } from "../src/lib/products/playbook-ai/documents-types";

// Runs only against a throwaway database: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>. Run with the server-only shim.
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const actor = (id: string, name: string, roles: string[]): PbActor => ({ id, name, email: `${id}@co.test`, roles, permissionOverrides: null });
const ann = actor("u_ann", "Ann Author", ["sop_author"]);
const ann2 = actor("u_ann2", "Anna Other", ["sop_author"]);
const mona = actor("u_mona", "Mona Manager", ["sop_manager"]);
const adam = actor("u_adam", "Adam Admin", ["sop_admin"]);
const emma = actor("u_emma", "Emma Employee", ["sop_employee"]);

const mk = (texts: string[]): PBDoc => {
  const r = parseDoc({ schemaVersion: 1, lang: "en", page: DEFAULT_PAGE, header: [], footer: [], body: texts.map((x) => ({ type: "paragraph", content: [{ type: "text", text: x }] })) }, { assignIds: true });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.doc;
};
const setText = (d: PBDoc, i: number, text: string): PBDoc => {
  const c = structuredClone(d);
  (c.body[i] as { content: unknown[] }).content = [{ type: "text", text }];
  return c;
};
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const bad = <T extends { ok: boolean }>(r: T, code: string) => {
  assert.equal(r.ok, false, "expected a failure");
  const e = (r as unknown as { error: { code: string; message: string } }).error;
  assert.equal(e.code, code, JSON.stringify(e));
  return e as Record<string, unknown> & { code: string; message: string };
};

(async () => {
  await t("status graph (pure)", () => {
    assert.deepEqual(transitionsFrom("draft"), ["submit", "archive"]);
    assert.deepEqual(nextStatus("draft", "submit"), { ok: true, to: "in_review" });
    assert.equal(nextStatus("draft", "approve").ok, false);
    assert.equal(nextStatus("draft", "issue").ok, false, "cannot skip review");
    assert.equal(nextStatus("in_review", "approve").ok && nextStatus("approved", "issue").ok, true);
    assert.deepEqual(nextStatus("issued", "revise"), { ok: true, to: "draft" });
    assert.deepEqual(nextStatus("archived", "restore", "issued"), { ok: true, to: "issued" });
    assert.deepEqual(nextStatus("archived", "restore", null), { ok: true, to: "draft" });
    assert.equal(nextStatus("issued", "archive").ok, true);
    assert.equal(nextStatus("archived", "submit").ok, false);
    const caps = documentCapabilities(ann, { status: "draft", createdBy: "u_ann", acl: [] });
    assert.ok(caps.edit && caps.transitions.includes("submit") && !caps.purge);
    assert.equal(documentCapabilities(emma, { status: "draft", createdBy: "u_ann", acl: [] }).view, false);
    assert.equal(documentCapabilities(mona, { status: "in_review", createdBy: "u_ann", acl: [] }).transitions.includes("approve"), true);
  });

  await t("diff (pure): added, removed, changed, moved, formatting, words, page, variables", () => {
    const a = mk(["One", "Two", "Three", "Four"]);
    const b = structuredClone(a);
    b.body = [b.body[3], setText({ ...a, body: [a.body[0]] } as PBDoc, 0, "One changed").body[0], b.body[2]];
    const moved = diffDocs(a, b);
    const byId = new Map(moved.entries.map((e) => [e.id, e]));
    assert.equal(byId.get(a.body[1].id)!.kind, "removed");
    assert.equal(byId.get(a.body[0].id)!.kind, "changed");
    assert.ok(byId.get(a.body[0].id)!.words!.some((w) => w.op === "add" && w.text.includes("changed")));
    assert.ok(moved.entries.some((e) => e.kind === "moved" || e.moved), "a reordered block is reported as moved");
    const added = diffDocs(a, mk(["x"]));
    assert.equal(added.summary.added, 1);
    assert.equal(diffDocs(a, structuredClone(a)).identical, true);
    const bold = structuredClone(a);
    (bold.body[0] as { content: unknown[] }).content = [{ type: "text", text: "One", marks: [{ type: "bold" }] }];
    const fmt = diffDocs(a, bold);
    assert.equal(fmt.entries[0].kind, "changed");
    assert.equal(fmt.entries[0].attrChanges[0].attr, "formatting");
    const pg = structuredClone(a);
    pg.page.margins.left = 30;
    assert.equal(diffDocs(a, pg).page.changed, true);
    assert.match(summarizeDiff(diffDocs(a, pg)), /page settings changed/);
    const v1 = mk(["Dear {x}"]);
    const withVar = structuredClone(v1);
    (withVar.body[0] as { content: unknown[] }).content = [{ type: "var", key: "employee.name" }];
    const vc = diffDocs(withVar, withVar, { valuesBefore: { "employee.name": "A" }, valuesAfter: { "employee.name": "B" } });
    assert.deepEqual(vc.variableChanges, [{ key: "employee.name", before: "A", after: "B" }]);
    assert.equal(wordDiff("same", "same"), null);
    assert.deepEqual(wordDiff("a b", "a c")!.filter((w) => w.op !== "equal").map((w) => `${w.op}:${w.text.trim()}`).sort(), ["add:c", "remove:b"]);
  });

  const db0 = await runAsCompany("co_a", () => getDb());
  assert.ok(db0.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  resetPbDocumentIndexes(); resetPbVersionIndexes(); resetPbAuditIndexes();
  setStatusPolicy(NEUTRAL_STATUS_POLICY); // the settings-based default (author approves own) is tested in test-pb-approvals

  let docId = "";
  await runAsCompany("co_a", async () => {
    let doc: PbDocumentRecord;
    await t("create: validates, needs CREATE, starts as draft rev 1", async () => {
      bad(await createDocument(emma, { title: "x" }), "forbidden");
      bad(await createDocument(ann, { title: "   " }), "invalid");
      bad(await createDocument(ann, { title: "x", pbdoc: { nope: 1 } }), "invalid");
      doc = ok(await createDocument(ann, { title: "Offer letter", pbdoc: mk(["Para one", "Para two"]) })).document;
      docId = doc._id;
      assert.equal(doc.status, "draft"); assert.equal(doc.rev, 1); assert.equal(doc.versionSeq, 0);
      assert.equal(doc.contentSha256.length, 64);
    });

    await t("visibility: author sees own, manager sees all, other author and reader see nothing", async () => {
      ok(await getDocument(ann, docId)); ok(await getDocument(mona, docId));
      bad(await getDocument(ann2, docId), "not_found");
      bad(await getDocument(emma, docId), "not_found");
      assert.equal(ok(await listDocuments(ann, {})).total, 1);
      assert.equal(ok(await listDocuments(ann2, {})).total, 0);
      assert.equal(ok(await listDocuments(mona, {})).total, 1);
      assert.equal(ok(await listDocuments(mona, { q: "offer" })).total, 1);
      assert.equal(ok(await listDocuments(mona, { q: "zzz" })).total, 0);
    });

    await t("autosave bumps rev; identical content is a no-op", async () => {
      const r1 = ok(await saveDraft(ann, { id: docId, rev: 1, pbdoc: setText(doc.pbdoc, 0, "Edited by Ann") }));
      assert.equal(r1.rev, 2); assert.equal(r1.unchanged, false);
      const again = ok(await saveDraft(ann, { id: docId, rev: 2, pbdoc: setText(doc.pbdoc, 0, "Edited by Ann") }));
      assert.equal(again.unchanged, true); assert.equal(again.rev, 2);
    });

    await t("CONFLICT: a stale save is rejected with who and when, and never overwrites", async () => {
      const mine = ok(await saveDraft(mona, { id: docId, rev: 2, pbdoc: setText(doc.pbdoc, 1, "Mona's change") }));
      assert.equal(mine.rev, 3);
      const stale = bad(await saveDraft(ann, { id: docId, rev: 2, pbdoc: setText(doc.pbdoc, 1, "Ann stale overwrite") }), "conflict");
      assert.equal((stale.changedBy as { name: string }).name, "Mona Manager");
      assert.equal(stale.currentRev, 3); assert.equal(stale.yourRev, 2);
      assert.ok(Date.now() - new Date(stale.changedAt as string).getTime() < 60_000);
      assert.match(stale.message, /Mona Manager changed this document/);
      const cur = ok(await getDocument(ann, docId)).document;
      assert.match(JSON.stringify(cur.pbdoc.body[1]), /Mona's change/);
      assert.doesNotMatch(JSON.stringify(cur.pbdoc), /stale overwrite/);
      doc = cur;
    });

    await t("CONFLICT under concurrency: 8 saves from the same rev, exactly one wins", async () => {
      const cur = ok(await getDocument(ann, docId)).document;
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => saveDraft(ann, { id: docId, rev: cur.rev, pbdoc: setText(cur.pbdoc, 0, `racer ${i}`) })));
      assert.equal(results.filter((r) => r.ok).length, 1);
      for (const r of results) if (!r.ok) assert.equal(r.error.code, "conflict");
      assert.equal(ok(await getDocument(ann, docId)).document.rev, cur.rev + 1);
      doc = ok(await getDocument(ann, docId)).document;
    });

    await t("edit lock: held by one editor blocks others, expires, can be released or broken", async () => {
      const lk = ok(await acquireLock(mona, docId));
      assert.equal(lk.lock.userId, "u_mona");
      const blocked = bad(await saveDraft(ann, { id: docId, rev: doc.rev, pbdoc: setText(doc.pbdoc, 0, "locked out") }), "locked");
      assert.equal((blocked.lockedBy as { name: string }).name, "Mona Manager");
      bad(await acquireLock(ann, docId), "locked");
      ok(await acquireLock(mona, docId)); // renew
      const s = ok(await saveDraft(mona, { id: docId, rev: doc.rev, pbdoc: setText(doc.pbdoc, 0, "by lock holder") }));
      doc = ok(await getDocument(mona, docId)).document;
      assert.equal(s.rev, doc.rev);
      bad(await breakLock(ann, docId), "forbidden");
      ok(await releaseLock(ann, docId)); // not the holder: no effect
      bad(await acquireLock(ann, docId), "locked");
      // expire it
      const db = await getDb();
      await db.collection("pb_documents").updateOne({ _id: docId } as never, { $set: { "lock.expiresAt": new Date(Date.now() - 1000) } });
      ok(await saveDraft(ann, { id: docId, rev: doc.rev, pbdoc: setText(doc.pbdoc, 0, "after expiry") }));
      doc = ok(await getDocument(ann, docId)).document;
      ok(await acquireLock(ann, docId));
      ok(await breakLock(adam, docId));
      assert.equal(ok(await getDocument(ann, docId)).document.lock, null);
      ok(await acquireLock(ann, docId)); ok(await releaseLock(ann, docId));
    });

    await t("page settings: validated, stored in the document, rev-checked", async () => {
      bad(await updatePageSettings(ann, { id: docId, rev: doc.rev, page: { ...DEFAULT_PAGE, margins: { ...DEFAULT_PAGE.margins, left: 5 } } }), "invalid");
      bad(await updatePageSettings(ann, { id: docId, rev: doc.rev, page: { ...DEFAULT_PAGE, margins: { top: 25, bottom: 25, left: 60, right: 60 } } }), "invalid");
      const r = ok(await updatePageSettings(ann, { id: docId, rev: doc.rev, page: { ...DEFAULT_PAGE, margins: { top: 30, right: 15, bottom: 30, left: 15 } } }));
      const cur = ok(await getDocument(ann, docId)).document;
      assert.deepEqual(cur.pbdoc.page.margins, { top: 30, right: 15, bottom: 30, left: 15 });
      assert.equal(cur.rev, r.rev);
      bad(await updatePageSettings(ann, { id: docId, rev: doc.rev, page: DEFAULT_PAGE }), "conflict");
      doc = cur;
    });

    await t("save version: named, immutable, unique number, identical draft is not duplicated", async () => {
      const v1 = ok(await saveVersion(ann, { id: docId, label: "First draft", changeNote: "initial" }));
      assert.equal(v1.created, true); assert.equal(v1.version.number, 1); assert.equal(v1.version.label, "First draft");
      const dup = ok(await saveVersion(ann, { id: docId }));
      assert.equal(dup.created, false); assert.equal(dup.version.number, 1);
      // the database refuses a second row with the same number
      const full = ok(await getDocumentVersion(ann, docId, 1)).version;
      await assert.rejects(insertVersion({ ...full, number: 1 } as never), /duplicate key|E11000/);
      // there is no way to change a version through the module
      const names = Object.keys(versionsModule).sort();
      assert.deepEqual(names, ["attachSealedExport", "getLatestVersion", "getVersionByNumber", "insertVersion", "listVersionSummaries", "purgeVersionsOfDocument", "resetPbVersionIndexes"]);
      // sealed export attaches once, only to an issued version
      assert.equal(await attachSealedExport(docId, 1, "pdf", { key: "k", sha256: "a".repeat(64) }), false, "not an issued version");
      doc = ok(await getDocument(ann, docId)).document;
      ok(await saveDraft(ann, { id: docId, rev: doc.rev, pbdoc: setText(doc.pbdoc, 1, "Second draft text") }));
      const v2 = ok(await saveVersion(ann, { id: docId, kind: "auto" }));
      assert.equal(v2.version.number, 2); assert.equal(v2.version.kind, "auto");
      assert.deepEqual(ok(await listDocumentVersions(ann, docId)).versions.map((v) => v.number), [2, 1]);
      assert.equal(ok(await getDocumentVersion(ann, docId, 1)).version.contentSha256 !== ok(await getDocumentVersion(ann, docId, 2)).version.contentSha256, true);
    });

    await t("compare: block diff and word diff between versions and the draft", async () => {
      const r = ok(await compareVersions(ann, { id: docId, from: 1, to: 2 }));
      assert.ok(r.diff.summary.changed >= 1);
      assert.match(r.summary, /changed/);
      assert.equal(ok(await compareVersions(ann, { id: docId, from: 2, to: "draft" })).diff.identical, true);
      bad(await compareVersions(ann, { id: docId, from: 1, to: 99 }), "not_found");
    });

    await t("revert: copies an old version into the draft as a NEW version; history untouched", async () => {
      doc = ok(await getDocument(ann, docId)).document;
      const v1before = ok(await getDocumentVersion(ann, docId, 1)).version;
      const r = ok(await revertToVersion(ann, { id: docId, number: 1, rev: doc.rev }));
      assert.equal(r.version.number, 3); assert.equal(r.version.kind, "revert"); assert.equal(r.version.revertedFrom, 1);
      const cur = ok(await getDocument(ann, docId)).document;
      assert.equal(cur.contentSha256, v1before.contentSha256);
      assert.deepEqual((await Promise.all([1, 2].map(async (n) => ok(await getDocumentVersion(ann, docId, n)).version.contentSha256)))[0], v1before.contentSha256);
      bad(await revertToVersion(ann, { id: docId, number: 1, rev: doc.rev }), "conflict");
      bad(await revertToVersion(ann, { id: docId, number: 42, rev: cur.rev }), "not_found");
      doc = cur;
    });

    await t("workflow: submit, permissions, frozen while in review, reject needs a reason", async () => {
      bad(await transitionDocument(ann, { id: docId, transition: "approve" }), "bad_status");
      bad(await transitionDocument(ann, { id: docId, transition: "issue" }), "bad_status");
      const sub = ok(await transitionDocument(ann, { id: docId, transition: "submit", rev: doc.rev }));
      assert.equal(sub.document.status, "in_review"); assert.equal(sub.version!.kind, "submit"); assert.equal(sub.autoApproved, false);
      bad(await saveDraft(ann, { id: docId, rev: sub.document.rev, pbdoc: setText(doc.pbdoc, 0, "sneaky") }), "bad_status");
      bad(await transitionDocument(ann, { id: docId, transition: "approve" }), "forbidden");
      bad(await transitionDocument(mona, { id: docId, transition: "reject" }), "reason_required");
      const rej = ok(await transitionDocument(mona, { id: docId, transition: "reject", reason: "Fix clause 2" }));
      assert.equal(rej.document.status, "draft"); assert.equal(rej.document.review!.reason, "Fix clause 2");
      ok(await transitionDocument(ann, { id: docId, transition: "submit" }));
      ok(await transitionDocument(ann, { id: docId, transition: "withdraw" }));
      ok(await transitionDocument(ann, { id: docId, transition: "submit" }));
    });

    await t("approval policy hook: require a different approver", async () => {
      setStatusPolicy({ ...NEUTRAL_STATUS_POLICY, requireDifferentApprover: () => true });
      const own = ok(await createDocument(mona, { title: "Mona's own", pbdoc: mk(["x"]) })).document;
      ok(await transitionDocument(mona, { id: own._id, transition: "submit" }));
      bad(await transitionDocument(mona, { id: own._id, transition: "approve" }), "self_approval");
      ok(await transitionDocument(adam, { id: own._id, transition: "approve" }));
      setStatusPolicy(NEUTRAL_STATUS_POLICY);
    });

    await t("approval policy hook: auto-approve on submit is recorded as automatic", async () => {
      setStatusPolicy({ ...NEUTRAL_STATUS_POLICY, autoApproveOnSubmit: () => true });
      const d = ok(await createDocument(ann, { title: "Auto", pbdoc: mk(["x"]) })).document;
      const s = ok(await transitionDocument(ann, { id: d._id, transition: "submit" }));
      assert.equal(s.autoApproved, true); assert.equal(s.document.status, "approved"); assert.equal(s.document.review!.decision, "auto_approved");
      assert.deepEqual((await Promise.all([1, 2].map(async (n) => ok(await getDocumentVersion(ann, d._id, n)).version.kind))), ["submit", "approve"]);
      setStatusPolicy(NEUTRAL_STATUS_POLICY);
    });

    await t("approve then issue: version per step, number from the assigner, issued content frozen", async () => {
      const ap = ok(await transitionDocument(mona, { id: docId, transition: "approve" }));
      assert.equal(ap.document.status, "approved");
      bad(await transitionDocument(ann, { id: docId, transition: "issue" }), "forbidden");
      let calls = 0;
      const iss = ok(await transitionDocument(mona, { id: docId, transition: "issue", assignNumber: async () => { calls++; return "OFR/2026-27/0001"; } }));
      assert.equal(calls, 1);
      assert.equal(iss.document.status, "issued"); assert.equal(iss.document.docNumber, "OFR/2026-27/0001");
      assert.equal(iss.version!.kind, "issue"); assert.equal(iss.document.issuedVersion, iss.version!.number);
      const full = ok(await getDocumentVersion(ann, docId, iss.version!.number)).version;
      assert.ok(full.variableSnapshot && full.variableSnapshot.sha256.length === 64);
      assert.equal(full.docNumber, "OFR/2026-27/0001");
      bad(await saveDraft(ann, { id: docId, rev: iss.document.rev, pbdoc: setText(doc.pbdoc, 0, "tamper") }), "bad_status");
      // the sealed export reference is set once and never replaced
      assert.equal(await attachSealedExport(docId, full.number, "pdf", { key: "blob/1.pdf", sha256: "b".repeat(64) }), true);
      assert.equal(await attachSealedExport(docId, full.number, "pdf", { key: "blob/2.pdf", sha256: "c".repeat(64) }), false);
      assert.equal(ok(await getDocumentVersion(ann, docId, full.number)).version.exports.pdf!.key, "blob/1.pdf");
    });

    await t("revise an issued document: back to draft, old issued version stays, reissue keeps the number", async () => {
      const issuedNo = ok(await getDocument(ann, docId)).document.issuedVersion!;
      const before = ok(await getDocumentVersion(ann, docId, issuedNo)).version;
      bad(await transitionDocument(ann, { id: docId, transition: "revise" }), "forbidden");
      const rv = ok(await transitionDocument(mona, { id: docId, transition: "revise" }));
      assert.equal(rv.document.status, "draft");
      ok(await saveDraft(mona, { id: docId, rev: rv.document.rev, pbdoc: setText(rv.document.pbdoc, 0, "Revised after issue") }));
      const cur = ok(await getDocument(mona, docId)).document;
      ok(await transitionDocument(mona, { id: docId, transition: "submit" }));
      ok(await transitionDocument(mona, { id: docId, transition: "approve" }));
      const again = ok(await transitionDocument(mona, { id: docId, transition: "issue", assignNumber: async () => { throw new Error("must not renumber"); } }));
      assert.equal(again.document.docNumber, "OFR/2026-27/0001");
      assert.ok(again.version!.number > issuedNo);
      const after = ok(await getDocumentVersion(ann, docId, issuedNo)).version;
      assert.equal(after.contentSha256, before.contentSha256, "the earlier issued version is untouched");
      assert.notEqual(cur.contentSha256, before.contentSha256);
    });

    await t("audit trail: recorded, readable only with VIEW_AUDIT", async () => {
      const a = ok(await getDocumentActivity(adam, docId));
      const actions = new Set(a.items.map((i) => i.action));
      for (const x of ["create", "save_version", "revert", "submit", "approve", "issue", "revise", "reject", "lock", "page_settings"]) assert.ok(actions.has(x as never), `missing audit action ${x}`);
      bad(await getDocumentActivity(ann, docId), "forbidden");
    });

    await t("trash, legal hold and purge", async () => {
      const d = ok(await createDocument(ann, { title: "Scratch", pbdoc: mk(["x"]) })).document;
      bad(await deleteDocument(ann2, d._id), "not_found");
      ok(await deleteDocument(ann, d._id));
      assert.equal(ok(await listDocuments(ann, {})).items.some((i) => i._id === d._id), false);
      assert.equal(ok(await listDocuments(ann, { deleted: true })).total, 1);
      bad(await getDocument(ann, d._id), "not_found");
      ok(await restoreDeletedDocument(ann, d._id));
      ok(await getDocument(ann, d._id));
      bad(await deleteDocument(mona, docId), "bad_status"); // issued/revised-and-issued
      bad(await purgeDocument(mona, d._id), "forbidden");
      bad(await purgeDocument(adam, d._id), "bad_status"); // not in the trash
      ok(await deleteDocument(ann, d._id));
      bad(await setLegalHold(mona, { id: d._id, hold: true }), "forbidden");
      ok(await setLegalHold(adam, { id: d._id, hold: true, reason: "dispute" }));
      bad(await purgeDocument(adam, d._id), "legal_hold");
      ok(await setLegalHold(adam, { id: d._id, hold: false }));
      bad(await saveVersion(ann, { id: d._id }), "not_found"); // a trashed document cannot be versioned
      const p = ok(await purgeDocument(adam, d._id));
      assert.equal(p.versionsRemoved, 0);
      assert.equal(await (await getDb()).collection("pb_documents").countDocuments({ _id: d._id } as never), 0);
      const trail = await listPbAudit(adam, { documentId: d._id });
      assert.ok(trail.ok && trail.items.some((i) => i.action === "purge"), "the purge itself stays in the audit trail");
    });
  });

  await runAsCompany("co_b", async () => {
    await t("two companies: nothing leaks between tenants, same ids and numbers do not collide", async () => {
      assert.equal(ok(await listDocuments(adam, {})).total, 0);
      bad(await getDocument(adam, docId), "not_found");
      bad(await saveDraft(adam, { id: docId, rev: 1, pbdoc: mk(["x"]) }), "not_found");
      bad(await transitionDocument(adam, { id: docId, transition: "archive" }), "not_found");
      assert.equal((await listDocumentVersions(adam, docId)).ok, false);
      const own = ok(await createDocument(adam, { title: "B's document", pbdoc: mk(["b"]) })).document;
      assert.equal(ok(await listDocuments(adam, {})).total, 1);
      ok(await saveVersion(adam, { id: own._id, label: "v" }));
      const s = ok(await transitionDocument(adam, { id: own._id, transition: "submit" }));
      assert.equal(s.version!.number, 2);
    });
  });
  await runAsCompany("co_a", async () => {
    await t("company A is unchanged by company B's activity", async () => {
      assert.ok(ok(await listDocuments(adam, {})).items.every((i) => i.title !== "B's document"));
      assert.equal((await (await getDb()).collection("pb_versions").countDocuments({})) > 0, true);
    });
  });
  await (await getPlatformDb()).dropDatabase();
  console.log("test-pb-versions: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
