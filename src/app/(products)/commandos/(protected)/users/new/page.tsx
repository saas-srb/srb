import type { Metadata } from "next";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { buildAccessUi } from "@/lib/access/ui-model";
import { loadOrgOptions } from "@/lib/platform/organization/options";
import { countSeatsUsed } from "@/lib/platform/billing/enforce";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { emptyDetails } from "@/lib/products/commandos/people-rules";
import PersonWizard from "@/components/products/commandos/people/PersonWizard";
import { checkPersonAction, createPersonAction, updatePersonAction } from "../actions";

export const metadata: Metadata = { title: "Add a person", robots: { index: false, follow: false } };

export default async function NewPersonPage() {
  await requireWorkspaceAccess("company.users");
  const [org, seatsUsed, ent] = await Promise.all([loadOrgOptions(), countSeatsUsed(), getEntitlements()]);
  const limit = ent.limits.seats;
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "People & access", href: "/commandos/users" }, { label: "Add a person" }]}
        title={<>Add a person</>}
        description={<>Three steps: their details, what they can use, and a final check before anything is created.</>}
      />
      <PersonWizard
        mode="create"
        initial={{ details: emptyDetails(), picked: {}, isDirector: false }}
        model={buildAccessUi()}
        org={org}
        actions={{ check: checkPersonAction, create: createPersonAction, update: updatePersonAction }}
        seatLine={`Seats: ${seatsUsed} of ${limit === null ? "unlimited" : limit} in use.`}
      />
    </div>
  );
}
