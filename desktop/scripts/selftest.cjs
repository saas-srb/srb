"use strict";
/** Checks the address logic without starting Electron: `npm test`. */
const assert = require("node:assert/strict");
const { candidates, resolveWorkspace } = require("../src/address.cjs");

const R = "selfrunbusiness.com";
assert.deepEqual(candidates("acme", R), ["https://acme-app.selfrunbusiness.com"]);
assert.deepEqual(candidates("  ACME  ", R), ["https://acme-app.selfrunbusiness.com"]);
assert.deepEqual(candidates("acme.selfrunbusiness.com", R), ["https://acme-app.selfrunbusiness.com", "https://app.acme.selfrunbusiness.com", "https://acme.selfrunbusiness.com"]);
assert.deepEqual(candidates("acme-app.selfrunbusiness.com", R)[0], "https://acme-app.selfrunbusiness.com");
assert.deepEqual(candidates("https://app.acme.com/workspace?x=1", R)[0], "https://app.acme.com");
assert.deepEqual(candidates("acme.com", R), ["https://app.acme.com", "https://acme.com"]);
assert.deepEqual(candidates("acme-app.localhost:3000", R)[0], "http://acme-app.localhost:3000");
assert.deepEqual(candidates("acme", "example.org"), ["https://acme-app.example.org"]);
assert.deepEqual(candidates("", R), []);
assert.deepEqual(candidates("bad host!", R), []);
assert.deepEqual(candidates("javascript:alert(1)", R), []);

(async () => {
  const seen = [];
  const ok = await resolveWorkspace("acme.com", { rootDomain: R, fetchJson: async (u) => { seen.push(u); if (u.startsWith("https://app.acme.com")) return { app: "selfrun-desktop", name: "Acme", origin: "https://app.acme.com" }; throw new Error("no"); } });
  assert.equal(ok.ok, true);
  assert.equal(ok.origin, "https://app.acme.com");
  const bad = await resolveWorkspace("nope", { rootDomain: R, fetchJson: async () => ({ hello: "world" }) });
  assert.equal(bad.ok, false);
  console.log("desktop address logic: all checks passed");
})();
