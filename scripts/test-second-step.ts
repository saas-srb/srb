import assert from "node:assert/strict";
import {
  DEFAULT_POLICY, canRemoveMethod, hashDeviceToken, isTrustedDevice, maskEmail, mergePolicy, newDeviceToken, offeredMethods, pickMethod, rateDecision, signReauthMarker, verifyReauthMarker, type SecondStepAccount,
} from "../src/lib/security/second-step";

// Pure rules of the multi-method second step. Run with: npx tsx scripts/test-second-step.ts
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("  ✓", name); };
const base = { email: "indira@gmail.com" };
const policy = DEFAULT_POLICY;
const ctx = (over: Partial<Parameters<typeof offeredMethods>[1]> = {}) => ({ appReadable: true, emailReady: true, policy, ...over });
const ids = (a: SecondStepAccount, c = ctx()) => offeredMethods(a, c).map((m) => m.id);

t("every combination of methods is offered in a sensible order, recovery last", () => {
  assert.deepEqual(ids({ ...base, twoFactor: { recovery: ["h"] } }), ["app", "recovery"]);
  assert.deepEqual(ids({ ...base, twoFactorEmail: {} }), ["email"]);
  assert.deepEqual(ids({ ...base, twoFactor: {}, twoFactorEmail: {}, secondStep: { recovery: ["h"] } }), ["app", "email", "recovery"]);
  assert.deepEqual(ids({ ...base, twoFactor: {}, twoFactorEmail: {}, secondStep: { preferred: "email", recovery: ["h"] } }), ["email", "app", "recovery"]);
  assert.deepEqual(ids({ ...base }), [], "no second step: nothing offered");
});
t("masked destinations only, and nothing about methods the account does not have", () => {
  const m = offeredMethods({ ...base, twoFactor: {}, twoFactorEmail: {} }, ctx());
  assert.equal(m.find((x) => x.id === "email")?.label, "Email a code to i*****@gmail.com");
  assert.equal(maskEmail("a@b.co"), "a**@b.co");
  assert.ok(!ids({ ...base, twoFactor: {} }).includes("email"), "email is not offered to someone who never turned it on");
});
t("a failing method surfaces the others: unreadable authenticator + verified email -> email is offered automatically", () => {
  const a = { ...base, twoFactor: {} };
  assert.deepEqual(ids(a, ctx({ appReadable: false })), ["email"]);
  assert.deepEqual(ids({ ...a, secondStep: { recovery: ["h"] } }, ctx({ appReadable: false })), ["email", "recovery"]);
  assert.deepEqual(ids(a, ctx({ appReadable: false, emailReady: false })), [], "no provider: nothing but staff reset");
  assert.deepEqual(ids({ ...a, twoFactorEmail: {} }, ctx({ emailReady: false })), ["app"], "an email outage leaves the authenticator");
});
t("policy: email not allowed -> never offered, even as the fallback", () => {
  const off = mergePolicy({ emailAllowed: false });
  assert.deepEqual(ids({ ...base, twoFactor: {}, twoFactorEmail: {}, secondStep: { recovery: ["h"] } }, ctx({ policy: off })), ["app", "recovery"]);
  assert.deepEqual(ids({ ...base, twoFactor: {} }, ctx({ policy: off, appReadable: false })), []);
});
t("preferred method switching: the requested method wins when offered, else the first", () => {
  const m = offeredMethods({ ...base, twoFactor: {}, twoFactorEmail: {}, secondStep: { recovery: ["h"] } }, ctx());
  assert.equal(pickMethod(m, "email"), "email");
  assert.equal(pickMethod(m, "recovery"), "recovery");
  assert.equal(pickMethod(m, "bogus"), "app");
  assert.equal(pickMethod([], "app"), null);
});
t("last-method protection when a second step is required; free choice otherwise", () => {
  const both = { ...base, twoFactor: {}, twoFactorEmail: {} };
  assert.equal(canRemoveMethod(both, "app", { required: true }).ok, true);
  assert.equal(canRemoveMethod({ ...base, twoFactor: {} }, "app", { required: true }).ok, false);
  assert.equal(canRemoveMethod({ ...base, twoFactorEmail: {} }, "email", { required: true }).ok, false);
  assert.equal(canRemoveMethod({ ...base, twoFactor: {} }, "app", { required: false }).ok, true);
  assert.equal(canRemoveMethod({ ...base, twoFactor: {}, secondStep: { recovery: ["h"] } }, "app", { required: true }).ok, false, "recovery codes alone are not a method");
});
t("re-authentication marker: valid inside the window, expires, bound to user and session, tamper-proof", () => {
  const secret = "s3cret";
  const token = signReauthMarker({ userId: "u1", sessionHash: "sess1", nowMs: 1_000_000, secret });
  const ok = (over: Partial<Parameters<typeof verifyReauthMarker>[1]> = {}) => verifyReauthMarker(token, { userId: "u1", sessionHash: "sess1", nowMs: 1_000_000 + 60_000, windowMs: 10 * 60_000, secret, ...over });
  assert.equal(ok(), true);
  assert.equal(ok({ nowMs: 1_000_000 + 11 * 60_000 }), false, "expired after the window");
  assert.equal(ok({ windowMs: 30_000 }), false, "a shorter configured window applies");
  assert.equal(ok({ userId: "u2" }), false, "bound to the account");
  assert.equal(ok({ sessionHash: "sess2" }), false, "bound to the session");
  assert.equal(ok({ secret: "other" }), false);
  assert.equal(verifyReauthMarker(token.replace(/.$/, "x"), { userId: "u1", sessionHash: "sess1", nowMs: 1_000_100, windowMs: 600_000, secret }), false, "tampered");
  assert.equal(verifyReauthMarker(null, { userId: "u1", sessionHash: "sess1", nowMs: 1, windowMs: 1, secret }), false);
});
t("trusted device: opt-in only, hashed, expiring, revocable", () => {
  const tok = newDeviceToken();
  const acct: SecondStepAccount = { ...base, twoFactor: {}, secondStep: { trusted: [{ hash: hashDeviceToken(tok), expiresAt: new Date(Date.now() + 86_400_000) }] } };
  const on = mergePolicy({ trustDeviceAllowed: true });
  assert.equal(isTrustedDevice(acct, tok, Date.now(), DEFAULT_POLICY), false, "off by default");
  assert.equal(isTrustedDevice(acct, tok, Date.now(), on), true);
  assert.equal(isTrustedDevice(acct, "another", Date.now(), on), false);
  assert.equal(isTrustedDevice(acct, tok, Date.now() + 2 * 86_400_000, on), false, "expired");
  assert.ok(!JSON.stringify(acct).includes(tok), "only a hash is stored");
  assert.equal(isTrustedDevice({ ...base, twoFactor: {}, secondStep: { trusted: [] } }, tok, Date.now(), on), false, "revoked");
});
t("policy defaults and clamping: email fallback allowed, trust off, 10 minute window", () => {
  assert.deepEqual(DEFAULT_POLICY, { emailAllowed: true, requireForAdmins: false, trustDeviceAllowed: false, trustDeviceDays: 30, reauthMinutes: 10 });
  assert.equal(mergePolicy({ reauthMinutes: 999 }).reauthMinutes, 60);
  assert.equal(mergePolicy({ reauthMinutes: 0 }).reauthMinutes, 1);
  assert.equal(mergePolicy({ emailAllowed: false }, { requireForAdmins: true }).requireForAdmins, true, "later layers (company) override earlier ones");
});
t("per-method rate limit: allowed until max inside the window, then blocked, then the window resets", () => {
  const rule = { max: 3, windowMs: 60_000 };
  let st = rateDecision(null, 0, rule).next;
  for (let i = 0; i < 3; i++) { assert.equal(rateDecision(st, i * 1000, rule).allowed, true); st = { ...st, count: st.count + 1 }; }
  assert.equal(rateDecision(st, 5000, rule).allowed, false);
  assert.equal(rateDecision(st, 61_000, rule).allowed, true);
});
console.log(`\n${n} passed`);
