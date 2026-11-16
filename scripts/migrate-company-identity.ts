/**
 * Copies the company identity from the older stores into the one company identity document (additive; the old stores are kept as fallback).
 *   MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_x npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/migrate-company-identity.ts [--dry-run | --apply | --revert] --id <id> [--company <id>]
 * Default --dry-run (reports what would be copied and where the old stores disagree). MONGODB_URI must name a throwaway/test database.
 * The mapping table is documented in src/lib/platform/company-identity/migration.ts.
 */
import { runAsCompany, forEachCompany } from "@/lib/platform/tenancy/context";
import { runIdentityMigration } from "@/lib/platform/company-identity/migration";

const args = process.argv.slice(2);
const val = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
async function main() {
  if (!/throwaway|test/i.test((process.env.MONGODB_URI ?? "").split("/").pop() ?? "")) { console.error("Refusing to run: MONGODB_URI must point at a throwaway database."); process.exit(2); }
  const mode = args.includes("--apply") ? "apply" : args.includes("--revert") ? "revert" : "dry-run";
  const id = val("--id");
  if (!id) { console.error("--id <migration-id> is required"); process.exit(2); }
  const company = val("--company");
  const run = (c: string) => runAsCompany(c, () => runIdentityMigration(mode, id));
  const results = company ? [{ companyId: company, ok: true, result: await run(company) }] : await forEachCompany((c) => run(c));
  for (const r of results) console.log(`\n== company ${r.companyId} (${mode})`, r.result ? JSON.stringify(r.result, null, 2) : r.ok ? "" : `FAILED ${r.error}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
