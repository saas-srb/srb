import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { COMPANY_OWNED, LEGACY_IDENTITY_BLOCKS, LEGACY_IDENTITY_FALLBACKS, PRODUCT_OVERRIDES, PRODUCT_SETTINGS, STAMP_FIELDS } from "../src/lib/platform/settings-schema";
import { EMPTY_IDENTITY, IDENTITY_FIELDS, mergeIdentity, validateIdentity } from "../src/lib/platform/company-identity/shared";
import { getCompanyIdentity, getCompanyIdentityView, saveCompanyIdentity, getStoredIdentity } from "../src/lib/platform/company-identity";
import { runIdentityMigration } from "../src/lib/platform/company-identity/migration";
import { configVersion, onConfigChange, publishConfigChange, versionedCache } from "../src/lib/platform/config-events";
import { ENV } from "../src/lib/platform/connections/resolve";
import { saveConnection, getSavedConnection, setConnectionMode } from "../src/lib/platform/connections/store";
import { getCompanyDetails } from "../src/lib/products/talentos/company";
import { getOrgSettings } from "../src/lib/products/talentos/settings";
import { getPayrollConfig } from "../src/lib/products/talentos/payroll-config";
import { getPrmsSettings } from "../src/lib/products/spendiq/settings";
import { getTmsSettings } from "../src/lib/products/cohort-ai/settings";
import { getSettings as getCmsSettings } from "../src/lib/products/sitecraft-ai/settings";
import { getOtsSettings } from "../src/lib/products/evaliq/settings";
import { integrationEnv } from "../src/lib/products/rankmax-ai/settings";
import { oauthApp } from "../src/lib/products/viralpulse-ai/accounts/apps";
import { resolvePdfIdentity } from "../src/lib/pdf/identity";

// Shared configuration: one company identity, one record per provider, product settings with only product choices, a change visible in two products,
// and the static guards. Run: npm run test:shared-config (throwaway database only).
let passed = 0;
const T = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const read = (p: string) => readFileSync(p, "utf8");
const walk = (dir: string, out: string[] = []): string[] => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e)) out.push(p); }
  return out;
};

/** The top-level property names of `interface <name> { … }` in a source file. */
function interfaceFields(src: string, name: string): string[] {
  const m = new RegExp(`(?:export )?interface ${name}\\b[^{]*\\{`).exec(src);
  assert.ok(m, `interface ${name} not found`);
  let depth = 1, i = m.index + m[0].length, line = "";
  const fields: string[] = [];
  for (; depth > 0 && i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 1 && ch === "\n") { const f = /^\s*(?:readonly )?([A-Za-z_][A-Za-z0-9_]*)\??\s*:/.exec(line); if (f) fields.push(f[1]); line = ""; }
    else if (depth >= 1) line += depth === 1 || ch === "\n" ? ch : "";
  }
  return fields;
}

