import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { addRootKey, checkKeyCanary, healFromPassphrase, wrapWithPassphrase, addExtraKeys, deriveKek, keyId, normalizeHosts, normalizeMongoUri, parseEnvKey, resolveKeyring, rewrapDoc, unwrapKey, wrapKey, type KeyringDoc } from "../src/lib/platform/keyring/core";
import { makeProbe, resealSample, type CipherSample } from "../src/lib/platform/keyring/probe";
import { breakGlassMatches } from "../src/lib/security/break-glass";
import { createCipheriv } from "node:crypto";
import { authorizeCron } from "../src/lib/cron/auth";

// Pure: no database, no network. Run with: npx tsx scripts/test-keyring.ts
let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("  ✓", name);
};
const URI = "mongodb://app:s3cret@h2.example.com:27017,h1.example.com:27017/prod?retryWrites=true&w=majority";
const kek = deriveKek(URI, "selfrun.com,www.selfrun.com");
const k1 = randomBytes(32);
const k2 = randomBytes(32);
const b64 = (k: Buffer) => k.toString("base64");

t("URI normalisation ignores host order, options and host case, but not credentials", () => {
  assert.equal(normalizeMongoUri(URI), normalizeMongoUri("mongodb://app:s3cret@H1.example.com:27017,h2.example.com:27017/prod?appName=x"));
  assert.notEqual(normalizeMongoUri(URI), normalizeMongoUri(URI.replace("s3cret", "other")));
  assert.deepEqual(deriveKek(URI, "a.com,b.com"), deriveKek(URI.replace("retryWrites=true", "tls=true"), "B.com, a.com"));
  assert.notDeepEqual(deriveKek(URI, "a.com"), deriveKek(URI, "b.com"));
  assert.equal(normalizeHosts(" B.com,a.com,a.com "), "a.com,b.com");
});
t("wrap/unwrap round-trips; a wrong KEK or altered id fails", () => {
  const w = wrapKey(kek, k1, keyId(k1));
  assert.deepEqual(unwrapKey(kek, w, keyId(k1)), k1);
  assert.equal(unwrapKey(deriveKek(URI + "x", "a"), w, keyId(k1)), null);
  assert.equal(unwrapKey(kek, w, "deadbeef"), null);
});
t("(a) env key and no keyring: escrowed as version 1", () => {
  const r = resolveKeyring({ envKey: k1, doc: null, kek, dbHasData: true });
  assert.ok(r.state === "ok" && r.action === "escrowed" && r.write?.keys.length === 1 && r.write.keys[0].version === 1);
  assert.deepEqual(r.state === "ok" && r.keys[0].key, k1);
});
t("(b) no env key and a keyring: unwrapped from the database", () => {
  const first = resolveKeyring({ envKey: k1, doc: null, kek, dbHasData: true });
  assert.ok(first.state === "ok" && first.write);
  const r = resolveKeyring({ envKey: null, doc: first.write, kek, dbHasData: true });
  assert.ok(r.state === "ok" && r.action === "unwrapped" && r.write === null);
  assert.deepEqual(r.state === "ok" && r.keys[0].key, k1);
});
t("(c) nothing anywhere: fresh DB generates, a DB with data refuses", () => {
  const fresh = resolveKeyring({ envKey: null, doc: null, kek, dbHasData: false });
  assert.ok(fresh.state === "ok" && fresh.action === "generated" && fresh.keys[0].key.length === 32 && fresh.write);
  const full = resolveKeyring({ envKey: null, doc: null, kek, dbHasData: true });
  assert.equal(full.state, "needs_old_key");
  assert.equal(full.keys.length, 0);
});
t("(d) a different env key is added as a NEW version; the old one is kept, nothing overwritten", () => {
  const first = resolveKeyring({ envKey: k1, doc: null, kek, dbHasData: true });
  assert.ok(first.state === "ok" && first.write);
  const r = resolveKeyring({ envKey: k2, doc: first.write, kek, dbHasData: true });
  assert.ok(r.state === "ok" && r.action === "added-version" && r.write);
  assert.equal(r.write.keys.length, 2);
  assert.deepEqual(r.keys.map((k) => k.id).sort(), [keyId(k1), keyId(k2)].sort());
  assert.equal(r.keys[0].status, "active");
  assert.deepEqual(r.keys[0].key, k2);
  assert.ok(r.write.keys.find((k) => k.id === keyId(k1))); // v1 still there
  // the same env key again changes nothing; the old deployment's key still just works
  const again = resolveKeyring({ envKey: k1, doc: r.write, kek, dbHasData: true });
  assert.ok(again.state === "ok" && again.write === null);
});
t("versioned decrypt: legacy ciphertext (no key id) is opened by trying every version", async () => {
  const { createCipheriv, createDecipheriv } = await import("node:crypto");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k1, iv);
  c.setAAD(Buffer.from("ctx"));
  const ct = Buffer.concat([c.update("secret-value"), c.final()]);
  const tag = c.getAuthTag();
  const first = resolveKeyring({ envKey: k1, doc: null, kek, dbHasData: true });
  assert.ok(first.state === "ok" && first.write);
  const r = resolveKeyring({ envKey: k2, doc: first.write, kek, dbHasData: true });
  assert.ok(r.state === "ok");
  const opened = r.keys.map((k) => k.key).flatMap((key) => {
    try {
      const d = createDecipheriv("aes-256-gcm", key, iv);
      d.setAAD(Buffer.from("ctx"));
      d.setAuthTag(tag);
      return [Buffer.concat([d.update(ct), d.final()]).toString()];
    } catch {
      return [];
    }
  });
  assert.deepEqual(opened, ["secret-value"]);
});
t("(e) rotated database credentials: cannot_unwrap with the old URI's keys unreadable; rewrap fixes it", () => {
  const first = resolveKeyring({ envKey: k1, doc: null, kek, dbHasData: true });
  assert.ok(first.state === "ok" && first.write);
  const newKek = deriveKek(URI.replace("s3cret", "rotated"), "selfrun.com,www.selfrun.com");
  const broken = resolveKeyring({ envKey: null, doc: first.write, kek: newKek, dbHasData: true });
  assert.equal(broken.state, "cannot_unwrap");
  const withEnv = resolveKeyring({ envKey: k1, doc: first.write, kek: newKek, dbHasData: true });
  assert.ok(withEnv.state === "cannot_unwrap" && withEnv.keys.length === 1, "an env key still lets the app run, and nothing is overwritten");
  const re = rewrapDoc(first.write, kek, newKek);
  assert.ok(re);
  const ok = resolveKeyring({ envKey: null, doc: re as KeyringDoc, kek: newKek, dbHasData: true });
  assert.ok(ok.state === "ok" && ok.keys[0].key.equals(k1));
  assert.equal(rewrapDoc(first.write, newKek, kek), null, "the wrong old KEK is refused");
});
t("env key parsing: only a base64 32-byte key counts", () => {
  assert.ok(parseEnvKey(b64(k1))?.equals(k1));
  assert.equal(parseEnvKey("short"), null);
  assert.equal(parseEnvKey(""), null);
});

