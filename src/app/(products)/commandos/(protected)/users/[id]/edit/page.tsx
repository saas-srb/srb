import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { accessUiFor } from "@/lib/products/commandos/people";
import { hiddenProducts } from "@/lib/platform/products/visible";
import { loadOrgOptions } from "@/lib/platform/organization/options";
import { loadPersonForEdit } from "@/lib/products/commandos/people";
import { getAccessRequest } from "@/lib/products/commandos/access-requests";
import PersonWizard from "@/components/products/commandos/people/PersonWizard";
import { checkPersonAction, createPersonAction, updatePersonAction } from "../../actions";

export const metadata: Metadata = { title: "Edit person", robots: { index: false, follow: false } };

export default async function EditPersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ request?: string }> }) {
  await requireWorkspaceAccess("company.users");
  const { id } = await params;
  const person = await loadPersonForEdit(id);
  if (!person) notFound();
  const org = await loadOrgOptions();
  const sp = await searchParams;
  const asked = sp.request ? await getAccessRequest(sp.request) : null;
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "People & access", href: "/commandos/users" }, { label: person.details.name || person.details.email }]}
        title={<>{person.details.name || person.details.email}</>}
        description={<>Change their details and what they can use. The same three steps as adding a person.</>}
      />
      {asked && asked.userId === person.id && asked.status === "open" && (
        <p role="note" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          {person.details.name || person.details.email} asked for access to <strong>{asked.label}</strong>{asked.message ? ` ("${asked.message}")` : ""}. Give it in step 2, save, then mark the request handled on the People page.
        </p>
      )}
      <PersonWizard
        mode="edit"
        personId={person.id}
        initial={{ details: person.details, picked: person.picked, isDirector: person.isDirector, fromLegacyRoles: person.fromLegacyRoles }}
        model={accessUiFor(await hiddenProducts())}
        org={org}
        actions={{ check: checkPersonAction, create: createPersonAction, update: updatePersonAction }}
      />
    </div>
  );
}
