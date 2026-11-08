import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { playbookCan } from "@/lib/playbook-roles";
import { DEFAULT_PAGE, PAGE_SIZES, PBDOC_SCHEMA_VERSION } from "@/lib/products/playbook-ai/doc";

/**
 * Documents (preview). The document model is in place; creating, editing and exporting documents arrive in the following features, so this
 * page honestly says what exists today instead of listing anything. Visible only to Playbook administrators until documents can be created.
 */
export default async function DocumentsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  if (!playbookCan(ctx, "SETTINGS")) redirect("/playbook-ai");

  const a4 = PAGE_SIZES[DEFAULT_PAGE.size];
  const m = DEFAULT_PAGE.margins;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Playbook", href: "/playbook-ai" }, { label: "Documents" }]}
        title={<>Documents</>}
        description={<>Every business document, versioned and exportable to PDF and Word. This area is being built; existing SOPs are unchanged.</>}
      />
      <div className="rounded-2xl border border-border/50 bg-card p-5 text-sm">
        <h2 className="font-semibold">Ready now</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Document model v{PBDOC_SCHEMA_VERSION}: headings, clauses, lists, tables, images, callouts, variables, page breaks, headers and footers, signature blocks.</li>
          <li>
            Page: {a4.label} {DEFAULT_PAGE.orientation} ({a4.widthMm} x {a4.heightMm} mm), margins {m.top} mm top and bottom, {m.left} mm left and right.
          </li>
          <li>Permissions for documents are in place and appear in the Director&apos;s permission list under &quot;Playbook documents&quot;.</li>
        </ul>
        <h2 className="mt-4 font-semibold">Next</h2>
        <p className="mt-2 text-muted-foreground">PDF and Word export, document versions and drafts, the editor, templates and AI drafting.</p>
      </div>
    </div>
  );
}
