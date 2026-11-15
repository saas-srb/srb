/**
 * Legacy roles -> access map, for every company (or one with --company).
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_access npx tsx --require ./scripts/lib/next-server-shims.cjs \
 *     scripts/migrate-access.ts [--dry-run | --apply | --revert] --id <migration-id> [--company <companyId>]
 *
 * Default is --dry-run. MONGODB_URI must name a throwaway/test database; production is never touched from here.
 * Legacy fields (roles, overrides, custom roles) are left in place.
 */
import { runAsCompany, forEachCompany } from "@/lib/platform/tenancy/context";
import { runAccessMigration } from "@/lib/access/migrate";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const val = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

async function main() {
  if (!/throwaway|test/i.test((process.env.MONGODB_URI ?? "").split("/").pop() ?? "")) {
    console.error("Refusing to run: MONGODB_URI must point at a throwaway database (name contains 'throwaway' or 'test').");
    process.exit(2);
  }
  const mode = flag("--apply") ? "apply" : flag("--revert") ? "revert" : "dry-run";
  const id = val("--id");
  if (!id) { console.error("--id <migration-id> is required"); process.exit(2); }
  const company = val("--company");
  const run = (c: string) => runAsCompany(c, () => runAccessMigration(mode, id));
  const results = company ? [{ companyId: company, ok: true, result: await run(company) }] : await forEachCompany((c) => run(c));
  for (const r of results) {
    console.log(`\n== company ${r.companyId} (${mode}) ${r.ok ? "" : "FAILED: " + r.error}`);
    if (r.result) console.log(JSON.stringify({ ...r.result, people: r.result.people.map((p) => ({ ...p, conflicts: p.conflicts.length })) }, null, 2));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
