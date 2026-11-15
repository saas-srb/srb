/**
 * Department unification migration (sop_departments + free-text department fields -> the organization service).
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_org npx tsx --require ./scripts/lib/next-server-shims.cjs \
 *     scripts/migrate-organization.ts [--dry-run | --apply | --revert] --id <migration-id> [--company <companyId>]
 *
 * Default is --dry-run. The database named by MONGODB_URI MUST contain "throwaway" or "test": this script
 * refuses to run against anything else (production is never touched from here).
 */
import { runAsCompany, forEachCompany } from "@/lib/platform/tenancy/context";
import { runDepartmentMigration } from "@/lib/platform/organization/migrate";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const val = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  if (!/throwaway|test/i.test(uri.split("/").pop() ?? "")) {
    console.error("Refusing to run: MONGODB_URI must point at a throwaway database (name contains 'throwaway' or 'test').");
    process.exit(2);
  }
  const mode = flag("--apply") ? "apply" : flag("--revert") ? "revert" : "dry-run";
  const id = val("--id");
  if (!id) { console.error("--id <migration-id> is required"); process.exit(2); }
  const company = val("--company");
  const run = (companyId: string) => runAsCompany(companyId, () => runDepartmentMigration(mode, id));
  const results = company ? [{ companyId: company, ok: true, result: await run(company) }] : await forEachCompany((c) => run(c));
  for (const r of results) {
    console.log(`\n== company ${r.companyId} (${mode}) ${r.ok ? "" : "FAILED: " + r.error}`);
    if (r.result) console.log(JSON.stringify(r.result, null, 2));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
