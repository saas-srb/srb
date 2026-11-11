import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { addExtraKeys, deriveKek, keyId, normalizeHosts, normalizeMongoUri, parseEnvKey, resolveKeyring, rewrapDoc, unwrapKey, wrapKey, type KeyringDoc } from "../src/lib/platform/keyring/core";
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
