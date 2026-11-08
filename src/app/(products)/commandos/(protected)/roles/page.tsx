import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { ensureDesignations, listAccessAudit, listCustomRoles } from "@/lib/products/commandos/custom-roles";
import { redirect } from "next/navigation";
import RolesManager from "./RolesManager";

export const dynamic = "force-dynamic";

export default async function CustomRolesPage() {
  const user = await requireWorkspaceAccess("company.roles");
  // Defining roles hands out permissions: Director only (a delegated user manager only assigns existing roles, on the Users page).
  if (!user.roles.includes("super_admin")) redirect("/commandos/users");
  await ensureDesignations();
  const [roles, audit] = await Promise.all([listCustomRoles(), listAccessAudit(60)]);
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Designations & permissions" }]}
        title={<>Designations &amp; permissions</>}
        description={<>A designation is a job (HR Manager, Accountant, Sales Executive …) and gives the right access in every product at once. Start from the standard ones, change what they may do, or add your own. Changes apply to everyone who holds the designation, immediately.</>}
      />
      <RolesManager roles={roles} audit={audit} />
    </div>
  );
}
