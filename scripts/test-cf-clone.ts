import assert from "node:assert/strict";

// Clone store (B1). Throwaway database only: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>. No network, no real provider.
const uri = process.env.MONGODB_URI ?? "";
assert.ok(/zz_throwaway_/.test(uri) && !/\.env/.test(uri), "Run with MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>");
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };

(async () => {
  const { getDb, getPlatformDb } = await import("../src/lib/mongodb");
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const C = await import("../src/lib/products/contractflow-ai/clones");
  const RN = await import("../src/lib/products/contractflow-ai/clone-render");
  const RQ = await import("../src/lib/products/contractflow-ai/requests");
  const P = await import("../src/lib/products/contractflow-ai/parties");
  const PBD = await import("../src/lib/products/playbook-ai/documents");
  const { insertVersion } = await import("../src/lib/products/playbook-ai/versions");
  const { parseDoc } = await import("../src/lib/products/playbook-ai/doc/validate");
  const { contentHash } = await import("../src/lib/products/playbook-ai/doc/hash");
  const { offerLetterRaw, OFFER_VALUES, OFFER_LISTS } = await import("./lib/pbdoc-fixtures");
  type Viewer = import("../src/lib/products/contractflow-ai/types").LpmsViewer;
  const pdb = await getPlatformDb();
  assert.ok(/zz_throwaway_/.test(pdb.databaseName), "refusing to run on " + pdb.databaseName);
  await pdb.dropDatabase();

  const viewer = (roles: string[], id = roles.join("_")): Viewer => ({ userId: "u_" + id, email: "x@test.invalid", roles, overrides: {}, lpmsRoles: [], employeeId: null, companyId: "" });
  const AUTHOR = viewer(["lpms_author"]);
  const AUTHOR2 = viewer(["lpms_author"], "second");
  const MANAGER = viewer(["lpms_manager"]);
  const READER = viewer(["lpms_viewer"]);
  const SALES = viewer(["pms_manager", "lpms_author"], "sales");
  const pbActor = (roles: string[]) => ({ id: "pb_" + roles.join("_"), email: "pb@test.invalid", name: "Pat Playbook", roles, permissionOverrides: {} });
  const PB_MANAGER = pbActor(["sop_manager"]);
  const PB_AUTHOR = pbActor(["sop_author"]);
  const inA = <T,>(fn: () => Promise<T>) => runAsCompany("coA", fn);
  const inB = <T,>(fn: () => Promise<T>) => runAsCompany("coB", fn);
  const days = (n: number) => new Date(Date.now() + n * 86_400_000);
  const rejectsWith = (r: { ok: boolean; error?: { code: string } }, code: string, msg?: string) => { assert.equal(r.ok, false, msg); assert.equal((r as { error: { code: string } }).error.code, code, msg); };
  const signers = [{ role: "counterparty" as const, name: "Asha Rao", email: "asha@candidate.test" }, { role: "company_signatory" as const, name: "Hari HR", email: "hari@orbit.test" }];
  const party = { type: "other", displayName: "Asha Rao" };

  // ── A real Playbook document and approved version in company A ──
  const setup = () => inA(async () => {
    const created = await PBD.createDocument(PB_MANAGER, { title: "Offer letter", pbdoc: offerLetterRaw() });
    assert.ok(created.ok, JSON.stringify(created));
    const d = (created as { document: import("../src/lib/products/playbook-ai/documents-types").PbDocumentRecord }).document;
    const parsed = parseDoc(d.pbdoc, { assignIds: false });
    assert.ok(parsed.ok);
    const snapshot = { takenAt: new Date().toISOString(), values: OFFER_VALUES, lists: OFFER_LISTS, sources: [], sha256: "test" };
    const base = { documentId: d._id, kind: "manual" as const, label: null, changeNote: null, title: d.title, docNumber: "OFR/2026-27/0001", pbdoc: d.pbdoc, contentSha256: contentHash(parsed.ok ? parsed.doc : d.pbdoc), templateRef: null, revertedFrom: null, authorId: PB_MANAGER.id, authorName: "Pat Playbook" };
    const approved = await insertVersion({ ...base, number: 1, status: "approved", variableSnapshot: snapshot });
    const draft = await insertVersion({ ...base, number: 2, status: "draft", variableSnapshot: snapshot });
    const noSnapshot = await insertVersion({ ...base, number: 3, status: "approved", variableSnapshot: null });
    return { doc: d, approved, draft, noSnapshot };
  });
  const src = await setup();
  const sourceRows = () => inA(async () => {
    const db = await getDb();
    const pick = async (name: string) => JSON.stringify(await db.collection(name).find({}).sort({ _id: 1 }).toArray());
    return { documents: await pick("pb_documents"), versions: await pick("pb_versions"), templates: await pick("pb_templates") };
  });
  const sourceBefore = await sourceRows();
  const input = { documentId: src.doc._id, versionId: src.approved._id, party, signers };
  const make = async (over: Partial<typeof input> = {}, actor = PB_MANAGER) => inA(() => C.createCloneFromPlaybook(actor, { ...input, ...over }));
  const edited = (doc: unknown, text: string) => {
    const c = structuredClone(doc) as { body: unknown[] };
    let done = false;
    const walk = (n: unknown): void => {
      if (done || !n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (o.type === "text" && typeof o.text === "string" && o.text.length > 12) { o.text = text; done = true; return; }
      for (const v of Object.values(o)) { if (Array.isArray(v)) v.forEach(walk); else walk(v); }
    };
    walk(c.body);
    assert.ok(done, "no text to edit");
    return c;
  };

  console.log("creating");
  let a: import("../src/lib/products/contractflow-ai/clone-types").CloneDoc;
  await t("sending copies the version and its frozen values into an independent draft clone", async () => {
    const r = await make();
    assert.ok(r.ok, JSON.stringify(r));
    a = (r as { clone: typeof a }).clone;
    assert.equal(a.status, "clone_draft");
    assert.equal(a.rev, 1);
    assert.equal(a.contentSha256, src.approved.contentSha256);
    assert.equal(a.source.sourceContentSha256, src.approved.contentSha256);
    assert.deepEqual([a.source.documentId, a.source.versionId, a.source.versionNumber], [src.doc._id, src.approved._id, 1]);
    assert.deepEqual(a.variableSnapshot.values, OFFER_VALUES);
    assert.equal(a.party.displayName, "Asha Rao");
    assert.equal(a.signerPlan.length, 2);
    const again = await make();
    assert.ok(again.ok && (again as { clone: typeof a }).clone._id !== a._id, "a second send is a second clone");
  });
  await t("refusals: no permission, draft version, no frozen values, wrong ids, bad party or signers, damaged source", async () => {
    rejectsWith(await make({}, PB_AUTHOR), "forbidden");
    rejectsWith(await make({ versionId: src.draft._id }), "bad_status");
    rejectsWith(await make({ versionId: src.noSnapshot._id }), "source_unavailable");
    rejectsWith(await make({ versionId: "nope" }), "not_found");
    rejectsWith(await make({ documentId: "nope" }), "not_found");
    rejectsWith(await make({ party: { type: "nonsense", displayName: "x" } }), "invalid");
    rejectsWith(await make({ party: { type: "client", partyId: "missing" } }), "invalid");
    rejectsWith(await make({ signers: [] }), "invalid");
    rejectsWith(await make({ signers: [signers[0], signers[0]] }), "invalid");
    await inA(async () => (await getDb()).collection("pb_versions").updateOne({ _id: src.approved._id } as never, { $set: { contentSha256: "0".repeat(64) } }));
    rejectsWith(await make(), "source_unavailable", "a version that does not match its fingerprint is not copied");
    await inA(async () => (await getDb()).collection("pb_versions").updateOne({ _id: src.approved._id } as never, { $set: { contentSha256: src.approved.contentSha256 } }));
  });

  console.log("editing never touches the source");
  await t("an edit changes only the clone, bumps the revision, is flagged and is audited with a diff", async () => {
    const before = await sourceRows();
    const r = await inA(() => C.saveCloneContent(AUTHOR, { id: a._id, doc: edited(a.pbdoc, "This sentence was changed in ContractFlow only."), baseRev: 1 }));
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((r as { rev: number }).rev, 2);
    assert.equal((r as { unchanged: boolean }).unchanged, false);
    const g = await inA(() => C.getClone(AUTHOR, a._id));
    assert.ok(g.ok);
    if (g.ok) {
      assert.equal(g.edited, true);
      assert.notEqual(g.clone.contentSha256, g.clone.source.sourceContentSha256);
      assert.equal(g.clone.source.sourceContentSha256, src.approved.contentSha256, "the recorded source fingerprint is unchanged");
    }
    const edits = await inA(() => C.listCloneEdits(AUTHOR, a._id));
    assert.ok(edits.ok);
    if (edits.ok) {
      const e = edits.edits.find((x) => x.kind === "edit")!;
      assert.match(e.summary, /changed/);
      assert.ok(e.diff && e.diff.some((d) => d.after?.includes("changed in ContractFlow")));
      assert.equal(e.beforeSha256, src.approved.contentSha256);
    }
    const after = await sourceRows();
    assert.deepEqual(after, before, "pb_documents, pb_versions and pb_templates are byte-identical");
    assert.deepEqual(after, sourceBefore);
    const v = await inA(async () => (await getDb()).collection("pb_versions").findOne({ _id: src.approved._id } as never)) as unknown as { contentSha256: string; pbdoc: never };
    const reparsed = parseDoc(v.pbdoc, { assignIds: false });
    assert.ok(reparsed.ok && contentHash(reparsed.doc) === src.approved.contentSha256, "the source content hash is unchanged");
  });
  await t("saving identical content does nothing; saving needs EDIT; the redline shows the change against the Playbook version", async () => {
    const cur = (await inA(() => C.getClone(AUTHOR, a._id))) as { ok: true; clone: typeof a };
    const same = await inA(() => C.saveCloneContent(AUTHOR, { id: a._id, doc: cur.clone.pbdoc, baseRev: 2 }));
    assert.ok(same.ok && (same as { unchanged: boolean }).unchanged);
    rejectsWith(await inA(() => C.saveCloneContent(READER, { id: a._id, doc: cur.clone.pbdoc, baseRev: 2 })), "forbidden");
    rejectsWith(await inA(() => C.saveCloneContent(AUTHOR, { id: a._id, doc: { nonsense: true }, baseRev: 2 })), "invalid");
    const cmp = await inA(() => C.compareWithSource(AUTHOR, a._id));
    assert.ok(cmp.ok && cmp.sourceAvailable && cmp.edited && cmp.diff && !cmp.diff.identical);
    if (cmp.ok) assert.match(cmp.summary, /changed/);
  });
  await t("a stale save is refused with the current revision (nobody overwrites a colleague)", async () => {
    const mine = edited(a.pbdoc, "Second editor tries to save on revision 1.");
    const r = await inA(() => C.saveCloneContent(AUTHOR2, { id: a._id, doc: mine, baseRev: 1 }));
    rejectsWith(r, "conflict");
    assert.equal((r as { error: { currentRev?: number } }).error.currentRev, 2);
    const ok = await inA(() => C.saveCloneContent(AUTHOR2, { id: a._id, doc: mine, baseRev: 2 }));
    assert.ok(ok.ok && (ok as { rev: number }).rev === 3);
    rejectsWith(await inA(() => C.saveCloneContent(AUTHOR, { id: a._id, doc: edited(a.pbdoc, "late"), baseRev: 2 })), "conflict");
  });
  await t("two saves at the same revision: exactly one wins", async () => {
    const b = (await make()) as { ok: true; clone: typeof a };
    const results = await inA(() => Promise.all([C.saveCloneContent(AUTHOR, { id: b.clone._id, doc: edited(b.clone.pbdoc, "Writer one wins or loses."), baseRev: 1 }), C.saveCloneContent(AUTHOR2, { id: b.clone._id, doc: edited(b.clone.pbdoc, "Writer two wins or loses."), baseRev: 1 })]));
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(results.filter((r) => !r.ok && r.error.code === "conflict").length, 1);
  });

  console.log("rendering");
  await t("PDF and Word come out of the Playbook renderers with the frozen values; a stranger without DOWNLOAD cannot", async () => {
    const pdf = await inA(() => RN.renderClone(AUTHOR, a._id, "pdf"));
    assert.ok(pdf.ok, JSON.stringify(pdf));
    if (pdf.ok) { assert.equal(pdf.file.buffer.subarray(0, 4).toString(), "%PDF"); assert.ok(pdf.file.buffer.length > 3000); assert.match(pdf.file.fileName, /\.pdf$/); }
    const docx = await inA(() => RN.renderClone(AUTHOR, a._id, "docx"));
    assert.ok(docx.ok, JSON.stringify(docx));
    if (docx.ok) { assert.equal(docx.file.buffer.subarray(0, 2).toString(), "PK"); assert.match(docx.file.mimeType, /wordprocessingml/); }
    const bad = await inA(() => RN.renderClone({ ...READER, overrides: { "lpms.canDownload": false } }, a._id, "pdf"));
    rejectsWith(bad, "forbidden");
  });

  console.log("ready, reopening and the lock");
  const sentClone = async () => {
    const c = ((await make()) as { ok: true; clone: typeof a }).clone;
    const ready = await inA(async () => { const chk = await RN.checkRenderable(c); assert.ok(chk.ok, JSON.stringify(chk)); return C.markCloneReady(MANAGER, c._id, { rendered: true }); });
    assert.ok(ready.ok, JSON.stringify(ready));
    const req = await inA(() => RQ.createRequest(MANAGER, { cloneId: c._id, title: c.title, expiresAt: days(10), signers: [{ role: "counterparty", name: "Asha Rao", email: "asha@candidate.test" }, { role: "company_signatory", name: "Hari HR", email: "hari@orbit.test" }] }));
    await inA(async () => (await (await import("../src/lib/products/contractflow-ai/cf-db")).cfClones()).updateOne({ _id: c._id }, { $set: { status: "sent", requestId: req.request._id } }));
    return { c, req };
  };
  await t("marking ready needs a renderable document and a manager, and only works on a draft", async () => {
    const c = ((await make()) as { ok: true; clone: typeof a }).clone;
    rejectsWith(await inA(() => C.markCloneReady(AUTHOR, c._id, { rendered: true })), "forbidden");
    rejectsWith(await inA(() => C.markCloneReady(MANAGER, c._id, { rendered: false })), "invalid");
    const r = await inA(() => C.markCloneReady(MANAGER, c._id, { rendered: true }));
    assert.ok(r.ok);
    assert.equal((r as { clone: typeof a }).clone.frozenContentSha256, c.contentSha256);
    rejectsWith(await inA(() => C.markCloneReady(MANAGER, c._id, { rendered: true })), "bad_status");
  });
  await t("editing a sent document sends it back to draft and switches its signer links off", async () => {
    const { c, req } = await sentClone();
    const r = await inA(() => C.saveCloneContent(AUTHOR, { id: c._id, doc: edited(c.pbdoc, "Edited after it was sent out."), baseRev: 1 }));
    assert.ok(r.ok, JSON.stringify(r));
    const now = (await inA(() => C.getClone(AUTHOR, c._id))) as { ok: true; clone: typeof a };
    assert.equal(now.clone.status, "clone_draft");
    assert.equal(now.clone.requestId, null);
    assert.equal(now.clone.frozenContentSha256, null);
    const got = await inA(() => RQ.getRequest(req.request._id));
    assert.equal(got.request.status, "voided");
    assert.ok(got.signers.every((s) => s.tokenRevokedAt));
    const kinds = ((await inA(() => C.listCloneEdits(AUTHOR, c._id))) as { ok: true; edits: { kind: string }[] }).edits.map((e) => e.kind);
    assert.ok(kinds.includes("reopened") && kinds.includes("ready"));
  });

  let locked: typeof a;
  await t("the FIRST signature locks the clone in the data layer: edits are refused whatever the revision", async () => {
    const { c } = await sentClone();
    locked = c;
    assert.ok(await inA(() => C.markSignatureApplied(c._id, { by: "signer1" })));
    const g = (await inA(() => C.getClone(AUTHOR, c._id))) as { ok: true; clone: typeof a; capabilities: { edit: boolean; locked: boolean } };
    assert.equal(g.clone.status, "partially_signed");
    assert.equal(g.clone.signatureCount, 1);
    assert.ok(g.clone.lockedAt);
    assert.equal(g.capabilities.edit, false);
    assert.equal(g.capabilities.locked, true);
    for (const base of [1, g.clone.rev, g.clone.rev + 5]) rejectsWith(await inA(() => C.saveCloneContent(AUTHOR, { id: c._id, doc: edited(c.pbdoc, "Trying to sneak a change in."), baseRev: base })), "locked");
    const still = (await inA(() => C.getClone(AUTHOR, c._id))) as { ok: true; clone: typeof a };
    assert.equal(still.clone.contentSha256, c.contentSha256, "content did not move");
  });
  await t("even if the signing code forgot to lock, a signed signer on the clone's request locks it on the next save", async () => {
    const { c, req } = await sentClone();
    await pdb.collection("cf_signers").updateOne({ _id: req.links[0].signerId as never }, { $set: { status: "signed", signedAt: new Date() } });
    rejectsWith(await inA(() => C.saveCloneContent(AUTHOR, { id: c._id, doc: edited(c.pbdoc, "Late change attempt."), baseRev: 1 })), "locked");
    const g = (await inA(() => C.getClone(AUTHOR, c._id))) as { ok: true; clone: typeof a };
    assert.ok(g.clone.lockedAt, "it is now marked locked");
  });
  await t("a draft clone takes no signature", async () => {
    const c = ((await make()) as { ok: true; clone: typeof a }).clone;
    assert.equal(await inA(() => C.markSignatureApplied(c._id)), false, "a draft takes no signature");
  });

  console.log("void and replace");
  await t("void needs a reason and a manager; it keeps the signatures, closes the request and revokes links", async () => {
    const { c, req } = await sentClone();
    await inA(() => C.markSignatureApplied(c._id, { by: "signer1" }));
    rejectsWith(await inA(() => C.voidClone(AUTHOR, c._id, "Wrong figures")), "forbidden");
    rejectsWith(await inA(() => C.voidClone(MANAGER, c._id, "")), "invalid");
    const r = await inA(() => C.voidClone(MANAGER, c._id, "Wrong figures in clause 4"));
    assert.ok(r.ok);
    const v = (r as { clone: typeof a }).clone;
    assert.equal(v.status, "voided");
    assert.equal(v.voidReason, "Wrong figures in clause 4");
    assert.equal(v.signatureCount, 1, "the signature record is kept");
    assert.equal((await inA(() => RQ.getRequest(req.request._id))).request.status, "voided");
    rejectsWith(await inA(() => C.saveCloneContent(AUTHOR, { id: c._id, doc: edited(c.pbdoc, "x edit after void"), baseRev: v.rev })), "locked");
    assert.equal(await inA(() => C.markSignatureApplied(c._id)), false);
  });
  await t("replacing a voided clone from its edited copy links both and records both in the audit trail", async () => {
    const { c } = await sentClone();
    await inA(() => C.saveCloneContent(AUTHOR, { id: c._id, doc: edited(c.pbdoc, "Edited before it was voided here."), baseRev: 1 })).then((r) => assert.ok(r.ok));
    await inA(() => C.voidClone(MANAGER, c._id, "Superseded by a corrected copy"));
    rejectsWith(await inA(() => C.recloneVoided(AUTHOR, c._id, { basis: "edited" })), "forbidden");
    const r = await inA(() => C.recloneVoided(MANAGER, c._id, { basis: "edited" }));
    assert.ok(r.ok, JSON.stringify(r));
    const n = (r as { clone: typeof a }).clone;
    assert.equal(n.replaces, c._id);
    assert.equal(n.status, "clone_draft");
    assert.equal(n.signatureCount, 0);
    assert.equal(n.rev, 1);
    const oldNow = (await inA(() => C.getClone(AUTHOR, c._id))) as { ok: true; clone: typeof a };
    assert.equal(oldNow.clone.replacedBy, n._id);
    assert.equal(oldNow.clone.status, "voided");
    const newCurrent = (await inA(() => C.getClone(AUTHOR, n._id))) as { ok: true; clone: typeof a };
    assert.equal(newCurrent.clone.pbdoc && JSON.stringify(newCurrent.clone.pbdoc), JSON.stringify((await inA(() => C.getClone(AUTHOR, c._id)) as { ok: true; clone: typeof a }).clone.pbdoc), "the edited copy was carried over");
    const oldKinds = ((await inA(() => C.listCloneEdits(AUTHOR, c._id))) as { ok: true; edits: { kind: string }[] }).edits.map((e) => e.kind);
    const newKinds = ((await inA(() => C.listCloneEdits(AUTHOR, n._id))) as { ok: true; edits: { kind: string }[] }).edits.map((e) => e.kind);
    assert.ok(oldKinds.includes("void") && oldKinds.includes("recloned_from"));
    assert.ok(newKinds.includes("recloned_to"));
    rejectsWith(await inA(() => C.recloneVoided(MANAGER, c._id, { basis: "edited" })), "bad_status", "a voided clone is replaced only once");
    // The new clone is editable again, the old one is not.
    assert.ok((await inA(() => C.saveCloneContent(AUTHOR, { id: n._id, doc: edited(n.pbdoc, "Fresh edit in the replacement."), baseRev: 1 }))).ok);
  });
  await t("replacing from the Playbook version starts again from the source, and a live clone cannot be 'replaced'", async () => {
    const { c } = await sentClone();
    await inA(() => C.saveCloneContent(AUTHOR, { id: c._id, doc: edited(c.pbdoc, "Edited copy that we throw away."), baseRev: 1 }));
    rejectsWith(await inA(() => C.recloneVoided(MANAGER, c._id, { basis: "source" })), "bad_status");
    await inA(() => C.voidClone(MANAGER, c._id, "Start again from the Playbook text"));
    const r = await inA(() => C.recloneVoided(MANAGER, c._id, { basis: "source" }));
    assert.ok(r.ok);
    const n = (r as { clone: typeof a }).clone;
    assert.equal(n.contentSha256, src.approved.contentSha256);
    assert.equal(n.contentSha256, n.source.sourceContentSha256);
    const g = (await inA(() => C.getClone(AUTHOR, n._id))) as { ok: true; edited: boolean };
    assert.equal(g.edited, false);
    assert.deepEqual(await sourceRows(), sourceBefore, "still nothing changed in Playbook");
  });

  console.log("access");
  await t("party-type access applies to clones: an employee document is hidden from people who may not see employees", async () => {
    const hr = viewer(["hr", "lpms_author"], "hr");
    const hrParty = await inA(() => P.createManualParty(MANAGER, { type: "other", name: "Placeholder" }));
    void hrParty;
    // An employee-type party row (linked parties are read from HRMS; the index row is enough for the access rule).
    await inA(async () => (await (await import("../src/lib/products/contractflow-ai/cf-db")).cfParties()).insertOne({ _id: "p-emp", type: "employee", source: { product: "talentos", collection: "hrms_employees", id: "e9" }, displayName: "Ravi Kumar", contact: null, status: "active", searchKey: "ravi", createdBy: "x", createdAt: new Date(), updatedAt: new Date(), lastResolvedAt: null }));
    const r = await make({ party: { type: "employee", partyId: "p-emp" } });
    assert.ok(r.ok, JSON.stringify(r));
    const id = (r as { clone: typeof a }).clone._id;
    rejectsWith(await inA(() => C.getClone(SALES, id)), "forbidden");
    assert.ok((await inA(() => C.getClone(hr, id))).ok);
    assert.ok(!(await inA(() => C.listClones(SALES))).some((x) => x._id === id));
    assert.ok((await inA(() => C.listClones(hr))).some((x) => x._id === id));
  });
  await t("a viewer role can read but not edit, void or mark ready", async () => {
    const g = (await inA(() => C.getClone(READER, a._id))) as { ok: true; capabilities: Record<string, boolean> };
    assert.equal(g.capabilities.view, true);
    assert.equal(g.capabilities.edit, false);
    assert.equal(g.capabilities.void, false);
    assert.equal(g.capabilities.markReady, false);
  });

  console.log("two-company isolation");
  await t("company B cannot read, edit, render, void or list A's clones, or clone A's Playbook document", async () => {
    rejectsWith(await inB(() => C.getClone(MANAGER, a._id)), "not_found");
    rejectsWith(await inB(() => C.saveCloneContent(MANAGER, { id: a._id, doc: a.pbdoc, baseRev: 3 })), "not_found");
    rejectsWith(await inB(() => C.voidClone(MANAGER, a._id, "attack attempt")), "not_found");
    rejectsWith(await inB(() => RN.renderClone(MANAGER, a._id, "pdf")), "not_found");
    rejectsWith(await inB(() => C.compareWithSource(MANAGER, a._id)), "not_found");
    rejectsWith(await inB(() => C.listCloneEdits(MANAGER, a._id)), "not_found");
    assert.equal((await inB(() => C.listClones(MANAGER))).length, 0);
    rejectsWith(await inB(() => C.createCloneFromPlaybook(PB_MANAGER, { ...input })), "not_found");
    assert.equal(await inB(() => C.markSignatureApplied(a._id)), false);
    const raw = await pdb.collection("cf_documents").findOne({ _id: a._id as never });
    assert.equal(raw?.companyId, "coA");
    assert.equal(await pdb.collection("cf_clone_edits").countDocuments({ companyId: "coB" }), 0);
  });

  await pdb.dropDatabase();
  void locked;
  console.log("contractflow clone: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