t("adopted legacy product keys and *_PREVIOUS become extra versions; existing keys untouched; idempotent", () => {
  const first = resolveKeyring({ envKey: k1, doc: null, kek, dbHasData: true });
  assert.ok(first.state === "ok" && first.write);
  const hrms = randomBytes(32);
  const old = randomBytes(32);
  const doc = addExtraKeys(first.write, kek, [{ purpose: "hrms", key: hrms, previous: false }, { purpose: null, key: old, previous: true }]);
  assert.ok(doc && doc.keys.length === 3);
  assert.equal(doc.keys[0].id, first.write.keys[0].id);
  assert.equal(addExtraKeys(doc, kek, [{ purpose: "hrms", key: hrms, previous: false }]), null);
  const r = resolveKeyring({ envKey: null, doc, kek, dbHasData: true });
  assert.ok(r.state === "ok");
  assert.deepEqual(r.keys.map((k) => k.key.toString("hex")).sort(), [k1, old].map((k) => k.toString("hex")).sort());
  assert.deepEqual(r.products?.map((p) => `${p.purpose}:${p.key.toString("hex")}`), [`hrms:${hrms.toString("hex")}`]);
  assert.equal(r.keys[0].status, "active");
  assert.ok(rewrapDoc(doc, kek, deriveKek(URI + "z", "a")), "product keys rewrap too");
});

// ── key verification (wrong key on a database that already has ciphertext) ──
const seal = (key: Buffer, aad: string, plain: string, withId = false): CipherSample => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return { enc: { c: ct.toString("base64"), iv: iv.toString("base64"), t: c.getAuthTag().toString("base64"), ...(withId ? { k: keyId(key) } : {}) }, aad, where: aad };
};
const real = randomBytes(32);
const dev = randomBytes(32);
const samples = [seal(real, "2fa:co1:u1", "TOTPSECRET1"), seal(real, "2fa:co2:u2", "TOTPSECRET2")];
const probe = makeProbe(samples);

