/**
 * Brings accounts made before designations and statuses up to date. Safe to run again; changes nothing without --apply.
 *   npx tsx --require ./scripts/lib/next-server-shims.cjs --env-file=.env.local scripts/backfill-people.ts [--apply] [--company <slug>]
 *
 * For every company:
 *   - the standard designations are created
 *   - each account gets a status (no roles = deactivated, otherwise active) and, when its roles are exactly one designation's, that designation
 *     (access stays identical; it now follows the designation); a Director is recorded as one
 *   - each account that can sign in and has no HR file gets one in TalentOS
 */
import { ObjectId } from "mongodb";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getDb } from "@/lib/mongodb";
import { ensureDesignations, listCustomRoles } from "@/lib/products/commandos/custom-roles";
import { ensureHrFile } from "@/lib/products/commandos/employee-link";

const apply = process.argv.includes("--apply");
const only = process.argv.includes("--company") ? process.argv[process.argv.indexOf("--company") + 1] : null;

(async () => {
  const companies = await (await getPlatformDb()).collection<{ _id: string; slug: string; name: string }>("companies").find(only ? { slug: only } : {}).toArray();
  let people = 0, statuses = 0, designations = 0, files = 0, problems = 0;
  for (const c of companies) {
    await runAsCompany(c._id, async () => {
      if (apply) await ensureDesignations();
      const db = await getDb();
      const roles = apply ? await listCustomRoles() : [];
      const users = await db.collection<{ _id: ObjectId; email: string; name?: string; roles?: string[]; status?: string; designationId?: string | null; employeeId?: string | null; platformRoleId?: string | null; manualRoles?: string[]; customRoleIds?: string[] }>("admin_users").find({}).toArray();
      for (const u of users) {
        people++;
        const set: Record<string, unknown> = {};
        const hasRoles = (u.roles ?? []).length > 0;
        if (!u.status) { set.status = hasRoles || u.platformRoleId ? "active" : "deactivated"; statuses++; }
        let title = "Team Member";
        if (!u.designationId) {
          if ((u.roles ?? []).includes("super_admin")) { set.designationId = "director"; designations++; title = "Director"; }
          else {
            const mine = new Set(u.roles ?? []);
            const hit = roles.find((r) => r.baseRoles.length === mine.size && r.baseRoles.every((x) => mine.has(x)));
            if (hit) { set.designationId = hit.id; set.customRoleIds = [...new Set([hit.id, ...(u.customRoleIds ?? [])])]; set.manualRoles = []; designations++; title = hit.name; }
          }
        } else if (u.designationId === "director") title = "Director";
        if (apply && Object.keys(set).length) await db.collection("admin_users").updateOne({ _id: u._id }, { $set: set });
        if (!u.employeeId && (hasRoles || u.platformRoleId)) {
          files++;
          if (apply) {
            const r = await ensureHrFile({ userId: u._id, email: u.email, name: u.name ?? "", designationTitle: title, actorId: String(u._id) });
            if (!r.ok) { problems++; console.log(`  ! ${c.slug}: ${u.email}: ${r.error}`); }
          }
        }
      }
    });
  }
  console.log(`${apply ? "Done" : "Would change"}: ${companies.length} companies, ${people} accounts: ${statuses} statuses, ${designations} designations, ${files} HR files${problems ? `, ${problems} problems` : ""}.${apply ? "" : " Run again with --apply."}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
