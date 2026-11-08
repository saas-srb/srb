import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { GLOBAL_COLLECTIONS, KEYED_COLLECTIONS } from "../src/lib/platform/tenancy/collections";
import { CF_COLLECTIONS, CF_ID_KIND, CF_KEYED_COLLECTIONS } from "../src/lib/products/contractflow-ai/cf-collections";

// ContractFlow foundation (B0). Throwaway database only for the archive-plan part: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>.
const uri = process.env.MONGODB_URI ?? "";
assert.ok(/zz_throwaway_/.test(uri) && !/\.env/.test(uri), "Run with MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>");
const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

(async () => {
  console.log("tenancy registration");
  await t("cf collection names are unique and prefixed cf_, and every one declares its _id kind", () => {
    const names = Object.values(CF_COLLECTIONS);
    assert.equal(new Set(names).size, names.length);
    for (const n of names) {
      assert.match(n, /^cf_[a-z_]+$/);
      assert.ok(CF_ID_KIND[n], `${n} has no declared _id kind`);
    }
    assert.equal(Object.keys(CF_ID_KIND).length, names.length);
  });
  await t("every fixed-_id cf_ collection is registered as KEYED (fails if one is added without registering)", () => {
    assert.deepEqual([...CF_KEYED_COLLECTIONS].sort(), ["cf_counters", "cf_settings"]);
    for (const n of Object.values(CF_COLLECTIONS)) if (CF_ID_KIND[n] === "fixed") assert.ok(KEYED_COLLECTIONS.has(n), `${n} stores a fixed _id but is missing from KEYED_COLLECTIONS`);
  });
  await t("the tenancy file has no stray cf_ keyed entry, and uuid collections are neither keyed nor global", () => {
    for (const n of KEYED_COLLECTIONS) if (n.startsWith("cf_")) assert.ok((CF_KEYED_COLLECTIONS as readonly string[]).includes(n), `${n} is keyed but not declared by the product`);
    for (const n of Object.values(CF_COLLECTIONS)) {
      assert.equal(GLOBAL_COLLECTIONS.has(n), false, `${n} must be company-scoped`);
      if (CF_ID_KIND[n] === "uuid") assert.equal(KEYED_COLLECTIONS.has(n), false, `${n}`);
    }
  });
  await t("source code names no cf_ collection that is not declared", () => {
    const declared = new Set<string>(Object.values(CF_COLLECTIONS));
    const files = [...walk(path.join(ROOT, "src/lib/products/contractflow-ai")), ...walk(path.join(ROOT, "src/app/(products)/contractflow-ai")), ...walk(path.join(ROOT, "src/app/(products)/api/contractflow-ai")), ...walk(path.join(ROOT, "src/components/products/contractflow-ai")), ...walk(path.join(ROOT, "src/app/sign"))].filter((f) => !f.endsWith("cf-collections.ts"));
    for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/["'`](cf_[a-z_]+)["'`]/g)) assert.ok(declared.has(m[1]), `${path.relative(ROOT, f)} uses undeclared collection ${m[1]}`);
  });

  console.log("reset");
  await t("the stubs are gone and nothing imports them", () => {
    for (const rel of ["src/lib/products/contractflow-ai/ai.ts", "src/lib/products/contractflow-ai/output", "src/app/(products)/api/contractflow-ai/ai"]) assert.equal(existsSync(path.join(ROOT, rel)), false, rel);
    for (const f of walk(path.join(ROOT, "src"))) {
      const s = readFileSync(f, "utf8");
      assert.ok(!/contractflow-ai\/(ai|output)\b/.test(s) || f.includes("faqs"), `${path.relative(ROOT, f)} still imports a retired stub`);
      assert.ok(!/companyId:\s*[^,\n]*'ctx'/.test(s), `${path.relative(ROOT, f)} still passes the literal 'ctx' as a company`);
    }
  });
  await t("the sidebar offers no authoring routes", () => {
    const nav = read("src/components/products/contractflow-ai/LpmsSidebar.tsx");
    for (const r of ["/new", "/templates", "/makers", "/workflows", "/categories", "/signatures"]) assert.ok(!nav.includes(`/contractflow-ai${r}"`), `${r} is still in the nav`);
    assert.ok(nav.includes("/contractflow-ai/documents"), "old documents stay reachable");
  });
  await t("product text no longer claims export, e-signature or AI drafting", () => {
    const products = read("docs/products.md");
    const cf = products.slice(products.indexOf("## SelfRun ContractFlow AI"), products.indexOf("## SelfRun CyberVault"));
    assert.ok(/Not yet available/i.test(cf));
    for (const bad of [/export as PDF/i, /signature requests,? and a full audit/i, /Optional AI drafting/i, /Notifications go out when documents are issued/i]) assert.ok(!bad.test(cf), String(bad));
    const faq = read("src/lib/platform/saas/faqs/products/business-workflows.ts");
    for (const q of ["Does ContractFlow provide a PDF download?", "Can ContractFlow export a document as DOCX or print?", "Can the AI draft document content from a prompt?", "Can I send signature requests to more than one signer?"]) assert.ok(!faq.includes(q), q);
  });

  console.log("client safety");
  await t("client-safe modules import nothing server-only; the Console manager reaches the store by type only", () => {
    const safe = ["src/lib/products/contractflow-ai/cf-collections.ts", "src/lib/products/contractflow-ai/party-types.ts", "src/lib/products/contractflow-ai/sign-types.ts", "src/lib/products/contractflow-ai/stamp/structure.ts"];
    for (const rel of safe) {
      const src = read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      assert.ok(!/server-only|from "mongodb"|from "node:|next\/headers|@\/lib\/mongodb|scoped-db/.test(src), `${rel} must stay client-safe`);
      for (const m of src.matchAll(/from "(\.[^"]+)"/g)) assert.ok(/types|structure|collections/.test(m[1]), `${rel} imports ${m[1]}`);
    }
    const mgr = read("src/app/(platform)/console/stamp-rulebook/StampRulebookManager.tsx");
    assert.ok(mgr.startsWith('"use client"'));
    for (const m of mgr.matchAll(/^import (?!type)[^\n]*from "([^"]+)"/gm)) assert.ok(!/stamp\/store|stamp\/guidance|cf-db|public-access|requests|events|tokens/.test(m[1]), `client file imports ${m[1]}`);
    for (const rel of ["src/lib/products/contractflow-ai/stamp/store.ts", "src/lib/products/contractflow-ai/stamp/guidance.ts", "src/lib/products/contractflow-ai/tokens.ts", "src/lib/products/contractflow-ai/public-access.ts", "src/lib/products/contractflow-ai/parties.ts", "src/lib/products/contractflow-ai/cf-db.ts"]) assert.ok(read(rel).startsWith('import "server-only"'), `${rel} must be server-only`);
  });

  console.log("archive plan (read-only)");
  const { getPlatformDb } = await import("../src/lib/platform/tenancy/platform-db");
  const db = await getPlatformDb();
  assert.ok(/zz_throwaway_/.test(db.databaseName), "refusing to run on " + db.databaseName);
  await db.dropDatabase();
  await t("reports counts per company, writes nothing, creates no cf_ collection, leaves old rows byte-identical", async () => {
    const { planLpmsArchive } = await import("../src/lib/products/contractflow-ai/archive-plan");
    await db.collection("lpms_documents").insertMany([
      { _id: "d1" as never, companyId: "A", status: "active", title: "NDA" },
      { _id: "d2" as never, companyId: "A", status: "draft", title: "Offer" },
      { _id: "d3" as never, companyId: "B", status: "active", title: "MSA" },
    ]);
    await db.collection("lpms_signatures").insertMany([
      { _id: "s1" as never, companyId: "A", documentId: "d1", signers: [{ status: "signed" }] },
      { _id: "s2" as never, companyId: "A", documentId: "d2", signers: [{ status: "pending" }] },
    ]);
    const snapshot = JSON.stringify(await Promise.all(["lpms_documents", "lpms_signatures"].map((c) => db.collection(c).find({}).sort({ _id: 1 }).toArray())));
    const before = (await db.listCollections().toArray()).map((c) => c.name).sort();
    const plan = await planLpmsArchive();
    assert.equal(plan.dryRun, true);
    assert.equal(plan.writes, 0);
    assert.equal(plan.totals.lpms_documents, 3);
    const a = plan.companies.find((c) => c.companyId === "A")!;
    assert.equal(a.counts.lpms_documents, 2);
    assert.deepEqual(a.documentsByStatus, { active: 1, draft: 1 });
    assert.equal(a.signedSignatureRequests, 1);
    assert.equal(a.proposal.find((p) => p.collection === "lpms_documents")!.action, "import_to_vault_as_unsigned");
    assert.equal(plan.companies.find((c) => c.companyId === "B")!.counts.lpms_signatures, 0);
    assert.equal((await planLpmsArchive({ companyId: "B" })).companies.length, 1);
    const after = (await db.listCollections().toArray()).map((c) => c.name).sort();
    assert.deepEqual(after, before, "the plan must not create collections");
    assert.ok(!after.some((n) => n.startsWith("cf_")));
    assert.equal(JSON.stringify(await Promise.all(["lpms_documents", "lpms_signatures"].map((c) => db.collection(c).find({}).sort({ _id: 1 }).toArray()))), snapshot);
  });
  await db.dropDatabase();
  console.log("contractflow foundation: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
