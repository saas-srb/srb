/**
 * Password hashing: new hashes carry their cost, old `salt:hash` hashes still verify and are flagged for re-hashing, bad input is refused.
 *   npx tsx scripts/test-password.ts
 */
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../src/lib/security/password";

const h = hashPassword("Correct horse 7!");
assert.ok(h.startsWith("scrypt$32768$8$3$"));
assert.equal(verifyPassword("Correct horse 7!", h), true);
assert.equal(verifyPassword("correct horse 7!", h), false);
assert.equal(passwordNeedsRehash(h), false);
assert.notEqual(hashPassword("x"), hashPassword("x"), "each hash has its own salt");

// A hash written by the old code (salt:hash, N=16384, r=8, p=1) still works and is flagged.
const salt = randomBytes(16).toString("hex");
const legacy = `${salt}:${scryptSync("old password", salt, 64).toString("hex")}`;
assert.equal(verifyPassword("old password", legacy), true);
assert.equal(verifyPassword("wrong", legacy), false);
assert.equal(passwordNeedsRehash(legacy), true);

// Garbage and hostile parameters are refused without doing the work.
for (const bad of ["", "nonsense", "scrypt$1$1$1$a$b", "scrypt$1073741824$8$3$aa$bb", "scrypt$32768$8$99$aa$bb", "scrypt$30000$8$3$aa$bb"]) {
  assert.equal(verifyPassword("anything", bad), false, bad);
}
console.log("password hashing: all checks passed");