t("wrong env key on a DB with ciphertext it does not open: stored UNVERIFIED, nothing silently trusted", () => {
  assert.equal(probe.opens(dev), 0);
  assert.equal(probe.opens(real), 2);
  const r = resolveKeyring({ envKey: dev, doc: null, kek, dbHasData: true, probe });
  assert.ok(r.state === "ok" && r.write);
  assert.equal(r.write.keys[0].verification, "unverified");
  assert.equal(probe.unopenable(r.keys.map((k) => k.key)), 2, "the alert counts what nothing opens");
});
t("an unverified env key on top of a verified keyring is decrypt-only: the active key does not change", () => {
  const first = resolveKeyring({ envKey: real, doc: null, kek, dbHasData: true, probe });
  assert.ok(first.state === "ok" && first.write && first.write.keys[0].verification === "verified");
  const r = resolveKeyring({ envKey: dev, doc: first.write, kek, dbHasData: true, probe });
  assert.ok(r.state === "ok" && r.write);
  assert.equal(r.keys[0].id, keyId(real), "the verified key stays active");
  assert.equal(r.write.keys.find((k) => k.id === keyId(dev))?.verification, "unverified");
  assert.equal(r.write.keys.find((k) => k.id === keyId(dev))?.status, "retired");
});
t("the real key arriving later (env of any deployment) is verified and promoted; the dev key stays, decrypt-only", () => {
  const first = resolveKeyring({ envKey: dev, doc: null, kek, dbHasData: true, probe });
  assert.ok(first.state === "ok" && first.write);
  const r = resolveKeyring({ envKey: real, doc: first.write, kek, dbHasData: true, probe });
  assert.ok(r.state === "ok" && r.write && r.action === "added-version");
  assert.equal(r.keys[0].id, keyId(real));
  assert.equal(r.keys[0].verification, "verified");
  assert.ok(r.write.keys.some((k) => k.id === keyId(dev)), "the dev key is never deleted");
  assert.equal(probe.unopenable(r.keys.map((k) => k.key)), 0);
});
t("a key already stored as unverified that now opens existing ciphertext is promoted to verified and active", () => {
  const first = resolveKeyring({ envKey: dev, doc: null, kek, dbHasData: true, probe });
  assert.ok(first.state === "ok" && first.write);
  const withReal = addRootKey(first.write, kek, real, "env");
  assert.equal(withReal.keys.find((k) => k.id === keyId(real))?.status, "active");
  // a doc with the real key stored unverified (e.g. escrowed earlier on a DB that had none of its data)
  const doc = { ...first.write, keys: [...first.write.keys.map((k) => ({ ...k, status: "active" as const })), { ...withReal.keys[1], verification: "unverified" as const, status: "retired" as const }] };
  const r = resolveKeyring({ envKey: null, doc, kek, dbHasData: true, probe });
  assert.ok(r.state === "ok" && r.write);
  assert.equal(r.keys[0].id, keyId(real));
  assert.equal(r.keys[0].verification, "verified");
});
t("keyring locked (URI/hosts differ): never overwritten, nothing written, even with an env key", () => {
  const first = resolveKeyring({ envKey: real, doc: null, kek, dbHasData: true, probe });
  assert.ok(first.state === "ok" && first.write);
  const other = deriveKek(URI.replace("s3cret", "other"), "selfrun.com,www.selfrun.com");
  for (const env of [null, dev, real]) {
    const r = resolveKeyring({ envKey: env, doc: first.write, kek: other, dbHasData: true, probe });
    assert.equal(r.state, "cannot_unwrap");
    assert.equal((r as { write?: unknown }).write, undefined, "no write in a locked keyring");
  }
});
t("a corrupt canary is detected", () => {
  const first = resolveKeyring({ envKey: real, doc: null, kek, dbHasData: false });
  assert.ok(first.state === "ok" && first.write);
  assert.equal(checkKeyCanary(real, keyId(real), first.write.keys[0].check), true);
  assert.equal(checkKeyCanary(dev, keyId(real), first.write.keys[0].check), false);
  const tampered = { ...first.write, keys: [{ ...first.write.keys[0], check: { ...first.write.keys[0].check!, t: Buffer.alloc(16).toString("base64") } }] };
  assert.equal(resolveKeyring({ envKey: null, doc: tampered, kek, dbHasData: true }).state, "cannot_unwrap");
});
t("self-sealed new data never proves a key (only pre-existing ciphertext does)", () => {
  const mine = [seal(dev, "2fa:co1:u1", "x", true)];
  assert.equal(makeProbe(mine).opens(dev, true), 0);
  assert.equal(makeProbe(mine).opens(dev), 1, "but a key NOT yet stored is judged by what it opens");
});
t("rotation re-seals with the new key and the old ciphertext still opens", () => {
  const rotated = randomBytes(32);
  const s = samples[0];
  const resealed = resealSample(s, [real], rotated);
  assert.ok(resealed && resealed.k === keyId(rotated));
  assert.equal(makeProbe([{ ...s, enc: resealed }]).unopenable([rotated]), 0);
  assert.equal(makeProbe([s]).opens(real), 1, "the old ciphertext is untouched and still opens");
  assert.equal(resealSample({ ...s, enc: resealed }, [real, rotated], rotated), null, "already on the active key");
});
t("recovery passphrase: heals a keyring after the database URI changed; wrong passphrase refused", () => {
  const first = resolveKeyring({ envKey: real, doc: null, kek, dbHasData: true });
  assert.ok(first.state === "ok");
  const w = wrapWithPassphrase(first.keys.map((k) => ({ id: k.id, key: k.key })), "correct horse battery");
  const newKek = deriveKek(URI.replace("s3cret", "rotated"), "selfrun.com");
  assert.equal(healFromPassphrase(w, "wrong passphrase!!", newKek), null);
  const healed = healFromPassphrase(w, "correct horse battery", newKek);
  assert.ok(healed);
  const r = resolveKeyring({ envKey: null, doc: healed, kek: newKek, dbHasData: true });
  assert.ok(r.state === "ok" && r.keys[0].key.equals(real));
});
t("break-glass: only the exact env email and password, constant time, never when env is unset", () => {
  const env = { envEmail: "Owner@Example.com", envPassword: "S3cret!pass" };
  assert.equal(breakGlassMatches({ email: "owner@example.com", password: "S3cret!pass", ...env }), true);
  assert.equal(breakGlassMatches({ email: "owner@example.com", password: "S3cret!pasx", ...env }), false);
  assert.equal(breakGlassMatches({ email: "other@example.com", password: "S3cret!pass", ...env }), false);
  assert.equal(breakGlassMatches({ email: "owner@example.com", password: "S3cret!pass", envEmail: undefined, envPassword: undefined }), false);
  assert.equal(breakGlassMatches({ email: "", password: "", envEmail: "", envPassword: "" }), false);
});
t("a keyring written before verification existed, holding a key that opens nothing, is flagged unverified at the next boot (the current production case)", () => {
  const first = resolveKeyring({ envKey: dev, doc: null, kek, dbHasData: false });
  assert.ok(first.state === "ok" && first.write);
  const legacy = { ...first.write, keys: first.write.keys.map(({ verification, check, ...rest }) => { void verification; void check; return rest; }) };
  const r = resolveKeyring({ envKey: dev, doc: legacy, kek, dbHasData: true, probe });
  assert.ok(r.state === "ok" && r.write);
  assert.equal(r.keys[0].verification, "unverified");
  assert.equal(probe.unopenable(r.keys.map((k) => k.key)), 2);
  // then the real key arrives and is promoted
  const r2 = resolveKeyring({ envKey: real, doc: r.write, kek, dbHasData: true, probe });
  assert.ok(r2.state === "ok" && r2.keys[0].id === keyId(real) && r2.keys[0].verification === "verified");
});
t("once a verified key exists, a deployment with a different env key (or none) causes no alert and no change of active key", () => {
  const first = resolveKeyring({ envKey: real, doc: null, kek, dbHasData: true, probe });
  assert.ok(first.state === "ok" && first.write);
  for (const env of [dev, null]) {
    const r = resolveKeyring({ envKey: env, doc: first.write, kek, dbHasData: true, probe });
    assert.ok(r.state === "ok");
    assert.equal(r.keys[0].id, keyId(real));
    assert.equal(r.keys[0].verification, "verified");
    assert.equal(probe.unopenable(r.keys.map((k) => k.key)), 0, "the alert condition is false");
  }
});

