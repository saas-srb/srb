import assert from "node:assert/strict";
import { CONNECTION_PROVIDERS, PLATFORM_FALLBACK } from "../src/lib/platform/connections/catalog";
import { CONFIG_FIELDS } from "../src/lib/platform/config/registry";
import { INTEGRATION_DEFAULTS, PLATFORM_ONLY_KEYS } from "../src/lib/platform/defaults/integration-map";
import { CONSOLE_CATEGORIES, PLATFORM_CARDS, consoleCardData, platformCard, usageLine } from "../src/lib/platform/defaults/console-cards";
import { hasTester } from "../src/lib/platform/connections/testers";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { ENV } from "../src/lib/platform/connections/resolve";
import { ENV_CLASSES } from "../src/lib/platform/portability/env-classes";
import { join } from "node:path";

// Coverage of the platform-default ledger (docs/platform-defaults.md). Pure. Run: npm run test:platform-defaults
let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const platformKeys = Object.values(INTEGRATION_DEFAULTS).flatMap((d) => (d.status === "platform" ? d.keys : []));

T("every company Integrations provider is accounted for exactly once, with no stale entry", () => {
  assert.deepEqual(Object.keys(INTEGRATION_DEFAULTS).sort(), CONNECTION_PROVIDERS.map((p) => p.key).sort());
});
T("every company-only and gap entry says why", () => {
  for (const [k, d] of Object.entries(INTEGRATION_DEFAULTS)) {
    if (d.status === "company-only") assert.ok(d.reason.length > 20, k);
    if (d.status === "gap") assert.ok(d.missing.length > 20, k);
  }
});
T("every provider the resolver can serve from the platform has a platform default entry", () => {
  for (const k of PLATFORM_FALLBACK) assert.equal(INTEGRATION_DEFAULTS[k]?.status, "platform", k);
});
T("money and publishing identities never have a platform default for companies", () => {
  for (const k of ["razorpay", "meta", "google", "linkedin", "x"]) assert.equal(INTEGRATION_DEFAULTS[k].status, "company-only", k);
});
T("every Console server key belongs to exactly one place: one provider's default or one platform-only purpose", () => {
  for (const key of Object.keys(CONFIG_FIELDS)) {
    const n = platformKeys.filter((k) => k === key).length + (key in PLATFORM_ONLY_KEYS ? 1 : 0);
    assert.equal(n, 1, `${key} is accounted for ${n} times`);
  }
  for (const key of [...platformKeys.filter((k) => !k.includes(":")), ...Object.keys(PLATFORM_ONLY_KEYS)]) assert.ok(key in CONFIG_FIELDS, `${key} is not a Console server key`);
});
T("Console cards: one per company card plus the platform's own; every Console server key is edited in exactly one panel", () => {
  const keys = PLATFORM_CARDS.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const p of CONNECTION_PROVIDERS) assert.ok(keys.includes(p.key), `no Console card for ${p.key}`);
  const edited = PLATFORM_CARDS.flatMap((c) => c.panel.keys ?? []);
  assert.deepEqual([...edited].sort(), Object.keys(CONFIG_FIELDS).sort(), "each key in exactly one panel, none missing");
  for (const form of ["email", "domains", "previousProject", "blobMigration"] as const) assert.equal(PLATFORM_CARDS.filter((c) => c.panel[form]).length, 1, `${form} appears once`);
});
T("company-only and not-available cards have a reason and nothing to edit or test", () => {
  for (const c of PLATFORM_CARDS.filter((x) => x.kind === "company-only" || x.kind === "not-available")) {
    assert.ok((c.note ?? "").length > 20, c.key);
    assert.deepEqual(c.panel, {}, c.key);
    assert.equal(c.tester, undefined, c.key);
    assert.equal(consoleCardData(c, { configured: true }).status, c.kind === "company-only" ? "company_only" : "not_set_up");
  }
});
T("every card sits in a category; testable cards have a real tester; the impact line is plain", () => {
  for (const c of PLATFORM_CARDS) { assert.ok(CONSOLE_CATEGORIES.some((x) => x.key === c.category), c.key); if (c.tester) assert.ok(hasTester(c.tester), c.tester); }
  assert.equal(usageLine({ usingDefault: 1, usingOwn: 2 }), "1 company uses this default, 2 use their own");
});
T("static: the Console page has no second form, old anchors are gone, saving and testing need the manage permission, tests are rate limited and audited", () => {
  const page = readFileSync("src/app/(platform)/console/integrations/page.tsx", "utf8");
  assert.match(page, /requirePlatformPermission\("integrations\.read"\)/);
  assert.ok(!/<ServerKeysForm[^>]*canManage=\{canManage\} \/>/.test(page), "the key form is only ever rendered for one card's keys");
  const actions = readFileSync("src/app/(platform)/console/integrations/actions.ts", "utf8");
  assert.match(actions, /testPlatformDefaultAction[\s\S]*?requirePlatformPermission\("integrations\.manage"\)[\s\S]*?rateLimit\(/);
  assert.match(readFileSync("src/lib/platform/defaults/console.ts", "utf8"), /recordPlatformAudit/);
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  assert.deepEqual(walk("src").filter((f) => /\.tsx?$/.test(f) && /console\/integrations#/.test(readFileSync(f, "utf8"))), []);
});
T("India DLT: the platform SMS registration is read only by the sign-in code sender, the one SMS path", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const readers = walk("src").filter((f) => /\.tsx?$/.test(f) && /DLT_(ENTITY|TEMPLATE|SENDER)_ID/.test(readFileSync(f, "utf8")) && !/config\/registry|defaults\/|portability/.test(f));
  assert.deepEqual(readers, ["src/lib/security/sms-otp.ts"]);
});
T("card fields: every required field of a platform-served service can be filled from the Console, and every such key is on that service's card", () => {
  for (const key of PLATFORM_FALLBACK) {
    const provider = CONNECTION_PROVIDERS.find((p) => p.key === key)!;
    for (const f of provider.fields.filter((x) => x.required)) {
      const names = ENV[key]?.[f.key] ?? [];
      assert.ok(names.length > 0, `${key}.${f.key} has no platform source`);
      assert.ok(names.some((n) => platformCard(key)!.panel.keys?.includes(n)), `${key}.${f.key} (${names.join("/")}) is not on the ${key} card`);
    }
  }
});
T("environment variables: every Console key that may still come from the environment is classified in the portability table or is a Console-only key", () => {
  const source = readFileSync("src/lib/platform/portability/env-classes.ts", "utf8");
  assert.match(source, /registry keys are added at run time/);
  for (const names of Object.values(ENV)) for (const n of Object.values(names).flat()) assert.ok(n in CONFIG_FIELDS || n in ENV_CLASSES || /^(GOOGLE_INDEXING_|TWILIO_SMS_FROM|META_|GOOGLE_OAUTH_|LINKEDIN_)/.test(n), `${n} is read for a connection but is neither a Console key nor classified`);
});
const count = (s: string) => Object.values(INTEGRATION_DEFAULTS).filter((d) => d.status === s).length;
console.log(`    platform default: ${count("platform")}, company only: ${count("company-only")}, gaps: ${count("gap")}`);
console.log(`\n${passed} passed`);
process.exit(0);
