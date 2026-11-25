import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getPlatformDb, clientPromise } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { isKeyedCollection } from "../src/lib/platform/tenancy/collections";
import { getDb } from "../src/lib/mongodb";
import { PRODUCT_SPECS } from "../src/lib/platform/defaults/product/specs";
import { allSettings, companyPatch, docName, docQuery, getPath, parseSetting, withPath, type SettingDef, type SettingsDoc } from "../src/lib/platform/defaults/product/model";
import { platformDefaults, savePlatformDefaults, settingUsage } from "../src/lib/platform/defaults/product/store";
import { companySettingStates, resetCompanySetting } from "../src/lib/platform/defaults/product/company";
import { productDefaultsMigration } from "../src/lib/platform/defaults/product/migration";
import { NO_DEFAULT_CARDS, PRODUCT_DEFAULT_CATEGORIES, productDefaultCards } from "../src/lib/platform/defaults/product/console-cards";
import { PRODUCT_SETTINGS, COMPANY_OWNED } from "../src/lib/platform/settings-schema";
import { getOrgSettings, updateOrgSettings } from "../src/lib/products/talentos/settings";
import { getPayrollConfig, updatePayrollConfig } from "../src/lib/products/talentos/payroll-config";
import { getPaymentControls, savePaymentControls } from "../src/lib/products/cashflow-ai/payment-controls";
import { getTaxConfig, updateTaxConfig } from "../src/lib/products/cashflow-ai/tax-config";
import { getPrmsSettings, updatePrmsSettings } from "../src/lib/products/spendiq/settings";
import { getPmsSettings, updatePmsSettings } from "../src/lib/products/sprintos/settings";
import { getTmsSettings, updateTmsSettings } from "../src/lib/products/cohort-ai/settings";
import { getPbSettings, savePbSettings } from "../src/lib/products/playbook-ai/pb-settings";
import { getSettings as getSopSettings, updateSettings as updateSopSettings } from "../src/lib/products/playbook-ai/settings";
import { getSettings as getBotSettings, saveSettings as saveBotSettings } from "../src/lib/products/agentos/settings";
import { getCallSettings, getPublicCallSettings, saveCallSettings, savePublicCallSettings } from "../src/lib/products/agentos/calls/settings";
import { getOtsSettings, saveOtsSettings } from "../src/lib/products/evaliq/settings";
import { getSettings as getSmmsSettings, saveAi } from "../src/lib/products/viralpulse-ai/settings";
import { getImageSettings, saveImageSettings } from "../src/lib/products/viralpulse-ai/images/store";
import { getUgcSettings, saveUgcSettings } from "../src/lib/products/viralpulse-ai/ugc/store";
import { getPublishSettings, savePublishSettings } from "../src/lib/products/viralpulse-ai/publishers/publish-settings";
import { legacyToAccess } from "../src/lib/access/adapter";
import { getMetricsSettings, saveMetricsSettings } from "../src/lib/products/viralpulse-ai/metrics/store";
import { getSettings as getSeoSettings, saveSettings as saveSeoSettings } from "../src/lib/products/rankmax-ai/settings";
import { getSettings as getVaultSettings, saveSettings as saveVaultSettings } from "../src/lib/products/cybervault/settings";

// Product settings defaults: company own > platform default > code default. Static checks, then two companies on a throwaway database.
let passed = 0;
const T = async (name: string, fn: () => Promise<void> | void) => { await fn(); passed++; console.log("  ✓", name); };

/**
 * How each stored document is read and saved by its product, and the only modules allowed to touch it. `alias` is the way product code names the
 * collection through a constant: any other file of the product using it must be listed in MAY_NAME with the reason.
 */
