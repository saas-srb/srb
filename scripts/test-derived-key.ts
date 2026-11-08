import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { derivedKey, derivedKeyConfigured } from "../src/lib/security/derived-key";

// Pure checks on process.env only: no database is read or written.
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const root = randomBytes(32).toString("base64");
for (const k of ["HRMS_ENCRYPTION_KEY", "FMS_ENCRYPTION_KEY"]) delete process.env[k];
delete process.env.PLATFORM_ENCRYPTION_KEY;

t("nothing set = not configured", () => { assert.equal(derivedKey("hrms", "HRMS_ENCRYPTION_KEY"), null); assert.equal(derivedKeyConfigured("HRMS_ENCRYPTION_KEY"), false); });
process.env.PLATFORM_ENCRYPTION_KEY = root;
t("one platform key configures every product", () => { assert.equal(derivedKeyConfigured("HRMS_ENCRYPTION_KEY"), true); assert.equal(derivedKey("fms", "FMS_ENCRYPTION_KEY")!.length, 32); });
t("stable, and a different key per purpose", () => {
  assert.deepEqual(derivedKey("hrms", "HRMS_ENCRYPTION_KEY"), derivedKey("hrms", "HRMS_ENCRYPTION_KEY"));
  assert.notDeepEqual(derivedKey("hrms", "HRMS_ENCRYPTION_KEY"), derivedKey("fms", "FMS_ENCRYPTION_KEY"));
  assert.notDeepEqual(derivedKey("hrms", "HRMS_ENCRYPTION_KEY"), Buffer.from(root, "base64"));
});
t("a different platform key gives different keys", () => {
  const a = derivedKey("hrms", "HRMS_ENCRYPTION_KEY");
  process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  assert.notDeepEqual(a, derivedKey("hrms", "HRMS_ENCRYPTION_KEY"));
  process.env.PLATFORM_ENCRYPTION_KEY = root;
});
t("an old per-product variable still wins, so stored data stays readable", () => {
  const legacy = randomBytes(32);
  process.env.HRMS_ENCRYPTION_KEY = legacy.toString("base64");
  assert.deepEqual(derivedKey("hrms", "HRMS_ENCRYPTION_KEY"), legacy);
  process.env.HRMS_ENCRYPTION_KEY = "short";
  assert.throws(() => derivedKey("hrms", "HRMS_ENCRYPTION_KEY"));
});
console.log("passed");
