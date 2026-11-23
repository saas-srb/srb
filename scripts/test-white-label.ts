import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sourceFiles, readSrc, visibleHits, BRAND_WORDS } from "./lib/white-label-scan";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { DEFAULT_PANELS, whiteLabelProductName } from "../src/lib/platform/panels/types";
import { renderEmail } from "../src/lib/platform/email/template";
import { STATUS_LABEL, CARD_CATEGORIES } from "../src/lib/platform/connections/cards";
import { CONNECTION_PROVIDERS, GROUP_LABELS } from "../src/lib/platform/connections/catalog";
import { STEPS, NOT_PART_OF_SETUP } from "../src/lib/platform/setup-progress/registry";
import { PROMPTS } from "../src/lib/prompts/registry";

/**
 * WHITE LABEL guarantee: a customer company never sees the platform's name (SRB / SelfRun / selfrunbusiness) anywhere in its own workspace.
 *  1. Static: every user-visible string literal, template and JSX text in tenant-facing source is free of those words, except the allowlist below (each entry has a reason).
 *     Comments, identifiers, storage keys and crypto labels (lowercase `selfrun:` / `srb`) are not user-visible and are ignored by the scanner (scripts/lib/white-label-scan.ts).
 *  2. Runtime, with a fake tenant "Acme Pvt Ltd" on a throwaway database: product registry names, emails, sender, tab titles, app manifest, PDF letterhead identity,
 *     Integrations and Setup-progress copy, notification and AI-prompt defaults.
 * Run: npm run test:white-label
 */
