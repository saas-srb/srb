import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Signature request model, provider interface and public token infrastructure (B2).
// Throwaway database only: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>. No network, no email, no real provider.
const uri = process.env.MONGODB_URI ?? "";
assert.ok(/zz_throwaway_/.test(uri) && !/\.env/.test(uri), "Run with MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>");
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const ROOT = path.resolve(__dirname, "..");

(async () => {
  const { getPlatformDb } = await import("../src/lib/mongodb");
  const { runAsCompany } = await import("../src/lib/platform/tenancy/context");
  const tokens = await import("../src/lib/products/contractflow-ai/tokens");
  const R = await import("../src/lib/products/contractflow-ai/requests");
  const E = await import("../src/lib/products/contractflow-ai/events");
  const A = await import("../src/lib/products/contractflow-ai/public-access");
  const { BuiltInProvider, signatureProvider } = await import("../src/lib/products/contractflow-ai/provider");
  const { isSharedPath } = await import("../src/lib/platform/tenancy/surfaces");
  type Viewer = import("../src/lib/products/contractflow-ai/types").LpmsViewer;
  const pdb = await getPlatformDb();
  assert.ok(/zz_throwaway_/.test(pdb.databaseName), "refusing to run on " + pdb.databaseName);
  await pdb.dropDatabase();
  await pdb.collection("companies").insertMany([{ _id: "coA", status: "active" }, { _id: "coB", status: "active" }, { _id: "coS", status: "suspended" }] as never);

  const viewer = (roles: string[]): Viewer => ({ userId: "u_" + roles.join("_"), email: "x@test.invalid", roles, overrides: {}, lpmsRoles: [], employeeId: null, companyId: "" });
  const MANAGER = viewer(["lpms_manager"]);
  const PLAIN = viewer(["lpms_viewer"]);
  const inA = <T,>(fn: () => Promise<T>) => runAsCompany("coA", fn);
  const inB = <T,>(fn: () => Promise<T>) => runAsCompany("coB", fn);
  const hdr = (ip: string, ua = "Mozilla/5.0 (test)") => new Headers({ "x-forwarded-for": ip, "user-agent": ua });
  const days = (n: number) => new Date(Date.now() + n * 86_400_000);
  const signers = (a = "one@a.test", b = "two@a.test") => [
    { role: "counterparty" as const, name: "First Signer", email: a },
    { role: "company_signatory" as const, name: "Second Signer", email: b },
  ];
  const rejects = async (fn: () => Promise<unknown>, code: string) => assert.rejects(fn, (e: unknown) => (e as { code?: string }).code === code, `expected ${code}`);

  console.log("tokens");
  await t("32 random bytes, 43 url-safe characters, never repeated, hashed with SHA-256", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const tok = tokens.generateToken();
      assert.match(tok, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(Buffer.from(tok, "base64url").length, 32);
      seen.add(tok);
    }
    assert.equal(seen.size, 2000);
    const tok = tokens.generateToken();
    assert.match(tokens.hashToken(tok), /^[0-9a-f]{64}$/);
    assert.notEqual(tokens.hashToken(tok), tok);
    assert.equal(tokens.isWellFormedToken("short"), false);
    assert.equal(tokens.isWellFormedToken("a".repeat(42) + "!"), false);
    assert.equal(tokens.isWellFormedToken(undefined), false);
  });
  await t("/sign and /verify are shared public prefixes", () => {
    assert.equal(isSharedPath("/sign/abc"), true);
    assert.equal(isSharedPath("/verify/signed/abc"), true);
    assert.equal(isSharedPath("/contractflow-ai"), false);
  });

  console.log("requests");
  let a: { request: import("../src/lib/products/contractflow-ai/sign-types").RequestDoc; links: import("../src/lib/products/contractflow-ai/requests").IssuedLink[] };
  let b: typeof a;
  await t("a request creates one signer and one link per signer; the raw token is not stored anywhere", () => inA(async () => {
    a = await R.createRequest(MANAGER, { cloneId: "clone-a", title: "NDA with Acme", expiresAt: days(10), signers: signers() });
    assert.equal(a.links.length, 2);
    assert.equal(a.request.status, "sent");
    assert.equal(a.request.provider, "built-in");
    const raw = await (await getPlatformDb()).collection("cf_signers").find({ requestId: a.request._id }).toArray();
    assert.equal(raw.length, 2);
    for (const l of a.links) {
      assert.ok(!JSON.stringify(raw).includes(l.token), "the raw token must not be in the database");
      assert.ok(raw.some((r) => r.tokenHash === tokens.hashToken(l.token) && r.companyId === "coA" && r.tokenPurpose === "sign"));
    }
    const dump = JSON.stringify(await (await getPlatformDb()).collection("cf_events").find({}).toArray());
    for (const l of a.links) assert.ok(!dump.includes(l.token), "nor in the event log");
    assert.deepEqual((await E.listEvents(a.request._id)).map((e) => e.type), ["request_created", "link_issued", "link_issued"]);
  }));
  await t("company B makes its own request", () => inB(async () => {
    b = await R.createRequest(MANAGER, { cloneId: "clone-b", title: "MSA with Beta", expiresAt: days(10), signers: signers("one@b.test", "two@b.test") });
    assert.equal(b.links.length, 2);
  }));
  await t("validation and permission", () => inA(async () => {
    await rejects(() => R.createRequest(PLAIN, { cloneId: "c", title: "x", expiresAt: days(5), signers: signers() }), "forbidden");
    await rejects(() => R.createRequest(MANAGER, { cloneId: "c", title: "x", expiresAt: days(-1), signers: signers() }), "invalid");
    await rejects(() => R.createRequest(MANAGER, { cloneId: "c", title: "x", expiresAt: days(400), signers: signers() }), "invalid");
    await rejects(() => R.createRequest(MANAGER, { cloneId: "c", title: "x", expiresAt: days(5), signers: [] }), "invalid");
    await rejects(() => R.createRequest(MANAGER, { cloneId: "c", title: "x", expiresAt: days(5), signers: signers("same@a.test", "SAME@a.test") }), "invalid");
    await rejects(() => R.createRequest(MANAGER, { cloneId: "c", title: "x", expiresAt: days(5), signers: signers("not-an-email") }), "invalid");
  }));

  console.log("the public link");
  await t("a good link opens its own request; the company comes from the record, not from the host or the ambient company", async () => {
    // Opened while the ambient company is B (as if on B's host): still company A, because the token says so.
    const r = await inB(() => A.resolveSignerToken(a.links[0].token, hdr("10.0.0.1"), { recordView: true }));
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.companyId, "coA");
      assert.equal(r.request._id, a.request._id);
      assert.equal(r.signer.status, "viewed");
      assert.ok(!("tokenHash" in r.signer));
    }
    const rb = await inA(() => A.resolveSignerToken(b.links[0].token, hdr("10.0.0.1")));
    assert.ok(rb.ok && rb.companyId === "coB" && rb.request._id === b.request._id);
    const types = (await inA(() => E.listEvents(a.request._id))).map((e) => e.type);
    assert.ok(types.includes("link_viewed"));
  });
  await t("the view is recorded once, with address and browser", () => inA(async () => {
    await A.resolveSignerToken(a.links[0].token, hdr("10.0.0.2"), { recordView: true });
    const views = (await E.listEvents(a.request._id)).filter((e) => e.type === "link_viewed");
    assert.equal(views.length, 1);
    assert.equal(views[0].ip, "10.0.0.1");
    assert.match(views[0].userAgent ?? "", /Mozilla/);
  }));
  await t("wrong, malformed and empty tokens are refused with the same plain answer", async () => {
    for (const bad of [tokens.generateToken(), "x", "", "../../etc/passwd", "a".repeat(43) + "\u0000", undefined, null, 12345, { $ne: null }]) {
      const r = await A.resolveSignerToken(bad, hdr("10.0.0.3"));
      assert.deepEqual(r, { ok: false, reason: "not_found" });
    }
    assert.ok(A.REFUSAL_COPY.not_found.title.length > 5);
  });
  await t("a token for one company cannot be used to read or change another company's request", async () => {
    await inB(async () => {
      await rejects(() => R.getRequest(a.request._id), "not_found");
      await rejects(() => R.voidRequest(MANAGER, a.request._id, "attack"), "not_found");
      await rejects(() => R.resendLink(MANAGER, a.request._id, a.links[0].signerId), "not_found");
      await rejects(() => R.revokeLink(MANAGER, a.request._id, a.links[0].signerId), "not_found");
      assert.equal((await E.listEvents(a.request._id)).length, 0, "B cannot read A's events");
    });
    await inA(async () => {
      await rejects(() => R.getRequest(b.request._id), "not_found");
    });
    const still = await A.resolveSignerToken(a.links[1].token, hdr("10.0.0.4"));
    assert.ok(still.ok, "A's request is untouched");
  });
  await t("revoking a link refuses it as 'revoked', and the refusal is logged", async () => {
    await inA(() => R.revokeLink(MANAGER, a.request._id, a.links[1].signerId));
    assert.deepEqual(await A.resolveSignerToken(a.links[1].token, hdr("10.0.0.5")), { ok: false, reason: "revoked" });
    assert.ok((await inA(() => E.listEvents(a.request._id))).some((e) => e.type === "link_rejected" && e.data.reason === "revoked"));
    assert.ok((await A.resolveSignerToken(a.links[0].token, hdr("10.0.0.5"))).ok, "the other signer's link is unaffected");
  });
  await t("re-sending replaces the link: the old one stops working, the new one works", async () => {
    const fresh = await inA(() => R.resendLink(MANAGER, a.request._id, a.links[1].signerId));
    assert.notEqual(fresh.token, a.links[1].token);
    assert.equal((await A.resolveSignerToken(a.links[1].token, hdr("10.0.0.6"))).ok, false);
    assert.ok((await A.resolveSignerToken(fresh.token, hdr("10.0.0.6"))).ok);
    a.links[1] = fresh;
  });
  await t("a used link is refused as 'used' (a signer who already answered, or a finished request)", async () => {
    await (await getPlatformDb()).collection("cf_signers").updateOne({ _id: a.links[0].signerId as never }, { $set: { status: "signed", tokenUsedAt: new Date() } });
    assert.deepEqual(await A.resolveSignerToken(a.links[0].token, hdr("10.0.0.7")), { ok: false, reason: "used" });
    await inA(async () => assert.ok(await R.resendLink(MANAGER, a.request._id, a.links[1].signerId)));
    await rejects(() => inA(() => R.resendLink(MANAGER, a.request._id, a.links[0].signerId)), "conflict");
    a.links[1] = await inA(() => R.resendLink(MANAGER, a.request._id, a.links[1].signerId));
  });
  await t("a link is single-purpose: a token row with any other purpose is refused", async () => {
    await (await getPlatformDb()).collection("cf_signers").updateOne({ _id: a.links[1].signerId as never }, { $set: { tokenPurpose: "otp-reset" } });
    assert.equal((await A.resolveSignerToken(a.links[1].token, hdr("10.0.0.8"))).ok, false);
    await (await getPlatformDb()).collection("cf_signers").updateOne({ _id: a.links[1].signerId as never }, { $set: { tokenPurpose: "sign" } });
    assert.ok((await A.resolveSignerToken(a.links[1].token, hdr("10.0.0.8"))).ok);
  });
  await t("an expired link is refused as 'expired', the request is marked expired once, and links are revoked", async () => {
    const later = new Date(Date.now() + 11 * 86_400_000);
    assert.deepEqual(await A.resolveSignerToken(b.links[0].token, hdr("10.0.0.9"), {}, later), { ok: false, reason: "expired" });
    assert.deepEqual(await A.resolveSignerToken(b.links[1].token, hdr("10.0.0.9"), {}, later), { ok: false, reason: "expired" });
    const req = await inB(async () => (await R.getRequest(b.request._id)).request);
    assert.equal(req.status, "expired");
    assert.equal((await inB(() => E.listEvents(b.request._id))).filter((e) => e.type === "request_expired").length, 1);
    assert.ok((await inB(() => R.getRequest(b.request._id))).signers.every((s) => s.tokenRevokedAt));
  });
  await t("voiding revokes every link, keeps the evidence, and needs a reason", async () => {
    const c = await inA(() => R.createRequest(MANAGER, { cloneId: "clone-c", title: "To void", expiresAt: days(5), signers: signers("v1@a.test", "v2@a.test") }));
    await rejects(() => inA(() => R.voidRequest(MANAGER, c.request._id, "")), "invalid");
    await rejects(() => inA(() => R.voidRequest(PLAIN, c.request._id, "no permission")), "forbidden");
    await inA(() => R.voidRequest(MANAGER, c.request._id, "Wrong party"));
    assert.deepEqual(await A.resolveSignerToken(c.links[0].token, hdr("10.0.0.10")), { ok: false, reason: "voided" });
    const got = await inA(() => R.getRequest(c.request._id));
    assert.equal(got.request.status, "voided");
    assert.equal(got.request.voidReason, "Wrong party");
    assert.equal(got.signers.length, 2);
    assert.ok((await inA(() => E.listEvents(c.request._id))).some((e) => e.type === "request_voided"));
  });
  await t("a suspended company's links answer 'unavailable'", async () => {
    const link = await runAsCompany("coS", () => R.createRequest(MANAGER, { cloneId: "x", title: "Suspended", expiresAt: days(5), signers: signers("s@s.test", "s2@s.test") }));
    assert.deepEqual(await A.resolveSignerToken(link.links[0].token, hdr("10.0.0.11")), { ok: false, reason: "unavailable" });
  });
  await t("rate limit: one address cannot try more than the allowance, even with valid-looking tokens", async () => {
    let limited = false;
    for (let i = 0; i < A.SIGN_ATTEMPTS_PER_10_MIN + 5; i++) {
      const r = await A.resolveSignerToken(tokens.generateToken(), hdr("203.0.113.77"));
      if (!r.ok && r.reason === "rate_limited") limited = true;
    }
    assert.ok(limited, "never limited");
    // Once limited, even a correct token from that address is held; another address is unaffected.
    assert.deepEqual(await A.resolveSignerToken(a.links[0].token, hdr("203.0.113.77")), { ok: false, reason: "rate_limited" });
    assert.ok((await A.resolveSignerToken(a.links[1].token, hdr("203.0.113.78"))).ok);
  });

  console.log("event log");
  await t("the chain verifies, and editing, removing or inserting an event breaks it", async () => {
    assert.deepEqual((await inA(() => E.verifyChain(a.request._id))).ok, true);
    const col = (await getPlatformDb()).collection("cf_events");
    const evs = await col.find({ requestId: a.request._id }).sort({ seq: 1 }).toArray();
    await col.updateOne({ _id: evs[1]._id }, { $set: { "data.role": "tampered" } });
    assert.equal((await inA(() => E.verifyChain(a.request._id))).brokenAtSeq, 2);
    await col.updateOne({ _id: evs[1]._id }, { $set: { data: evs[1].data } });
    assert.equal((await inA(() => E.verifyChain(a.request._id))).ok, true);
    await col.deleteOne({ _id: evs[1]._id });
    assert.equal((await inA(() => E.verifyChain(a.request._id))).ok, false);
  });
  await t("concurrent appends keep one unbroken chain (no duplicate sequence numbers)", async () => {
    const c = await inA(() => R.createRequest(MANAGER, { cloneId: "clone-race", title: "Race", expiresAt: days(5), signers: signers("r1@a.test", "r2@a.test") }));
    await inA(() => Promise.all(Array.from({ length: 8 }, (_, i) => E.appendEvent({ requestId: c.request._id, type: "link_viewed", actorType: "system", data: { i } }))));
    const v = await inA(() => E.verifyChain(c.request._id));
    assert.equal(v.ok, true);
    assert.equal(v.count, 3 + 8);
  });
  await t("the events module exports no way to update or delete", () => {
    const src = readFileSync(path.join(ROOT, "src/lib/products/contractflow-ai/events.ts"), "utf8");
    assert.deepEqual([...src.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]).sort(), ["appendEvent", "listEvents", "verifyChain"]);
    assert.ok(!/updateOne|updateMany|deleteOne|deleteMany|replaceOne|findOneAndUpdate/.test(src));
  });

  console.log("provider");
  await t("the only provider is the built-in one and it does not claim steps that are not built", async () => {
    assert.ok(signatureProvider instanceof BuiltInProvider);
    assert.equal(signatureProvider.name, "built-in");
    const p = new BuiltInProvider();
    assert.equal(typeof p.verifyIdentity, "function");
    assert.equal((await p.applySignature(null as never, null as never)).available, false);
    assert.equal((await p.seal(null as never)).available, false);
    const src = readFileSync(path.join(ROOT, "src/lib/products/contractflow-ai/provider.ts"), "utf8");
    assert.equal([...src.matchAll(/implements SignatureProvider/g)].length, 1);
    for (const bad of [/aadhaar\w*\s*[:=]/i, /\bESP\b\s*[:=]/, /dsc\w*\s*[:=]/i]) assert.ok(!bad.test(src), String(bad));
  });
  await t("the public page keeps to the public-access module and shows plain copy", () => {
    const page = readFileSync(path.join(ROOT, "src/app/sign/[token]/page.tsx"), "utf8");
    assert.ok(page.includes("resolveSignerToken"));
    assert.ok(!/\bgetDb\b|currentCompanyId|tokenHash/.test(page));
    for (const k of ["not_found", "expired", "used", "revoked", "voided", "rate_limited", "unavailable"] as const) assert.ok(A.REFUSAL_COPY[k].body.length > 20, k);
  });

  await pdb.dropDatabase();
  console.log("contractflow tokens: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