type Io = { modules: string[]; alias?: { from: string; use: RegExp }; read: () => Promise<object>; save: (data: never) => Promise<unknown> };
const ai = "src/lib/products/viralpulse-ai/settings.ts", images = "src/lib/products/viralpulse-ai/images/store.ts", ugc = "src/lib/products/viralpulse-ai/ugc/store.ts";
const roles = ["super_admin"];
/** A Director, as the AgentOS and Playbook save functions expect one. */
const viewer = (): never => ({ id: "u1", userId: "u1", email: "u@x.test", name: "U", roles, ctx: { roles }, subject: legacyToAccess({ roles, permissionOverrides: null }), seesAll: true }) as never;
const IO: Record<string, Io> = {
  hrms_settings: { modules: ["src/lib/products/talentos/settings.ts"], alias: { from: "talentos/settings", use: /\bSETTINGS_COLLECTION\b/ }, read: getOrgSettings, save: (d) => updateOrgSettings(d, "u1") },
  hrms_payroll_config: { modules: ["src/lib/products/talentos/payroll-config.ts"], alias: { from: "talentos/payroll-config", use: /\bPAYROLL_CONFIG_COLLECTION\b/ }, read: getPayrollConfig, save: (d) => updatePayrollConfig(d, "u1") },
  fms_payment_controls: { modules: ["src/lib/products/cashflow-ai/payment-controls.ts"], read: getPaymentControls, save: (d) => savePaymentControls(d, "u1") },
  fms_tax_config: { modules: ["src/lib/products/cashflow-ai/tax-config.ts"], alias: { from: "cashflow-ai/tax-config", use: /\bTAX_CONFIG_COLLECTION\b/ }, read: getTaxConfig, save: (d: { rates: never }) => updateTaxConfig(d.rates, "u1") },
  prms_settings: { modules: ["src/lib/products/spendiq/settings.ts"], alias: { from: "spendiq/settings", use: /\bPRMS_SETTINGS_COLLECTION\b/ }, read: getPrmsSettings, save: (d) => updatePrmsSettings(d, "u1") },
  pms_settings: { modules: ["src/lib/products/sprintos/settings.ts"], alias: { from: "sprintos/settings", use: /\bPMS_SETTINGS_COLLECTION\b/ }, read: getPmsSettings, save: (d) => updatePmsSettings(d, "u1") },
  training_settings: { modules: ["src/lib/products/cohort-ai/settings.ts"], alias: { from: "cohort-ai/settings", use: /\bTMS_SETTINGS_COLLECTION\b/ }, read: getTmsSettings, save: (d) => updateTmsSettings(d, "u1") },
  pb_settings: { modules: ["src/lib/products/playbook-ai/pb-settings.ts"], alias: { from: "playbook-ai/pb-collections", use: /PB_COLLECTIONS\.settings\b/ }, read: getPbSettings, save: async (d) => assert.ok((await savePbSettings(viewer(), d)).ok) },
  sop_settings: { modules: ["src/lib/products/playbook-ai/settings.ts"], alias: { from: "playbook-ai/db", use: /\bCOLLECTIONS\.settings\b/ }, read: getSopSettings, save: (d) => updateSopSettings(d, "u1") },
  aibots_settings: { modules: ["src/lib/products/agentos/settings.ts"], alias: { from: "agentos/db", use: /\bCOLLECTIONS\.settings\b/ }, read: getBotSettings, save: (d) => saveBotSettings(d, "u1") },
  agentos_call_settings: {
    modules: ["src/lib/products/agentos/calls/settings.ts"], alias: { from: "agentos/calls/", use: /CALL_COLLECTIONS\.settings\b|\bsettingsCollection\(/ },
    read: async () => ({ ...(await getCallSettings()), ...(await getPublicCallSettings()) }),
    save: async (d) => { await saveCallSettings(viewer(), d); await savePublicCallSettings(viewer(), d); },
  },
  ots_settings: { modules: ["src/lib/products/evaliq/settings.ts"], alias: { from: "evaliq/db", use: /\bCOLLECTIONS\.settings\b/ }, read: getOtsSettings, save: (d) => saveOtsSettings(d, "u1") },
  smms_settings: {
    modules: [ai, images, ugc], alias: { from: "viralpulse-ai/db", use: /\bCOLLECTIONS\.settings\b/ },
    read: async () => ({ ai: (await getSmmsSettings()).ai, images: await getImageSettings(), ugc: await getUgcSettings() }),
    save: async (d: { ai: never; images: never; ugc: never }) => { await saveAi(d.ai, "u1"); await saveImageSettings(d.images, "u1"); await saveUgcSettings(d.ugc, "u1"); },
  },
  "smms_settings:publishing": { modules: ["src/lib/products/viralpulse-ai/publishers/publish-settings.ts"], alias: { from: "viralpulse-ai/db", use: /\bCOLLECTIONS\.settings\b/ }, read: getPublishSettings, save: (d) => savePublishSettings(d, "u1") },
  smms_metric_settings: { modules: ["src/lib/products/viralpulse-ai/metrics/store.ts"], alias: { from: "viralpulse-ai/metrics/store", use: /\bSETTINGS_COLLECTION\b/ }, read: getMetricsSettings, save: (d) => saveMetricsSettings(d, "u1") },
  seo_settings: { modules: ["src/lib/products/rankmax-ai/settings.ts"], alias: { from: "rankmax-ai/db", use: /\bCOLLECTIONS\.settings\b/ }, read: getSeoSettings, save: (d) => saveSeoSettings(d, "u1") },
  dlms_settings: { modules: ["src/lib/products/cybervault/settings.ts"], alias: { from: "cybervault/db", use: /\bCOLLECTIONS\.settings\b/ }, read: getVaultSettings, save: (d) => saveVaultSettings(d, "u1") },
};
/** Files that may name a settings collection without reading the default-able values, and why. */
const MAY_NAME: Record<string, string> = {
  "src/lib/platform/tenancy/collections.ts": "tenancy classification",
  "src/lib/platform/setup-progress/gather.ts": "only whether a person saved (updatedBy)",
  "src/lib/platform/defaults/product/specs.ts": "the registry itself",
  "src/lib/platform/company-identity/index.ts": "the old identity blocks, which are never defaults",
  "src/lib/platform/company-identity/migration.ts": "a comment about the identity blocks",
  "src/lib/products/viralpulse-ai/ads-platforms/guard.ts": "its own document (ad spend guard): company only, never defaulted",
  "src/lib/products/viralpulse-ai/dashboard.ts": "only whether the publishing document exists",
  "src/lib/products/viralpulse-ai/lease.ts": "its own lock documents",
  "src/lib/products/rankmax-ai/public.ts": "the robots.txt document",
  "src/lib/products/rankmax-ai/robots-store.ts": "the robots.txt document",
  "src/lib/products/rankmax-ai/crawler.ts": "its own lock documents",
};
/** The `db.ts` / collection-list files that only declare the names. */
const DECLARES = /(\/db|pb-collections|calls\/types|calls\/store)\.ts$|\/SPEC\.md$/;

/** Two values of a setting that differ from the built-in one and from each other, valid together with the others. */
const SPECIAL: Record<string, [unknown, unknown]> = {
  shiftStart: ["08:00", "10:00"], shiftEnd: ["17:00", "19:00"], halfDayHours: [3, 5], fullDayHours: [7, 9], workingDays: [[1, 2, 3], [1, 2, 3, 4, 5, 6]], saturdayOffs: [[2, 4], [1]],
  perPayoutMax: [800_000, 900_000], dailyMax: [3_000_000, 4_000_000], approvalThreshold: [50_000, 60_000], certificateNumberFormat: ["P-{n}", "OWN-{yyyy}-{n}"],
  "ai.temperature": [0.3, 1.2], windowStart: ["08:00", "10:00"], windowEnd: ["18:00", "20:00"], "thresholds.titleMin": [31, 32], "thresholds.titleMax": [61, 62], "thresholds.descriptionMin": [71, 72], "thresholds.descriptionMax": [161, 162],
};
function two(s: SettingDef): [unknown, unknown] {
  if (SPECIAL[s.key]) return SPECIAL[s.key];
  if (s.type === "boolean") return [!s.builtIn, !!s.builtIn];
  if (s.type === "integer" || s.type === "number") { const b = Number(s.builtIn); return b + 2 <= s.max! ? [b + 1, b + 2] : [b - 1, b - 2]; }
  if (s.type === "select") { const o = s.options!.map((x) => x.value).filter((v) => v !== s.builtIn); return [o[0], o[1] ?? String(s.builtIn)]; }
  if (s.type === "list") return [["Platform one", "Platform two"], ["Own one"]];
  if (s.type === "rates") return [[{ id: "std-p", name: "P", ratePercent: 3, isActive: true }], [{ id: "std-o", name: "O", ratePercent: 4, isActive: true }]];
  return s.key.startsWith("ai.") ? ["gpt-platform", "gpt-own"] : ["platform text {n}", "own text {n}"];
}

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

(async () => {
  console.log("static");
  const docs: [string, SettingsDoc][] = PRODUCT_SPECS.flatMap((p) => p.docs.map((d) => [p.key, d] as [string, SettingsDoc]));
  await T("every registered setting is valid, unique in its product, keyed per company, in a real settings category", () => {
    for (const p of PRODUCT_SPECS) {
      const keys = allSettings(p).map((s) => s.key);
      assert.equal(new Set(keys).size, keys.length, p.key);
      assert.ok(PRODUCT_DEFAULT_CATEGORIES.some((c) => c.key === p.category), p.key);
      for (const s of allSettings(p)) {
        const parsed = parseSetting(s, s.builtIn);
        assert.ok(parsed.ok, `${p.key}.${s.key}: built-in value is invalid: ${!parsed.ok && parsed.error}`);
      }
      assert.equal(p.check?.(Object.fromEntries(allSettings(p).map((s) => [s.key, s.builtIn]))) ?? null, null, p.key);
      assert.ok(!NO_DEFAULT_CARDS.some((c) => c.key === p.key), `${p.key} is listed twice`);
    }
    for (const [, d] of docs) { assert.ok(IO[docName(d)], `${docName(d)} has no runtime test entry`); assert.ok(isKeyedCollection(d.collection) || d.filter, d.collection); }
    for (const p of PRODUCT_SPECS) assert.equal(new Set(p.docs.map(docName)).size, p.docs.length, p.key);
    const cards = productDefaultCards({}, {});
    assert.equal(new Set(cards.map((c) => c.key)).size, cards.length);
  });
  await T("company identity, signatories, bank accounts, keys, registrations and statutory policy can never be a platform default", () => {
    const owned = new Set(COMPANY_OWNED.flatMap((o) => o.fields));
    const never = ["signatoryName", "signatoryTitle", "signatoryDesignation", "company", "institute", "salaryAccountId", "pfRegistered", "esiRegistered", "ptRegistered", "lwfRegistered", "wageDefinition", "pfDefaultMode", "statutoryBonusEnabled", "statutoryBonusPercent", "minimumWage", "gratuityCovered", "includeGratuityProvision", "leaveEncashmentDaysInMonth", "tdsEnabled", "defaultTaxRegime", "noPanRule", "proofCutoffMonth", "deductionCapPercent", "financialYearStartMonth", "state", "timezone", "requireCode", "requireSeparateApprover", "pan", "gstin", "payslipNote"];
    for (const [product, d] of docs) for (const s of d.settings) {
      const head = s.key.split(".")[0];
      assert.ok(!owned.has(head) && !never.includes(head), `${product}.${s.key} must not be defaultable`);
      const types = (PRODUCT_SETTINGS[product] ?? []).filter((x) => IO[docName(d)].modules.includes(x.file));
      if (types.length && !["images", "ugc"].includes(head)) assert.ok(types.some((t) => t.fields.includes(head)), `${product}.${s.key} is not in the settings schema`);
    }
  });
  await T("a converted settings document is read only by its settings module, and that module reads through the resolver", () => {
    const files = walk("src").filter((f) => /\.tsx?$/.test(f)).map((f) => [f, readFileSync(f, "utf8")] as const);
    for (const [product, d] of docs) {
      const io = IO[docName(d)];
      for (const file of io.modules) {
        const source = readFileSync(file, "utf8");
        assert.ok(source.includes(`resolveSettings("${product}",`), `${file} must resolve through resolveSettings`);
        assert.ok(source.includes(`settingsPatch("${product}",`), `${file} must save through settingsPatch`);
        assert.ok(!/\$setOnInsert: (doc|\{ _id: [A-Z_]+, \.\.\.)/.test(source), `${file} must not write defaults by reading`);
      }
      const allowed = new Set(docs.filter(([, x]) => x.collection === d.collection).flatMap(([, x]) => IO[docName(x)].modules));
      const others = files.filter(([f, s]) => !allowed.has(f) && !MAY_NAME[f] && !DECLARES.test(f) && (s.includes(`"${d.collection}"`) || (io.alias && s.includes(`@/lib/products/${io.alias.from}`) && io.alias.use.test(s)))).map(([f]) => f);
      assert.deepEqual(others, [], `${d.collection} is reached outside the resolver`);
    }
  });
  await T("the company screen of every converted product shows the defaults list once; saving and resetting are guarded", () => {
    const screens = walk("src/app/(products)/commandos/(protected)/settings/products").filter((f) => f.endsWith("Screen.tsx")).map((f) => readFileSync(f, "utf8"));
    for (const p of PRODUCT_SPECS) assert.equal(screens.join("\n").split(`<ProductDefaults product="${p.key}" />`).length - 1, 1, p.key);
    assert.match(readFileSync("src/app/(products)/commandos/(protected)/settings/products/defaults-actions.ts", "utf8"), /requireWorkspaceAction\("company\.products"\)/);
    assert.match(readFileSync("src/app/(platform)/console/product-settings/actions.ts", "utf8"), /requirePlatformPermission\("defaults\.manage"\)/);
    assert.match(readFileSync("src/app/(platform)/console/product-settings/page.tsx", "utf8"), /requirePlatformPermission\("defaults\.read"\)/);
  });
  await T("saving a form stores only what differs from the shown default; nested paths work", () => {
    const d: SettingsDoc = { collection: "x", docId: "main", title: "x", settings: [{ key: "a.b", label: "b", type: "integer", builtIn: 1 }, { key: "c", label: "c", type: "integer", builtIn: 2 }] };
    const inherited = { a: { b: 1, z: 0 }, c: 2 };
    assert.deepEqual(companyPatch(d, null, { a: { b: 1, z: 5 }, c: 2, other: 1 }, inherited), { "a.z": 5, other: 1 });
    assert.deepEqual(companyPatch(d, null, { a: { b: 7, z: 5 }, c: 2 }, inherited), { "a.b": 7, "a.z": 5 });
    assert.deepEqual(companyPatch(d, { c: 2 }, { c: 2 }, inherited), { c: 2 }, "an own value stays own");
    assert.deepEqual(withPath({ a: { z: 1 } }, "a.b", 2), { a: { z: 1, b: 2 } });
  });

  console.log("runtime");
  const db = await getPlatformDb();
  assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await db.dropDatabase();
  const now = new Date();
  const A = randomUUID(), B = randomUUID();
  await db.collection("companies").insertMany([[A, "a"], [B, "b"]].map(([id, slug]) => ({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now })));
  const as = <X,>(id: string, fn: () => Promise<X>) => runAsCompany(id, fn);
  const raw = (id: string, d: SettingsDoc) => as(id, async () => (await getDb()).collection<{ _id: string }>(d.collection).findOne(docQuery(d) as never));

  for (const spec of PRODUCT_SPECS) {
    await T(`${spec.key}: no platform default means the built-in values, and reading writes nothing`, async () => {
      for (const d of spec.docs) {
        const read = await as(A, IO[docName(d)].read);
        for (const s of d.settings) assert.deepEqual(getPath(read, s.key), s.builtIn, `${spec.key}.${s.key}`);
        assert.equal(await raw(A, d), null);
      }
    });
    await T(`${spec.key}: the platform default reaches a company without its own; a saved own value wins; reset returns to the default`, async () => {
      const platform = Object.fromEntries(allSettings(spec).map((s) => [s.key, two(s)[0]]));
      const saved = await savePlatformDefaults(spec.key, platform, "staff1");
      assert.ok(saved.ok, JSON.stringify(saved));
      for (const d of spec.docs) {
        const io = IO[docName(d)];
        for (const s of d.settings) assert.deepEqual(getPath(await as(A, io.read), s.key), two(s)[0], `${s.key} platform`);
        // B saves its form unchanged: nothing is frozen.
        await as(B, async () => io.save((await io.read()) as never));
        for (const s of d.settings) assert.equal(getPath(await raw(B, d), s.key), undefined, `${s.key} frozen by an unchanged save`);
        // B changes every setting: its own wins, A is untouched.
        await as(B, async () => io.save(d.settings.reduce((o, s) => withPath(o, s.key, two(s)[1]), await io.read()) as never));
        for (const s of d.settings) {
          assert.deepEqual(getPath(await as(B, io.read), s.key), two(s)[1], `${s.key} own`);
          assert.deepEqual(getPath(await as(A, io.read), s.key), two(s)[0], `${s.key} other company`);
        }
      }
      const usage = await settingUsage(spec);
      assert.deepEqual(usage.product, { usingOwn: 1, usingDefault: 1 });
      for (const u of Object.values(usage.settings)) assert.deepEqual(u, { usingOwn: 1, usingDefault: 1 });
      assert.ok((await as(B, () => companySettingStates(spec.key))).every((s) => s.source === "own"));
      assert.ok((await as(A, () => companySettingStates(spec.key))).every((s) => s.source === "platform"));
      const first = spec.docs[0].settings[0];
      assert.deepEqual(await as(B, () => resetCompanySetting(spec.key, first.key, "u2")), { ok: true });
      assert.deepEqual(getPath(await as(B, IO[docName(spec.docs[0])].read), first.key), two(first)[0], "reset follows the platform");
      assert.equal((await as(B, () => companySettingStates(spec.key))).find((s) => s.key === first.key)!.source, "platform");
      assert.equal((await as(B, () => resetCompanySetting(spec.key, "salaryAccountId", "u2"))).ok, false);
      // Removing the platform default returns the follower to the built-in value and leaves the own values.
      assert.ok((await savePlatformDefaults(spec.key, {}, "staff1")).ok);
      for (const d of spec.docs) for (const s of d.settings) assert.deepEqual(getPath(await as(A, IO[docName(d)].read), s.key), s.builtIn);
      assert.deepEqual(await platformDefaults(spec.key), {});
    });
  }
  await T("every number the platform may set is one the product's own save accepts unchanged (the two ranges agree)", async () => {
    const wrong: string[] = [];
    for (const spec of PRODUCT_SPECS) {
      for (const d of spec.docs) {
        const io = IO[docName(d)];
        for (const s of d.settings.filter((x) => x.type === "integer" || x.type === "number")) {
          for (const edge of [s.min!, s.max!]) {
            if (!(await savePlatformDefaults(spec.key, { [s.key]: edge }, "staff1")).ok) continue; // refused by a rule across fields
            const C = randomUUID();
            await db.collection("companies").insertOne({ _id: C as never, slug: C, name: "c", status: "suspended", isPlatformOwner: false, createdAt: now, updatedAt: now });
            try {
              await as(C, async () => io.save((await io.read()) as never));
              const stored = getPath(await raw(C, d), s.key);
              if (stored !== undefined) wrong.push(`${spec.key}.${s.key}=${edge} saved as ${stored}`);
            } catch (e) {
              wrong.push(`${spec.key}.${s.key}=${edge}: ${(e as Error).message}`);
            }
          }
        }
      }
      assert.ok((await savePlatformDefaults(spec.key, {}, "staff1")).ok);
    }
    assert.deepEqual(wrong, []);
  });
  await T("platform values are validated, unknown or excluded fields refused, changes audited", async () => {
    assert.equal((await savePlatformDefaults("talentos", { shiftStart: "25:00" }, "s")).ok, false);
    assert.equal((await savePlatformDefaults("talentos", { shiftStart: "20:00" }, "s")).ok, false, "cross-field rule");
    assert.equal((await savePlatformDefaults("talentos", { graceMinutes: 999 }, "s")).ok, false);
    assert.equal((await savePlatformDefaults("talentos", { wageDefinition: "flags" }, "s")).ok, false);
    assert.equal((await savePlatformDefaults("spendiq", { company: {} }, "s")).ok, false);
    assert.equal((await savePlatformDefaults("cashflow-ai", { dailyMax: 1000 }, "s")).ok, false);
    assert.equal((await savePlatformDefaults("nope", {}, "s")).ok, false);
    const audit = await db.collection("platform_audit_log").find({}).toArray();
    assert.ok(audit.some((a) => a.action === "settings.product_defaults.update") && audit.some((a) => a.action === "settings.product_default.reset" && a.companyId === B));
  });
  await T("migration: dry run writes nothing; apply changes no value; revert restores reset fields and removes its snapshot", async () => {
    const snapshot = async () => JSON.stringify(await Promise.all(docs.map(([, d]) => db.collection(d.collection).find({}, { sort: { _id: 1 } }).toArray())));
    const effective = async () => JSON.stringify(await Promise.all([A, B].flatMap((id) => docs.map(([, d]) => as(id, IO[docName(d)].read)))), (k, v) => (k === "updatedAt" ? undefined : v));
    const before = await snapshot();
    const values = await effective();
    const dry = await productDefaultsMigration("dry-run");
    assert.equal(await snapshot(), before);
    assert.ok(dry.some((r) => r.ownValues > 0) && dry.every((r) => r.written === 0));
    const applied = await productDefaultsMigration("apply");
    assert.ok(applied.reduce((n, r) => n + r.written, 0) > 0);
    assert.deepEqual(JSON.parse(await effective()), JSON.parse(values), "no value changes and the snapshot never reaches the product");
    assert.equal((await productDefaultsMigration("apply")).reduce((n, r) => n + r.written, 0), 0, "a second apply writes nothing");
    const d = PRODUCT_SPECS.find((p) => p.key === "sprintos")!.docs[0];
    await as(B, () => resetCompanySetting("sprintos", "technologySuggestions", "u2"));
    const reverted = await productDefaultsMigration("revert");
    assert.equal(reverted.reduce((n, r) => n + r.restored, 0), 1);
    assert.deepEqual(getPath(await raw(B, d), "technologySuggestions"), ["Own one"]);
    assert.ok(!(await snapshot()).includes("_defaultsBaseline"));
    assert.equal(await effective(), values);
  });
  await T("the migration command refuses a database that is not a throwaway one", () => {
    assert.throws(() => execFileSync("npx", ["--yes", "tsx", "--require", "./scripts/lib/next-server-shims.cjs", "scripts/migrate-product-defaults.ts", "--apply"], { env: { ...process.env, MONGODB_URI: "mongodb://127.0.0.1:1/production" }, stdio: "pipe" }), /Refusing to run/);
  });

  await db.dropDatabase();
  await (await clientPromise).close();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