const base = { bearerMatches: false, secretConfigured: false, userAgent: "vercel-cron/1.0", hostAllowed: true, lastRunAtMs: null, intervalMs: 86_400_000, nowMs: 1_000_000_000 };
t("cron auth: bearer always works; a secret closes the unauthenticated path", () => {
  assert.deepEqual(authorizeCron({ ...base, bearerMatches: true, secretConfigured: true }), { ok: true, via: "bearer" });
  assert.deepEqual(authorizeCron({ ...base, secretConfigured: true }), { ok: false, reason: "unauthorized" });
});
t("cron auth: with no secret, Vercel's cron call is accepted once, then rate limited", () => {
  assert.deepEqual(authorizeCron(base), { ok: true, via: "vercel-cron" });
  const soon = authorizeCron({ ...base, lastRunAtMs: base.nowMs - 3_600_000 });
  assert.ok(!soon.ok && soon.reason === "too-soon");
  assert.ok(authorizeCron({ ...base, lastRunAtMs: base.nowMs - 13 * 3_600_000 }).ok);
});
t("cron auth: spoofed callers are refused (wrong user agent or host)", () => {
  assert.equal(authorizeCron({ ...base, userAgent: "curl/8" }).ok, false);
  assert.equal(authorizeCron({ ...base, userAgent: null }).ok, false);
  assert.equal(authorizeCron({ ...base, hostAllowed: false }).ok, false);
});
console.log(`\n${n} passed`);