const ALLOW: { match: RegExp; reason: string }[] = [
  { match: /^src\/app\/\(platform\)\/saas\//, reason: "The platform's own marketing site (/saas): its brand is the point." },
  { match: /^src\/components\/platform\/saas\//, reason: "Components of the platform's own marketing site." },
  { match: /^src\/lib\/platform\/saas\//, reason: "Marketing content, docs, FAQs, legal pages and the platform brand constants of the platform's own site. Nothing in it is imported by a tenant screen except through the platform-owner rule." },
  { match: /^src\/app\/\(platform\)\/console\//, reason: "The Platform Console is the platform owner's own tool." },
  { match: /^src\/app\/\(platform\)\/signup\//, reason: "The platform's own sign-up page, before any company exists." },
  { match: /^src\/lib\/pwa\/identity\.ts$/, reason: "The fixed identity of the platform's own app host (app.<platform domain>); a company's app uses its own brand (buildCompanyIdentity)." },
  { match: /^src\/app\/dev-editor-harness\//, reason: "Development-only harness pages (404 in production)." },
];
const allowed = (f: string) => ALLOW.find((a) => a.match.test(f));

let passed = 0;
const T = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const clean = (label: string, text: string) => assert.ok(!BRAND_WORDS.test(text) && !/selfrun|\bsrb\b/i.test(text), `${label} shows the platform's name: ${(/.{0,40}(selfrun|\bsrb\b).{0,40}/i.exec(text) ?? [""])[0]}`);

(async () => {
  console.log("static");
  await T("no tenant-facing source puts the platform's name in anything a person reads (outside the reasoned allowlist)", () => {
    const files = sourceFiles(["src"]);
    const bad = files.filter((f) => !allowed(f)).flatMap((f) => visibleHits(f, readSrc(f)));
    assert.deepEqual(bad.map((h) => `${h.file}:${h.line}: ${h.text}`), []);
    assert.ok(files.length > 1500);
  });
  await T("the allowlist is honest: every entry has a reason and still matches a file that needs it", () => {
    const files = sourceFiles(["src"]);
    for (const a of ALLOW) {
      assert.ok(a.reason.length > 20);
      const needs = files.some((f) => a.match.test(f) && (visibleHits(f, readSrc(f)).length > 0 || /\/saas\//.test(a.match.source)));
      assert.ok(needs, `${a.match} no longer needs an exception`);
    }
  });
  await T("the product registry carries plain product names (no brand prefix) and white-labelling strips any that were stored", () => {
    for (const p of DEFAULT_PANELS) { clean(`${p.key} name`, p.name + p.shortName + p.description + p.aliases.join(" ")); assert.ok(!/^\s/.test(p.name)); }
    assert.deepEqual(DEFAULT_PANELS.filter((p) => ["hrms", "pms", "lms", "fms", "prms", "tms", "workspace"].includes(p.key)).map((p) => p.name).sort(), ["CashFlow AI", "Cohort AI", "CommandOS", "DealFlow AI", "SpendIQ", "SprintOS", "TalentOS"]);
    assert.equal(whiteLabelProductName("SRB TalentOS"), "TalentOS");
    assert.equal(whiteLabelProductName("SelfRun AI Playbook"), "Playbook");
    assert.equal(whiteLabelProductName("SRB CommandOS"), "CommandOS");
  });
  await T("Integrations cards, categories, providers, Setup-progress steps and the AI prompt defaults carry no platform name", () => {
    clean("status labels", JSON.stringify(STATUS_LABEL));
    clean("card categories", JSON.stringify(CARD_CATEGORIES));
    clean("connection groups", JSON.stringify(GROUP_LABELS));
    clean("providers", JSON.stringify(CONNECTION_PROVIDERS));
    clean("setup steps", JSON.stringify(STEPS.map((s) => ({ ...s, check: undefined }))));
    clean("not part of setup", JSON.stringify(NOT_PART_OF_SETUP));
    const tenantPrompts = PROMPTS.filter((p) => p.companyEditable !== false);
    clean("prompts", JSON.stringify(PROMPTS.map((p) => [p.label, p.description, p.default])));
    assert.ok(tenantPrompts.length > 5);
  });
  await T("an email rendered for a company is signed with the company's name and has no 'Sent via' / 'Powered by' line", () => {
    const { html, text } = renderEmail({ brand: "Acme Pvt Ltd", heading: "Welcome", paragraphs: ["Hi Asha,", "Your account is ready."], action: { label: "Open", url: "https://acme-app.example.test/commandos" }, footnote: "Thanks." });
    clean("email html", html); clean("email text", text);
    assert.match(html, /Acme Pvt Ltd/);
    assert.ok(!/sent via|powered by/i.test(html + text));
  });

  console.log("a fake tenant on a throwaway database");
  const platform = await getPlatformDb();
  assert.ok(platform.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await platform.dropDatabase();
  const now = new Date();
  const ACME = randomUUID(), OWNER = randomUUID();
  const co = (id: string, slug: string, name: string, owner: boolean) => ({ _id: id as never, slug, name, status: "active", isPlatformOwner: owner, createdAt: now, updatedAt: now });
  await platform.collection("companies").insertMany([co(ACME, "acme", "Acme Pvt Ltd", false), co(OWNER, "platform", "Platform Owner Co", true)]);
  const { brandName, isPlatformBrandVisible, senderForTenant } = await import("../src/lib/platform/white-label");
  const { brandedMetadata } = await import("../src/lib/platform/branding/metadata");
  const { listPanels } = await import("../src/lib/platform/panels/store");
  const { buildCompanyIdentity } = await import("../src/lib/pwa/identity");
  const { resolvePdfIdentity } = await import("../src/lib/pdf/identity");

  await runAsCompany(ACME, async () => {
    // an old registry row that still carries the brand prefix, as stored by earlier versions
    await platform.collection("platform_panels").insertOne({ _id: "hrms" as never, key: "hrms", name: "SRB TalentOS", shortName: "TalentOS", description: "x", aliases: [], active: true, order: 10, core: false, icon: "users", route: "/talentos", connections: [], headerTitle: "", headerDescription: "" } as never).catch(() => {});
    await T("the platform's name is not visible here, and the company's own brand is what every accessor returns", async () => {
      assert.equal(await isPlatformBrandVisible(), false);
      assert.equal(await brandName(), "Acme Pvt Ltd");
    });
    await T("the Product Registry shows plain names to the tenant, even for a row stored with the old prefix", async () => {
      const panels = await listPanels();
      assert.ok(panels.length >= 15);
      for (const p of panels) clean(`registry ${p.key}`, `${p.name} ${p.shortName} ${p.description} ${p.aliases.join(" ")}`);
      assert.equal(panels.find((p) => p.key === "hrms")?.name, "TalentOS");
      assert.equal(panels.find((p) => p.key === "workspace")?.name, "CommandOS");
    });
    await T("the sender of the default address is the company's name, not the platform's", async () => {
      assert.equal(await senderForTenant("SelfRun AI <no-reply@platform.example>"), "Acme Pvt Ltd <no-reply@platform.example>");
    });
    await T("browser tab titles use the company's name", async () => {
      const m = await brandedMetadata("Attendance · {brand} Portal");
      assert.equal(String(m.title), "Attendance · Acme Pvt Ltd Portal");
      const p = await brandedMetadata("{panel:hrms} · {brand}");
      clean("tab title", String(p.title));
    });
    await T("the installable app (manifest name, short name, description, shortcuts) is the company's", async () => {
      const id = await buildCompanyIdentity();
      clean("manifest", JSON.stringify(id));
      assert.match(id.name, /Acme/);
    });
    await T("PDF letterhead identity (payslips, invoices, receipts, certificates, reports) is the company's", async () => {
      const id = await resolvePdfIdentity();
      clean("pdf identity", JSON.stringify({ ...id, logo: null }));
      assert.match(id.name, /Acme/);
    });
  });
  await runAsCompany(OWNER, async () => {
    await T("the platform owner's own workspace may show the platform's name (the single rule)", async () => {
      assert.equal(await isPlatformBrandVisible(), true);
      assert.equal(await senderForTenant("SelfRun AI <no-reply@platform.example>"), "SelfRun AI <no-reply@platform.example>");
    });
  });
  await platform.dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
