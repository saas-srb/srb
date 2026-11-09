import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Signer experience (B4). Throwaway database only: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>. In-memory signature store,
// fake mail sender: no network, no real provider.
const uri = process.env.MONGODB_URI ?? "";
assert.ok(/zz_throwaway_/.test(uri) && !/\.env/.test(uri), "Run with MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>");
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const ROOT = path.resolve(__dirname, "..");

(async () => {
  const sharp = (await import("sharp")).default;
  const { getPlatformDb } = await import("../src/lib/mongodb");
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const C = await import("../src/lib/products/contractflow-ai/clones");
  const RN = await import("../src/lib/products/contractflow-ai/clone-render");
  const RQ = await import("../src/lib/products/contractflow-ai/requests");
  const E = await import("../src/lib/products/contractflow-ai/events");
  const A = await import("../src/lib/products/contractflow-ai/public-access");
  const O = await import("../src/lib/products/contractflow-ai/otp");
  const OP = await import("../src/lib/products/contractflow-ai/otp-public");
  const F = await import("../src/lib/products/contractflow-ai/sign-flow");
  const K = await import("../src/lib/products/contractflow-ai/sign-consent");
  const S = await import("../src/lib/products/contractflow-ai/signature-store");
  const PBD = await import("../src/lib/products/playbook-ai/documents");
  const { insertVersion } = await import("../src/lib/products/playbook-ai/versions");
  const { parseDoc } = await import("../src/lib/products/playbook-ai/doc/validate");
  const { contentHash } = await import("../src/lib/products/playbook-ai/doc/hash");
  const { classify } = await import("../src/lib/security/gate");
  const { offerLetterRaw, OFFER_VALUES, OFFER_LISTS } = await import("./lib/pbdoc-fixtures");
  type Viewer = import("../src/lib/products/contractflow-ai/types").LpmsViewer;
  const pdb = await getPlatformDb();
  assert.ok(/zz_throwaway_/.test(pdb.databaseName), "refusing to run on " + pdb.databaseName);
  await pdb.dropDatabase();
  await pdb.collection("companies").insertMany([{ _id: "coA", status: "active" }, { _id: "coB", status: "active" }] as never);

  const stored = new Map<string, Buffer>();
  S.setSignatureStore({ put: async (k, b) => { stored.set(k, b); }, get: async (k) => stored.get(k) ?? null, delete: async (k) => { stored.delete(k); } });
  const mail: { to: string; text: string }[] = [];
  O.__setOtpSenders({ email: async (to, _s, text) => { mail.push({ to, text }); return { ok: true }; }, sms: async () => ({ ok: true }), emailConfigured: async () => true, companyTwilio: async () => null });
  const lastCode = () => /\b(\d{6})\b/.exec(mail[mail.length - 1].text)![1];

  const viewer = (roles: string[]): Viewer => ({ userId: "u_" + roles.join("_"), email: "x@test.invalid", roles, overrides: {}, lpmsRoles: [], employeeId: null, companyId: "" });
  const MANAGER = viewer(["lpms_manager"]);
  const PB_MANAGER = { id: "pb_mgr", email: "pb@test.invalid", name: "Pat", roles: ["sop_manager"], permissionOverrides: {} };
  const inA = <T,>(fn: () => Promise<T>) => runAsCompany("coA", fn);
  const inB = <T,>(fn: () => Promise<T>) => runAsCompany("coB", fn);
  const days = (n: number) => new Date(Date.now() + n * 86_400_000);
  let ipN = 0;
  const hdr = (ip = `10.20.${Math.floor(++ipN / 250)}.${ipN % 250}`) => new Headers({ "x-forwarded-for": ip, "user-agent": "Mozilla/5.0 (Linux; Android 14) Mobile" });

  // ── source document + clone ──
  const pb = await inA(async () => {
    const created = await PBD.createDocument(PB_MANAGER, { title: "Services agreement", pbdoc: offerLetterRaw() });
    assert.ok(created.ok);
    const d = (created as { document: import("../src/lib/products/playbook-ai/documents-types").PbDocumentRecord }).document;
    const parsed = parseDoc(d.pbdoc, { assignIds: false });
    assert.ok(parsed.ok);
    const v = await insertVersion({ documentId: d._id, number: 1, kind: "manual", label: null, changeNote: null, title: d.title, status: "approved", docNumber: "AGR/2026-27/0001", pbdoc: d.pbdoc, contentSha256: contentHash(parsed.ok ? parsed.doc : d.pbdoc), variableSnapshot: { takenAt: new Date().toISOString(), values: OFFER_VALUES, lists: OFFER_LISTS, sources: [], sha256: "t" }, templateRef: null, revertedFrom: null, authorId: "pb_mgr", authorName: "Pat" });
    return { d, v };
  });
  const newReadyClone = () => inA(async () => {
    const r = await C.createCloneFromPlaybook(PB_MANAGER, { documentId: pb.d._id, versionId: pb.v._id, party: { type: "other", displayName: "Acme Ltd" }, signers: [{ role: "counterparty", name: "Asha Rao", email: "asha@acme.test" }, { role: "company_signatory", name: "Hari HR", email: "hari@orbit.test" }] });
    assert.ok(r.ok, JSON.stringify(r));
    const clone = (r as { clone: import("../src/lib/products/contractflow-ai/clone-types").CloneDoc }).clone;
    assert.ok((await C.markCloneReady(MANAGER, clone._id, { rendered: true })).ok);
    return clone;
  });
  const send = (clone: { _id: string; title: string }, mode: "parallel" | "sequential" = "sequential", expires = days(10)) =>
    inA(() => RQ.createRequest(MANAGER, { cloneId: clone._id, title: clone.title, orderMode: mode, expiresAt: expires, signers: [{ role: "counterparty", name: "Asha Rao", email: "asha@acme.test", order: 1 }, { role: "company_signatory", name: "Hari HR", email: "hari@orbit.test", order: 2 }] }));
  const open = async (token: string, h = hdr()) => {
    const a = await A.resolveSignerToken(token, h);
    assert.ok(a.ok, JSON.stringify(a));
    return a as import("../src/lib/products/contractflow-ai/public-access").SignerAccess;
  };
  const verify = async (token: string) => {
    const h = hdr();
    assert.ok((await OP.sendCodeForToken(token, "email", h)).ok);
    assert.ok((await OP.checkCodeForToken(token, lastCode(), h)).ok);
  };
  const png = async (w = 300, h = 100) => sharp({ create: { width: w, height: h, channels: 3, background: "#fff" } }).composite([{ input: await sharp({ create: { width: 200, height: 6, channels: 3, background: "#000" } }).png().toBuffer(), top: 40, left: 40 }]).png().toBuffer();
  const body = (over: Partial<import("../src/lib/products/contractflow-ai/sign-flow").SubmitInput> = {}): import("../src/lib/products/contractflow-ai/sign-flow").SubmitInput => ({ signedName: "Asha Rao", designation: "Director", consentAccepted: true, consentVersion: K.CONSENT_VERSION, signature: { kind: "typed", text: "Asha Rao", style: "script" }, ...over });

  console.log("consent wording");
  await t("the notice is honest, versioned, and marked as not yet reviewed by a lawyer", () => {
    assert.match(K.MANDATORY_NOTICE, /simple electronic signature \(OTP verified\)/);
    assert.match(K.MANDATORY_NOTICE, /Ask a lawyer/);
    assert.match(K.HOW_IT_WORKS, /not an Aadhaar eSign/i);
    for (const bad of [/valid under the IT Act/i, /court-proof/i, /equivalent to a handwritten signature in all cases/i]) assert.ok(!bad.test(K.CONSENT_TEXT + K.HOW_IT_WORKS + K.MANDATORY_NOTICE), String(bad));
    assert.equal(K.reviewMarker(), "Wording reviewed by/on: not yet reviewed");
    assert.equal(K.CONSENT_VERSION, "1");
    assert.match(F.consentTextSha256(), /^[0-9a-f]{64}$/);
  });
  await t("the front door treats the signer's actions as public POSTs, and nothing else under that prefix", () => {
    const tok = "A".repeat(43);
    for (const a of ["otp-send", "otp-check", "sign", "decline"]) assert.equal(classify(`/api/contractflow-ai/sign/${tok}/${a}`, "POST"), "public");
    assert.notEqual(classify(`/api/contractflow-ai/sign/${tok}/sign`, "GET"), "public");
    assert.notEqual(classify(`/api/contractflow-ai/sign/${tok}/other`, "POST"), "public");
    assert.notEqual(classify(`/api/contractflow-ai/sign/short/sign`, "POST"), "public");
  });

  console.log("sending");
  const clone1 = await newReadyClone();
  const req1 = await send(clone1);
  await t("a request needs a READY clone, records what will be shown, and moves the clone to 'sent'", async () => {
    const draft = await inA(async () => {
      const r = await C.createCloneFromPlaybook(PB_MANAGER, { documentId: pb.d._id, versionId: pb.v._id, party: { type: "other", displayName: "X Y" }, signers: [{ role: "counterparty", name: "Asha Rao", email: "a@x.test" }] });
      return (r as { clone: { _id: string; title: string } }).clone;
    });
    await assert.rejects(() => send(draft), (e: { code?: string }) => e.code === "invalid");
    const g = (await inA(() => C.getClone(MANAGER, clone1._id))) as { ok: true; clone: import("../src/lib/products/contractflow-ai/clone-types").CloneDoc };
    assert.equal(g.clone.status, "sent");
    assert.equal(g.clone.requestId, req1.request._id);
    assert.equal(req1.request.contentSha256, clone1.contentSha256);
  });

  const [t1, t2] = [req1.links[0].token, req1.links[1].token];
  console.log("the checks before signing");
  await t("it shows the document to review, the order, and waits its turn", async () => {
    const v1 = await F.getSigningView(await open(t1));
    assert.equal(v1.canSignNow, true);
    assert.equal(v1.documentAvailable, true);
    assert.equal(v1.identityVerified, false);
    assert.equal(v1.consent.version, K.CONSENT_VERSION);
    assert.match(v1.consent.reviewMarker, /not yet reviewed/);
    const v2 = await F.getSigningView(await open(t2));
    assert.equal(v2.canSignNow, false);
    assert.deepEqual(v2.waitingFor, ["Asha Rao"]);
    assert.ok(!JSON.stringify(v2).includes("asha@acme.test"), "other people's addresses are not shown");
    const pdf = await inA(async () => RN.renderCloneDoc((await C.getClone(MANAGER, clone1._id) as { clone: never }).clone, "pdf", { strict: true }));
    assert.equal(pdf.buffer.subarray(0, 4).toString(), "%PDF");
  });
  await t("nothing can be signed without the code, without opening the document, without consent, a name or a signature", async () => {
    const a1 = await open(t1);
    let r = await F.submitSignature(a1, body(), hdr());
    assert.deepEqual([r.ok, !r.ok && r.code], [false, "identity_required"]);
    await verify(t1);
    const a1b = await open(t1);
    r = await F.submitSignature(a1b, body(), hdr());
    assert.deepEqual([r.ok, !r.ok && r.code], [false, "document_not_viewed"]);
    await F.markDocumentViewed(a1b, hdr());
    const fresh = await open(t1);
    for (const [over, code] of [
      [{ consentAccepted: false }, "consent_required"],
      [{ consentVersion: "0" }, "consent_required"],
      [{ signedName: " " }, "name_required"],
      [{ signature: { kind: "typed", text: "A", style: "script" } }, "bad_signature"],
      [{ signature: { kind: "typed", text: "Asha", style: "unknown" } }, "bad_signature"],
      [{ signature: { kind: "drawn", dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" } }, "bad_signature"],
      [{ signature: { kind: "uploaded", base64: Buffer.from("MZ not an image").toString("base64") } }, "bad_signature"],
      [{ signature: { kind: "uploaded", base64: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("<script>alert(1)</script>")]).toString("base64") } }, "bad_signature"],
      [{ signature: null as never }, "bad_signature"],
    ] as const) {
      const x = await F.submitSignature(fresh, body(over as never), hdr());
      assert.deepEqual([x.ok, !x.ok && x.code], [false, code], JSON.stringify(over).slice(0, 60));
    }
    assert.equal(stored.size, 0, "a refused signature stores nothing");
    const row = await pdb.collection("cf_signers").findOne({ _id: req1.links[0].signerId as never });
    assert.equal(row?.status === "signed", false);
  });
  await t("sequential: a later signer cannot sign, even with a verified code, before the earlier ones", async () => {
    await verify(t2);
    const a2 = await open(t2);
    await F.markDocumentViewed(a2, hdr());
    const r = await F.submitSignature(await open(t2), body({ signedName: "Hari HR", signature: { kind: "typed", text: "Hari HR", style: "serif" } }), hdr());
    assert.deepEqual([r.ok, !r.ok && r.code], [false, "not_your_turn"]);
    assert.equal(((await inA(() => C.getClone(MANAGER, clone1._id))) as { clone: { signatureCount: number } }).clone.signatureCount, 0);
  });

  console.log("signing");
  await t("the first signature is recorded and LOCKS the clone in the same step", async () => {
    const h = hdr("203.0.113.5");
    const r = await F.submitSignature(await open(t1), body(), h);
    assert.deepEqual(r, { ok: true, complete: false });
    const g = (await inA(() => C.getClone(MANAGER, clone1._id))) as { ok: true; clone: import("../src/lib/products/contractflow-ai/clone-types").CloneDoc; capabilities: { edit: boolean } };
    assert.equal(g.clone.status, "partially_signed");
    assert.equal(g.clone.signatureCount, 1);
    assert.ok(g.clone.lockedAt);
    assert.equal(g.capabilities.edit, false);
    const edit = await inA(() => C.saveCloneContent(viewer(["lpms_author"]), { id: clone1._id, doc: g.clone.pbdoc, baseRev: g.clone.rev }));
    assert.deepEqual([edit.ok, !edit.ok && edit.error.code], [false, "locked"]);
    const row = (await pdb.collection("cf_signers").findOne({ _id: req1.links[0].signerId as never }))!;
    assert.equal(row.status, "signed");
    assert.equal(row.signedName, "Asha Rao");
    assert.equal(row.designation, "Director");
    assert.equal(row.ip, "203.0.113.5");
    assert.match(String(row.userAgent), /Android/);
    assert.deepEqual([row.consent.version, row.consent.textSha256], [K.CONSENT_VERSION, F.consentTextSha256()]);
    assert.equal(row.signedContentSha256, clone1.contentSha256);
    assert.equal(row.signature.kind, "typed");
    assert.ok(row.tokenUsedAt);
    const ev = (await inA(() => E.listEvents(req1.request._id))).find((e) => e.type === "signer_signed")!;
    assert.equal(ev.ip, "203.0.113.5");
    assert.match(ev.userAgent ?? "", /Android/);
    assert.equal(ev.data.contentSha256, clone1.contentSha256);
    assert.equal((await inA(() => E.verifyChain(req1.request._id))).ok, true);
    assert.equal((await inA(() => RQ.getRequest(req1.request._id))).request.status, "in_progress");
  });
  await t("a replay or double submit cannot sign twice; the used link is refused", async () => {
    const again = await F.submitSignature({ ...(await open(t2)), signer: { ...(await open(t2)).signer, _id: req1.links[0].signerId } } as never, body(), hdr());
    assert.equal(again.ok, false);
    assert.deepEqual(await A.resolveSignerToken(t1, hdr()), { ok: false, reason: "used" });
    assert.equal(((await inA(() => C.getClone(MANAGER, clone1._id))) as { clone: { signatureCount: number } }).clone.signatureCount, 1);
  });
  await t("two parallel submits of one signer: exactly one wins", async () => {
    const c = await newReadyClone();
    const r = await send(c, "parallel");
    await verify(r.links[0].token);
    await F.markDocumentViewed(await open(r.links[0].token), hdr());
    const acc = await open(r.links[0].token);
    const res = await Promise.all([F.submitSignature(acc, body(), hdr()), F.submitSignature(acc, body(), hdr())]);
    assert.equal(res.filter((x) => x.ok).length, 1);
    assert.equal(((await inA(() => C.getClone(MANAGER, c._id))) as { clone: { signatureCount: number } }).clone.signatureCount, 1);
  });
  await t("the second signer (drawn) completes it: images are re-encoded and stored privately; clone and request are complete", async () => {
    const drawn = `data:image/png;base64,${(await png()).toString("base64")}`;
    const a2 = await open(t2);
    const r = await F.submitSignature(a2, body({ signedName: "Hari HR", designation: "HR Head", signature: { kind: "drawn", dataUrl: drawn } }), hdr());
    assert.deepEqual(r, { ok: true, complete: true });
    const row = (await pdb.collection("cf_signers").findOne({ _id: req1.links[1].signerId as never }))!;
    assert.equal(row.signature.kind, "drawn");
    assert.match(row.signature.storageKey, /^contractflow-signatures\/coA\/[0-9a-f-]+\.png$/);
    const bytes = stored.get(row.signature.storageKey)!;
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(row.signature.sha256, (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex"));
    assert.equal(await inA(() => S.getSignatureImage(row.signature.storageKey)) !== null, true);
    assert.equal(await inB(() => S.getSignatureImage(row.signature.storageKey)), null, "another company cannot read it");
    assert.ok(!JSON.stringify(row).includes("base64"), "no raw image data in the row");
    const g = (await inA(() => C.getClone(MANAGER, clone1._id))) as { clone: { status: string; signatureCount: number } };
    assert.deepEqual([g.clone.status, g.clone.signatureCount], ["signed", 2]);
    assert.equal((await inA(() => RQ.getRequest(req1.request._id))).request.status, "completed");
  });
  await t("an uploaded JPEG is accepted and stored as PNG", async () => {
    const c = await newReadyClone();
    const r = await send(c, "parallel");
    await verify(r.links[0].token);
    await F.markDocumentViewed(await open(r.links[0].token), hdr());
    const jpg = await sharp({ create: { width: 400, height: 120, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const res = await F.submitSignature(await open(r.links[0].token), body({ signature: { kind: "uploaded", base64: jpg.toString("base64") } }), hdr());
    assert.equal(res.ok, true);
    const row = (await pdb.collection("cf_signers").findOne({ _id: r.links[0].signerId as never }))!;
    assert.equal(stored.get(row.signature.storageKey)!.subarray(1, 4).toString(), "PNG");
  });

  console.log("declining, expiry and change");
  await t("declining needs the code and a reason; it ends the request, switches other links off and keeps the evidence", async () => {
    const c = await newReadyClone();
    const r = await send(c);
    let d = await F.submitDecline(await open(r.links[0].token), "Not agreed", hdr());
    assert.deepEqual([d.ok, !d.ok && d.code], [false, "identity_required"]);
    await verify(r.links[0].token);
    d = await F.submitDecline(await open(r.links[0].token), "no", hdr());
    assert.equal(d.ok, false);
    d = await F.submitDecline(await open(r.links[0].token), "The notice period is not what we discussed", hdr());
    assert.equal(d.ok, true);
    assert.equal((await inA(() => RQ.getRequest(r.request._id))).request.status, "declined");
    assert.deepEqual(await A.resolveSignerToken(r.links[1].token, hdr()), { ok: false, reason: "revoked" });
    assert.deepEqual(await A.resolveSignerToken(r.links[0].token, hdr()), { ok: false, reason: "used" });
    const g = (await inA(() => C.getClone(MANAGER, c._id))) as { clone: { status: string } };
    assert.equal(g.clone.status, "declined");
    const row = (await pdb.collection("cf_signers").findOne({ _id: r.links[0].signerId as never }))!;
    assert.equal(row.declineReason, "The notice period is not what we discussed");
    assert.ok((await inA(() => E.listEvents(r.request._id))).some((e) => e.type === "signer_declined"));
  });
  await t("an expired request cannot be signed even with a good code", async () => {
    const c = await newReadyClone();
    const r = await send(c, "parallel", days(2));
    await verify(r.links[0].token);
    const acc = await open(r.links[0].token);
    await F.markDocumentViewed(acc, hdr());
    const late = new Date(Date.now() + 3 * 86_400_000);
    const x = await F.submitSignature(acc, body(), hdr(), late);
    assert.deepEqual([x.ok, !x.ok && x.code], [false, "closed"]);
    assert.deepEqual(await A.resolveSignerToken(r.links[0].token, hdr(), {}, late), { ok: false, reason: "expired" });
  });
  await t("if the document changed after sending, nothing is signed and the signer is told", async () => {
    const c = await newReadyClone();
    const r = await send(c, "parallel");
    await verify(r.links[0].token);
    await F.markDocumentViewed(await open(r.links[0].token), hdr());
    await pdb.collection("cf_documents").updateOne({ _id: c._id as never }, { $set: { contentSha256: "f".repeat(64) } });
    const x = await F.submitSignature(await open(r.links[0].token), body(), hdr());
    assert.deepEqual([x.ok, !x.ok && x.code], [false, "document_changed"]);
    assert.notEqual((await pdb.collection("cf_signers").findOne({ _id: r.links[0].signerId as never }))?.status, "signed");
  });
  await t("a voided request refuses further signing", async () => {
    const c = await newReadyClone();
    const r = await send(c);
    await inA(() => RQ.voidRequest(MANAGER, r.request._id, "Wrong party"));
    assert.deepEqual(await A.resolveSignerToken(r.links[0].token, hdr()), { ok: false, reason: "voided" });
  });

  console.log("isolation and accessibility");
  await t("a signer of company B can never reach company A's signer, and A's link keeps working under B's host context", async () => {
    const bc = await inB(async () => {
      const mk = await C.createCloneFromPlaybook(PB_MANAGER, { documentId: pb.d._id, versionId: pb.v._id, party: { type: "other", displayName: "z" }, signers: [{ role: "counterparty", name: "Zed Zed", email: "z@z.test" }] });
      return mk.ok;
    });
    assert.equal(bc, false, "B cannot clone A's Playbook document");
    const c = await newReadyClone();
    const r = await send(c, "parallel");
    const viaB = await inB(() => A.resolveSignerToken(r.links[0].token, hdr()));
    assert.ok(viaB.ok && viaB.companyId === "coA");
    assert.equal((await inB(() => RQ.getRequest(r.request._id).catch(() => null))), null);
  });
  await t("the page is built for phones and assistive technology", () => {
    const src = readFileSync(path.join(ROOT, "src/components/products/contractflow-ai/SignFlow.tsx"), "utf8");
    for (const must of ['aria-live="assertive"', 'role="alert"', 'role="tablist"', 'htmlFor="otp"', 'htmlFor="nm"', "min-h-11", "touch-none", 'autoComplete="one-time-code"', "sr-only", 'aria-label="Signature drawing area']) assert.ok(src.includes(must), must);
    assert.ok(/<iframe\s+title=/.test(src));
    const page = readFileSync(path.join(ROOT, "src/app/sign/[token]/page.tsx"), "utf8");
    assert.ok(page.includes("max-w-2xl") && page.includes("<h1"));
    assert.ok(!/Aadhaar eSign|digital signature certificate/i.test(src.replace(/not an Aadhaar eSign[^"]*/i, "")), "no claim of a stronger signature");
  });

  S.setSignatureStore(null);
  O.__setOtpSenders(null);
  await pdb.dropDatabase();
  console.log("contractflow sign: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