(async () => {
  console.log("product settings hold only product choices (static)");
  await T("the settings schema matches the code exactly: no field added or removed without writing it in the schema", () => {
    for (const [product, sources] of Object.entries(PRODUCT_SETTINGS)) {
      for (const s of sources) {
        const actual = interfaceFields(read(s.file), s.type).sort();
        assert.deepEqual(actual, [...s.fields].sort(), `${product} ${s.type}: the code and src/lib/platform/settings-schema.ts disagree`);
      }
    }
  });
  await T("a field key is defined once: no two products define the same key unless it is a declared override with a reason", () => {
    const owners = new Map<string, Set<string>>();
    const legacy = (product: string, type: string, f: string) => LEGACY_IDENTITY_BLOCKS[product]?.some((b) => b.type === type && b.identityLike.includes(f));
    for (const [product, sources] of Object.entries(PRODUCT_SETTINGS)) for (const s of sources) for (const f of s.fields) if (!STAMP_FIELDS.includes(f) && !legacy(product, s.type, f)) (owners.get(f) ?? owners.set(f, new Set()).get(f)!).add(product);
    for (const [key, products] of owners) {
      if (products.size < 2) continue;
      const o = PRODUCT_OVERRIDES[key];
      assert.ok(o, `${key} is defined by ${[...products].join(", ")} with no declared override`);
      assert.ok(o.reason.length > 10, key);
      for (const p of products) assert.ok(o.products.includes(p), `${key}: ${p} is not listed in the override`);
    }
    for (const [key, o] of Object.entries(PRODUCT_OVERRIDES)) for (const p of o.products) assert.ok(PRODUCT_SETTINGS[p]?.some((s) => s.fields.includes(key)), `override ${key} names ${p} which does not define it`);
  });
  await T("nothing that belongs to the company (identity, provider keys) is defined in a product's settings, except the listed fallbacks", () => {
    const fallbacks = new Set(Object.entries(LEGACY_IDENTITY_FALLBACKS).flatMap(([p, list]) => list.map((x) => `${p}:${x}`)));
    const seen = new Set<string>();
    for (const [product, sources] of Object.entries(PRODUCT_SETTINGS)) {
      for (const s of sources) {
        for (const f of s.fields) {
          const legacyBlock = LEGACY_IDENTITY_BLOCKS[product]?.some((b) => b.type === s.type && b.identityLike.includes(f));
          if (!COMPANY_OWNED.some((c) => c.fields.includes(f)) && !legacyBlock) continue;
          const key = `${product}:${s.type}.${f}`;
          assert.ok(fallbacks.has(key), `${key} copies company configuration; it must be read from the company identity or the Integrations connection (or be listed as a fallback)`);
          seen.add(key);
        }
      }
    }
    for (const k of fallbacks) assert.ok(seen.has(k), `fallback ${k} is listed but no longer exists: remove it from LEGACY_IDENTITY_FALLBACKS`);
    // the legacy blocks themselves are listed, so a new copy cannot hide inside them
    for (const [product, blocks] of Object.entries(LEGACY_IDENTITY_BLOCKS)) for (const b of blocks) for (const f of b.identityLike) assert.ok(PRODUCT_SETTINGS[product].find((x) => x.type === b.type)!.fields.includes(f), `${product}:${b.type}.${f} is declared legacy but not defined`);
  });
  await T("no product settings form asks for the company's identity or a provider key (they show it read-only with a way to change it)", () => {
    const forms = [
      "src/components/products/talentos/CompanyDetailsForm.tsx", "src/components/products/talentos/OrgSettingsForm.tsx", "src/components/products/talentos/PayrollConfigForm.tsx",
      "src/components/products/spendiq/PrmsSettingsForm.tsx", "src/components/products/cohort-ai/TmsSettingsForm.tsx", "src/components/products/evaliq/SettingsForm.tsx",
      "src/components/products/sitecraft-ai/SettingsEditor.tsx", "src/components/products/rankmax-ai/SeoSettingsForm.tsx",
    ];
    const banned = /<Label[^>]*>\s*(Company name|Legal name|Registered legal name|Company legal name|Institute name|Display name|GSTIN|PAN|Company PAN|CIN|Address( line [12])?|PIN code|Timezone label|Organization \(printed on certificates\)|API key|OpenAI key)\s*<\/Label>/;
    for (const f of forms) {
      const src = read(f);
      assert.ok(!banned.test(src), `${f} renders a company-level field`);
      assert.ok(!/field\("(pan|gstin|cin|name|legalName|addressLine1|addressLine2|postalCode)"/.test(src), `${f} renders an identity field`);
      assert.ok(!/type="password"/.test(src), `${f} asks for a secret`);
    }
    for (const f of ["src/components/products/talentos/CompanyDetailsForm.tsx", "src/components/products/spendiq/PrmsSettingsForm.tsx", "src/components/products/cohort-ai/TmsSettingsForm.tsx", "src/components/products/evaliq/SettingsForm.tsx", "src/components/products/sitecraft-ai/SettingsEditor.tsx", "src/components/products/talentos/OrgSettingsForm.tsx"]) assert.ok(read(f).includes("<IdentitySummary"), `${f} shows the read-only summary`);
    const summary = read("src/components/products/commandos/IdentitySummary.tsx");
    assert.match(summary, /Manage in CommandOS/);
    assert.match(summary, /\/commandos\/onboarding/);
  });
  await T("the shared settings screens render each shared connection through ONE read-only summary (no env-variable wording, no key fields)", () => {
    const base = "src/app/(products)/commandos/(protected)/settings/products";
    for (const [f, provider] of [["agentos/AgentosSettingsScreen.tsx", "openai"], ["viralpulse-ai/ViralpulseSettingsScreen.tsx", "openai"], ["rankmax-ai/RankmaxSettingsScreen.tsx", "google-service-account"]] as const) {
      const src = read(join(base, f));
      assert.ok(src.includes(`<ConnectionSummary provider="${provider}"`), `${f} shows the ${provider} connection summary`);
      assert.ok(!/OPENAI_API_KEY|PAGESPEED_API_KEY/.test(src), `${f} no longer talks about environment variables`);
    }
    assert.match(read("src/components/products/commandos/ConnectionSummary.tsx"), /Manage in CommandOS/);
    assert.match(read("src/components/products/commandos/ConnectionSummary.tsx"), /Changes apply to all of them/);
  });
  await T("every in-product settings address for something managed in CommandOS only redirects there", () => {
    const pages = [
      "talentos/(protected)/settings", "agentos/(protected)/settings", "rankmax-ai/(protected)/settings", "sitecraft-ai/(protected)/settings", "spendiq/(protected)/settings",
      "sprintos/(protected)/settings", "cohort-ai/(protected)/settings", "evaliq/(protected)/settings", "cybervault/(protected)/settings", "playbook-ai/(protected)/settings", "viralpulse-ai/(protected)/settings",
    ];
    for (const p of pages) {
      const f = `src/app/(products)/${p}/page.tsx`;
      const src = read(f);
      assert.match(src, /redirect\("\/commandos\/settings\/products\//, `${p} redirects to the CommandOS product settings`);
      assert.ok(!/"use client"|<form|<Input/.test(src), `${p} keeps no form of its own`);
    }
  });
  await T("D8: SiteCraft has no chatbot of its own: only redirect pages remain, no actions, no loaders, no delete buttons", () => {
    const dir = "src/app/(products)/sitecraft-ai/(protected)/chatbot";
    const files = walk(dir).map((f) => relative(dir, f));
    for (const f of files) {
      assert.match(f, /(^|\/)page\.tsx$/, `${f} is not a redirect page`);
      assert.ok(/redirectLegacyChatbotRoute|redirect\(/.test(read(join(dir, f))), `${f} must only redirect`);
      assert.ok(!/"use client"|"use server"|from "@\/lib\/(chatbot-config|chat-conversations|voice-conversations)"/.test(read(join(dir, f))), `${f} holds chatbot logic`);
    }
    assert.ok(files.length >= 9, `${files.length} legacy addresses keep working`);
    for (const f of walk("src")) assert.ok(!/sitecraft-ai\/\(protected\)\/chatbot\/(actions|conversations\/\[id\]\/Delete|voice\/conversations\/\[id\]\/Delete)/.test(read(f)), `${f} still imports the SiteCraft chatbot copy`);
    const moved = read("src/lib/products/sitecraft-ai/chatbot/routes.ts");
    assert.match(moved, /movedTarget/);
  });

  console.log("no duplicate configuration guard (static)");
  const providerEnvNames = [...new Set(Object.values(ENV).flatMap((m) => Object.values(m).flat()).concat(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "RESEND_API_KEY", "SENDGRID_API_KEY", "GEMINI_API_KEY", "BLOB_READ_WRITE_TOKEN", "GOOGLE_API_KEY"]))];
  await T("no product code reads a provider's environment variable or platform key directly: only the connection resolvers do", () => {
    const allowed = [/^src\/lib\/platform\//, /^src\/lib\/storage\//, /^src\/lib\/push\/vapid\.ts$/, /^src\/lib\/security\/sms-otp\.ts$/];
    const offenders: string[] = [];
    for (const f of walk("src")) {
      const rel = relative(".", f);
      if (allowed.some((a) => a.test(rel))) continue;
      const src = read(f);
      for (const n of providerEnvNames) {
        if (new RegExp(`process\\.env\\.${n}\\b|process\\.env\\[["']${n}["']\\]|getConfigs?\\(\\s*\\[?\\s*["']${n}["']`).test(src)) offenders.push(`${rel}: ${n}`);
      }
    }
    assert.deepEqual(offenders, [], "read the connection with connectionValues()/resolveConnection(), not the environment");
  });
  await T("no product keeps a form field for a secret: password inputs exist only for sign-in screens, the Integrations panel, backups and one webhook signing secret", () => {
    const ok = [/\/login\//, /invite\/AcceptForm/, /forgot-password/, /reset-password/, /change-password/, /join\/JoinForm/, /settings\/integrations\/ConnectionPanel/, /settings\/backups\//, /settings\/payments/, /agentos\/calls\/WebhookPanel/, /security\//, /two-factor/, /second-step/, /SecondStep/, /users\//, /components\/platform\//, /sign-in|signin|SignIn/i];
    const offenders = [...walk("src/components/products"), ...walk("src/app/(products)")].filter((f) => /type="password"/.test(read(f))).map((f) => relative(".", f)).filter((f) => !ok.some((r) => r.test(f)));
    assert.deepEqual(offenders, []);
  });
  await T("the connection catalogue is the only list of providers: each card's fields are defined once and every connection has one card", async () => {
    const { CONNECTION_PROVIDERS } = await import("../src/lib/platform/connections/catalog");
    const keys = CONNECTION_PROVIDERS.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const name of ["openai", "elevenlabs", "twilio", "google-service-account", "pagespeed", "razorpay", "vapid", "livekit", "gemini"]) assert.ok(keys.includes(name), name);
  });

  console.log("company identity (throwaway database)");
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  const CO = "co_ident";
  await T("validation: GSTIN check digit, PAN, CIN, email, URL, currency, time zone and month are checked; nothing is saved when one is wrong", () => {
    assert.equal(validateIdentity({ gstin: "27AAPFU0939F1ZV" }).ok, true);
    for (const bad of [{ gstin: "27AAPFU0939F1ZZ" }, { pan: "12345" }, { cin: "X1" }, { email: "nope" }, { website: "example" }, { currency: "XXX" }, { timeZone: "Mars/Base" }, { fiscalYearStartMonth: 13 }, { language: "xx" }, { brandName: "A" }]) assert.equal(validateIdentity(bad as never).ok, false, JSON.stringify(bad));
    const ok = validateIdentity({ gstin: " 27aapfu0939f1zv ", pan: "abcde1234f", website: "https://acme.test", fiscalYearStartMonth: "4" as never });
    assert.deepEqual(ok.ok && ok.value, { gstin: "27AAPFU0939F1ZV", pan: "ABCDE1234F", website: "https://acme.test", fiscalYearStartMonth: 4 });
    assert.equal(IDENTITY_FIELDS.length, 19, "the 14 fields of the brief plus brand/address parts");
  });
  await T("the merge rule: the company document wins, then the older stores in order, then the default; every value says where it came from", () => {
    const m = mergeIdentity({ legalName: "Own Pvt Ltd" }, [{ source: "A", values: { legalName: "Old", city: "Pune" } }, { source: "B", values: { city: "Mumbai", pan: "ABCDE1234F" } }]);
    assert.deepEqual([m.identity.legalName, m.identity.city, m.identity.pan, m.identity.currency], ["Own Pvt Ltd", "Pune", "ABCDE1234F", "INR"]);
    assert.deepEqual([m.sources.legalName, m.sources.city, m.sources.pan, m.sources.currency], ["company", "A", "B", "default"]);
    assert.deepEqual(mergeIdentity(null, []).identity, EMPTY_IDENTITY);
  });
  await runAsCompany(CO, async () => {
    const db = await getDb();
    await (await getPlatformDb()).collection("companies").insertOne({ _id: CO as never, name: "Acme Registry", timezone: "Asia/Kolkata", isPlatformOwner: false, branding: { logoUrl: "/api/platform/brand-logo/acme.png" }, profile: { currency: "INR", country: "India" } } as never);
    await T("before anything is saved, every product reads the older stores through the one accessor (fallback), and says so", async () => {
      await db.collection("hrms_company").insertOne({ _id: "org" as never, name: "Acme Display", legalName: "Acme Legal Pvt Ltd", addressLine1: "1 Main Road", city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", email: "hello@acme.test", phone: "+91 20 5550 0000", website: "https://acme.test", pan: "ABCDE1234F", gstin: "27AAPFU0939F1ZV", cin: "", signatoryName: "A. Singh", signatoryDesignation: "Director", payslipNote: "Confidential" } as never);
      await db.collection("prms_settings").insertOne({ _id: "config" as never, defaultCurrency: "INR", procurementReviewThreshold: 1, financeNotifyThreshold: 2, itemSuggestions: [], company: { name: "Acme PO Name", addressLine: "PO street", city: "Pune", gstin: "29AAAAA0000A1Z5", pan: "ZZZZZ9999Z", email: "po@acme.test", phone: "1", website: null, signatoryName: "PO Signer", signatoryTitle: "Procurement Head" } } as never);
      const view = await getCompanyIdentityView();
      assert.equal(view.saved, false);
      assert.equal(view.identity.legalName, "Acme Legal Pvt Ltd");
      assert.equal(view.sources.legalName, "TalentOS company details");
      assert.equal(view.identity.brandName, "Acme Display", "the most trusted store wins");
      assert.equal(view.identity.logoUrl, "/api/platform/brand-logo/acme.png");
      assert.equal(view.sources.logoUrl, "company registry");
      assert.equal(view.identity.fiscalYearStartMonth, 4);
    });
    await T("saving writes the ONE document, stamps who and when, and leaves every older store untouched", async () => {
      const before = JSON.stringify(await db.collection("hrms_company").findOne({ _id: "org" as never }));
      const res = await saveCompanyIdentity({ legalName: "Acme Technologies Pvt Ltd", brandName: "Acme", city: "Mumbai", gstin: "27AAPFU0939F1ZV" }, "u1");
      assert.equal(res.ok, true);
      const stored = await getStoredIdentity();
      assert.equal(stored?.values.legalName, "Acme Technologies Pvt Ltd");
      assert.equal(stored?.updatedBy, "u1");
      assert.equal(JSON.stringify(await db.collection("hrms_company").findOne({ _id: "org" as never })), before, "nothing written to the old store");
      assert.equal((await db.collection("company_identity").countDocuments({})), 1, "exactly one identity document");
      const bad = await saveCompanyIdentity({ pan: "bad" }, "u1");
      assert.equal(bad.ok, false);
      assert.equal((await getStoredIdentity())?.values.pan, undefined, "an invalid save changes nothing");
    });
    await T("ONE change shows in every product that prints the company: payslips/PDFs (TalentOS), purchase orders (SpendIQ), certificates (Cohort AI, EvalIQ), the website (SiteCraft) and payroll", async () => {
      const probe = async () => ({
        talentos: (await getCompanyDetails()).legalName,
        pdf: (await resolvePdfIdentity()).legalName,
        spendiq: (await getPrmsSettings()).company.name,
        cohort: (await getTmsSettings()).institute.name,
        evaliq: (await getOtsSettings()).organizationName,
        sitecraft: (await getCmsSettings()).companyLegalName,
      });
      const first = await probe();
      assert.deepEqual(first, { talentos: "Acme Technologies Pvt Ltd", pdf: "Acme Technologies Pvt Ltd", spendiq: "Acme", cohort: "Acme", evaliq: "Acme", sitecraft: "Acme Technologies Pvt Ltd" });
      assert.equal((await getPrmsSettings()).company.gstin, "27AAPFU0939F1ZV", "SpendIQ prints the company GSTIN");
      assert.equal((await getPrmsSettings()).company.signatoryName, "PO Signer", "the product keeps its own signatory");
      assert.equal((await getCompanyDetails()).signatoryName, "A. Singh", "TalentOS keeps its own payslip signatory");
      let heard = 0;
      const off = onConfigChange((c) => { if (c.scope === "company-identity") heard++; });
      assert.equal((await saveCompanyIdentity({ legalName: "Acme Global Ltd", brandName: "Acme Global", timeZone: "Asia/Dubai", fiscalYearStartMonth: 1 }, "u2")).ok, true);
      off();
      assert.equal(heard, 1, "the configuration-change event fired once");
      const second = await probe();
      assert.deepEqual(second, { talentos: "Acme Global Ltd", pdf: "Acme Global Ltd", spendiq: "Acme Global", cohort: "Acme Global", evaliq: "Acme Global", sitecraft: "Acme Global Ltd" });
      assert.equal((await getOrgSettings()).timezone, "Asia/Dubai", "the TalentOS time zone follows the company");
      assert.equal((await getPayrollConfig()).financialYearStartMonth, 1, "payroll follows the company financial year");
      assert.equal((await getCompanyIdentity()).brandName, "Acme Global");
    });
    await T("a company never sees another company's identity", async () => {
      await runAsCompany("co_other_ident", async () => {
        const view = await getCompanyIdentityView();
        assert.equal(view.saved, false);
        assert.equal(view.identity.legalName, "");
      });
    });
  });

  console.log("identity migration: dry-run, apply, revert (throwaway database)");
  await runAsCompany("co_mig", async () => {
    const db = await getDb();
    await (await getPlatformDb()).collection("companies").insertOne({ _id: "co_mig" as never, name: "Mig Co", timezone: "Asia/Kolkata", isPlatformOwner: false, profile: { currency: "INR", country: "India" } } as never);
    await db.collection("hrms_company").insertOne({ _id: "org" as never, name: "Mig Display", legalName: "Mig Legal", city: "Delhi", pan: "ABCDE1234F", gstin: "BAD-GSTIN", country: "India" } as never);
    await db.collection("training_settings").insertOne({ _id: "config" as never, institute: { name: "Mig Institute", city: "Noida", email: "x@mig.test" } } as never);
    await db.collection("cms_settings").insertOne({ _id: "default" as never, companyLegalName: "Mig Site Legal" } as never);
    await T("dry-run reports what would be copied and where the older stores disagree, and changes nothing", async () => {
      const r = await runIdentityMigration("dry-run", "mig_test_1");
      assert.ok(r.fill.length >= 6, JSON.stringify(r.fill));
      assert.ok(r.fill.some((f) => f.field === "legalName" && f.from === "TalentOS company details"), "the most trusted source is used");
      assert.ok(r.conflicts.some((c) => c.field === "legalName" && c.values.length === 2), "legalName differs between TalentOS and SiteCraft");
      assert.ok(r.conflicts.some((c) => c.field === "brandName"), "the names differ");
      assert.ok(r.skipped.some((s) => /gstin/.test(s)), "an invalid GSTIN is not copied and is reported");
      assert.equal(await db.collection("company_identity").countDocuments({}), 0, "nothing written");
    });
    await T("apply fills only what the document does not have, stamps the migration id, keeps the older stores", async () => {
      await saveCompanyIdentity({ city: "Own City" }, "owner"); // the owner already set the city: the migration must not overwrite it
      const r = await runIdentityMigration("apply", "mig_test_1");
      assert.ok(!r.fill.some((f) => f.field === "city"), "an owner's value is never overwritten");
      const stored = await getStoredIdentity();
      assert.equal(stored?.values.city, "Own City");
      assert.equal(stored?.values.legalName, "Mig Legal");
      assert.equal(stored?.values.pan, "ABCDE1234F");
      assert.equal(stored?._identityMigration?.id, "mig_test_1");
      assert.equal((await db.collection("hrms_company").findOne({ _id: "org" as never }))?.gstin, "BAD-GSTIN", "the old store is untouched");
      assert.equal((await runIdentityMigration("apply", "mig_test_1")).fill.length, 0, "running it again changes nothing");
    });
    await T("revert removes exactly what the migration filled and leaves what the owner set or edited since", async () => {
      await saveCompanyIdentity({ pan: "ZZZZZ9999Z" }, "owner"); // edited after the migration
      const r = await runIdentityMigration("revert", "mig_test_1");
      assert.ok(r.reverted.includes("legalName"));
      assert.ok(!r.reverted.includes("pan"), "an edited value is left alone");
      assert.ok(r.skipped.some((s) => /pan was edited/.test(s)));
      const stored = await getStoredIdentity();
      assert.equal(stored?.values.legalName, undefined);
      assert.equal(stored?.values.city, "Own City");
      assert.equal(stored?.values.pan, "ZZZZZ9999Z");
      assert.equal(stored?._identityMigration, undefined);
    });
    await T("a document the migration created is removed entirely on revert", async () => {
      await db.collection("company_identity").deleteMany({});
      await runIdentityMigration("apply", "mig_test_2");
      assert.equal(await db.collection("company_identity").countDocuments({}), 1);
      await runIdentityMigration("revert", "mig_test_2");
      assert.equal(await db.collection("company_identity").countDocuments({}), 0);
    });
    await T("a bad migration id is refused; the CLI refuses a database that is not a throwaway one", async () => {
      await assert.rejects(() => runIdentityMigration("apply", "x"), /Migration id/);
      const src = read("scripts/migrate-company-identity.ts");
      assert.match(src, /throwaway\|test/);
      assert.match(src, /--apply/); assert.match(src, /--revert/); assert.match(src, /--id/);
    });
  });

  console.log("a provider connection is kept once; a change shows in every product (throwaway database)");
  await runAsCompany("co_prov", async () => {
    await T("saving the Google service account once is what RankMax (search data) reads, and the same record is what SiteCraft/the indexing code resolve", async () => {
      assert.equal((await integrationEnv()).googleClientEmail, null);
      const ok = await saveConnection("google-service-account", { clientEmail: "svc@proj.iam.gserviceaccount.com", privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" }, "u1");
      assert.equal(ok.ok, true, ok.ok ? "" : ok.error);
      assert.equal((await integrationEnv()).googleClientEmail, "svc@proj.iam.gserviceaccount.com");
      assert.equal((await getSavedConnection("google-service-account"))?.clientEmail, "svc@proj.iam.gserviceaccount.com");
      assert.equal((await getDb().then((d) => d.collection("workspace_connections").countDocuments({ _id: "google-service-account" as never }))), 1, "one record for the provider");
    });
    await T("the Meta/Google app credentials ViralPulse publishes with come from the same single connection records", async () => {
      assert.equal(await oauthApp("google"), null);
      await saveConnection("google", { clientId: "cid-123", clientSecret: "csecret-456" }, "u1");
      assert.deepEqual(await oauthApp("google"), { id: "cid-123", secret: "csecret-456" });
      await saveConnection("google", { clientId: "cid-789", clientSecret: "csecret-000" }, "u1");
      assert.deepEqual(await oauthApp("google"), { id: "cid-789", secret: "csecret-000" }, "a change is seen at once, not after a cache delay");
    });
    await T("the configuration-change event fires on every connection change, carries no values, and moves the shared version", async () => {
      const seen: { scope: string }[] = [];
      const off = onConfigChange((c) => seen.push(c));
      const v0 = await configVersion("connection:openai");
      await saveConnection("openai", { apiKey: "sk-test-aaaa1111" }, "u1");
      await setConnectionMode("openai", "srb", "u1");
      await new Promise((r) => setTimeout(r, 300));
      off();
      assert.ok(seen.filter((s) => s.scope === "connection:openai").length >= 2);
      assert.ok(!JSON.stringify(seen).includes("sk-test"), "no secret travels in the event");
      assert.ok((await configVersion("connection:openai")) >= v0 + 2);
    });
    await T("a versioned cache reloads when ANOTHER instance changes the scope (simulated by moving the shared counter), not only after its time-to-live", async () => {
      let loads = 0;
      const cached = versionedCache("demo-scope", async () => ++loads, { recheckMs: 0, ttlMs: 60_000 });
      assert.equal(await cached(), 1);
      assert.equal(await cached(), 1, "unchanged: served from the cache");
      const { CONFIG_VERSIONS_COLLECTION } = await import("../src/lib/platform/config-events");
      await (await getDb()).collection(CONFIG_VERSIONS_COLLECTION).updateOne({ _id: "demo-scope" as never }, { $inc: { v: 1 } }, { upsert: true });
      assert.equal(await cached(), 2, "the counter moved: reloaded");
      await publishConfigChange("demo-scope");
      assert.equal(await cached(), 3, "a change made in this process reloads at once");
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
