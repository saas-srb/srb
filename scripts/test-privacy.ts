/**
 * Privacy workflows: the consent gate rules, privacy-request validation, and the password policy.
 *   MONGODB_URI=mongodb://127.0.0.1:1/unused npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-privacy.ts
 */
import assert from "node:assert/strict";
import { EMPTY_TRACKING, type TrackingSettings } from "../src/lib/products/sitecraft-ai/tracking-shared";
import { trackingNeedsConsent } from "../src/lib/products/sitecraft-ai/consent";
import { parseInquiry, PRIVACY_REQUEST_DAYS, PRIVACY_REQUEST_TYPES } from "../src/lib/platform/saas/inquiries-shared";
import { passwordPolicyError } from "../src/lib/security/password";

const t = (over: Partial<TrackingSettings>): TrackingSettings => ({ ...EMPTY_TRACKING, ...over });
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`✓ ${name}`); };

ok("nothing that tracks means no banner", () => {
  assert.equal(trackingNeedsConsent(t({})), false);
  assert.equal(trackingNeedsConsent(t({ googleSiteVerification: ["abc"], tawkId: "x/y" })), false, "verification tags and a click-to-open chat do not track on load");
  assert.equal(trackingNeedsConsent(t({ scripts: [{ id: "a", name: "x", placement: "head", enabled: false, code: "<script></script>" }] })), false, "a disabled script is not loaded");
});
ok("analytics, advertising and custom scripts need consent", () => {
  assert.equal(trackingNeedsConsent(t({ ga4Ids: ["G-1"] })), true);
  assert.equal(trackingNeedsConsent(t({ gtmIds: ["GTM-1"] })), true);
  assert.equal(trackingNeedsConsent(t({ clarityIds: ["c"] })), true);
  assert.equal(trackingNeedsConsent(t({ metaPixelIds: ["1"] })), true);
  assert.equal(trackingNeedsConsent(t({ scripts: [{ id: "a", name: "x", placement: "head", enabled: true, code: "<script>1</script>" }] })), true);
});

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
ok("a privacy request needs a real request type, a message and an email", () => {
  const good = parseInquiry("privacy", fd({ name: "Asha Rao", email: "asha@example.com", interest: PRIVACY_REQUEST_TYPES[0], message: "Please send me what you hold on me." }));
  assert.equal(good.ok, true);
  assert.equal(parseInquiry("privacy", fd({ name: "Asha", email: "asha@example.com", interest: "Hack me", message: "long enough message" })).ok, false);
  assert.equal(parseInquiry("privacy", fd({ name: "Asha", email: "asha@example.com", interest: PRIVACY_REQUEST_TYPES[1], message: "short" })).ok, false);
  assert.equal(parseInquiry("privacy", fd({ name: "Asha", email: "not-an-email", interest: PRIVACY_REQUEST_TYPES[1], message: "long enough message" })).ok, false);
  assert.equal(PRIVACY_REQUEST_DAYS, 30);
});
ok("demo and contact forms are unchanged", () => {
  assert.equal(parseInquiry("demo", fd({ name: "Asha", email: "a@b.co", company: "Acme" })).ok, true);
  assert.equal(parseInquiry("contact", fd({ name: "Asha", email: "a@b.co", message: "How do plans work?" })).ok, true);
});
ok("password policy", () => {
  assert.equal(passwordPolicyError("short1!"), "Use at least 10 characters.");
  assert.match(passwordPolicyError("password123") ?? "", /too easy/);
  assert.match(passwordPolicyError("aaaaaaaaaaaa") ?? "", /too easy/);
  assert.match(passwordPolicyError("asharao-secret-9", { email: "asharao@example.com" }) ?? "", /email/);
  assert.match(passwordPolicyError("x".repeat(201)) ?? "", /at most/);
  assert.equal(passwordPolicyError("correct horse battery staple"), null);
});
console.log(`\n${n} checks passed.`);
