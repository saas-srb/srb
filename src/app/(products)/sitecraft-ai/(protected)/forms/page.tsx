import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { redirect } from "next/navigation";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { getFormDoc, CONTACT_FORM_FIELD_NAMES } from "@/lib/products/sitecraft-ai/forms";
import ContactFormEditor from "@/components/products/sitecraft-ai/ContactFormEditor";
import LeadCategoriesEditor from "@/components/products/sitecraft-ai/LeadCategoriesEditor";
import { getLeadCategories } from "@/lib/lead-categories";
import { ClipboardList } from "lucide-react";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";

export default async function CmsFormsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");

  const fields = await getFormDoc("contact", CONTACT_FORM_FIELD_NAMES);
  const leadSet = await getLeadCategories();

  return (
    <div className="space-y-4">
      <CmsPageHeader
        breadcrumbs={[{ label: "Forms" }]}
        icon={ClipboardList}
        title="Forms"
        description={<>The contact form&apos;s field labels, placeholders and help text. Submissions still go through the existing leads pipeline — this only controls how the fields are presented.</>}
      />
      <PanelListFilters>
<ContactFormEditor initialFields={fields} canEdit={can(viewer, "FORMS_MANAGE")} />
{leadSet.custom && <LeadCategoriesEditor initial={leadSet.categories} canEdit={can(viewer, "FORMS_MANAGE")} />}
</PanelListFilters>
    </div>
  );
}
