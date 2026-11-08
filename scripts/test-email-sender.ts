/**
 * The rules for a company's own sending address (pure; nothing is read or written).
 *   npx tsx scripts/test-email-sender.ts
 */
import assert from "node:assert/strict";
import { checkSenderInput, formatFrom } from "../src/lib/platform/email/sender-rules";

const ok = (d: string, l = "hello", n = "Acme Care", r = "") => checkSenderInput({ domain: d, localPart: l, fromName: n, replyTo: r }, "selfrunbusiness.com");
let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

t("a normal domain is accepted and cleaned", () => {
  const r = ok(" https://www.Acme.com/ ");
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.value.domain, "acme.com"); assert.equal(formatFrom(r.value), "Acme Care <hello@acme.com>"); }
});
t("free mailbox services are refused", () => { assert.equal(ok("gmail.com").ok, false); assert.equal(ok("outlook.com").ok, false); });
t("the platform's own domain and its subdomains are refused", () => { assert.equal(ok("selfrunbusiness.com").ok, false); assert.equal(ok("acme.selfrunbusiness.com").ok, false); assert.equal(ok("x.vercel.app").ok, false); });
t("not a domain", () => { for (const d of ["", "acme", "a@b.com", "acme..com", "-acme.com", "acme.c"]) assert.equal(ok(d).ok, false, d); });
t("the part before @", () => { assert.equal(ok("acme.com", "no-reply").ok, true); for (const l of ["", "a b", "hello@x", ".x", "x."]) assert.equal(ok("acme.com", l).ok, false, l); });
t("the name people see", () => { assert.equal(ok("acme.com", "hello", "").ok, false); assert.equal(ok("acme.com", "hello", 'Evil <x@y.z>').ok, false); assert.equal(ok("acme.com", "hello", "x".repeat(81)).ok, false); });
t("reply-to is optional but must be an address", () => { assert.equal(ok("acme.com", "hello", "A", "").ok, true); assert.equal(ok("acme.com", "hello", "A", "support@acme.com").ok, true); assert.equal(ok("acme.com", "hello", "A", "nope").ok, false); });
console.log(`\n${passed} checks passed.`);
