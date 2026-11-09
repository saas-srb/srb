import Link from "next/link";
import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { playbookCan } from "@/lib/playbook-roles";
import { CATEGORY_LABELS } from "@/lib/products/playbook-ai/catalogue";
import { listTemplates } from "@/lib/products/playbook-ai/tpl/store";
import { requireActor } from "@/lib/products/playbook-ai/tpl/actor";
import NewTemplateForm from "@/components/products/playbook-ai/templates/NewTemplateForm";

export const dynamic = "force-dynamic";

/** The company's own templates: copies of platform starters and templates made from scratch. */
export default async function MyTemplatesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const actor = await requireActor();
  if (!playbookCan(actor, "MANAGE_TEMPLATES")) redirect("/playbook-ai/catalogue");
  const r = await listTemplates(actor);
  const items = r.ok ? r.items : [];

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Playbook", href: "/playbook-ai" }, { label: "My templates" }]}
        title={<>My templates</>}
        description={<>Your company&apos;s own versions of the templates. New documents use the version you publish. Copy a starter from the <Link href="/playbook-ai/catalogue" className="underline underline-offset-2">library</Link>, or start from scratch.</>}
      />
      <NewTemplateForm />
      {items.length === 0 ? (
        <p className="rounded-2xl border border-border/50 bg-card p-6 text-sm text-muted-foreground">You have no templates of your own yet. Documents are created from the platform starters until you make a copy.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Template</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Review</th><th className="px-3 py-2">Updated</th></tr></thead>
            <tbody>
              {items.map((t) => (
                <tr key={t._id} className="border-t border-border/40">
                  <td className="px-3 py-2"><Link href={`/playbook-ai/my-templates/${t._id}`} className="font-medium text-primary underline-offset-2 hover:underline">{t.name}</Link><div className="text-xs text-muted-foreground">{t.typeId}{t.origin === "starter" ? " · copied from a starter" : " · made from scratch"}</div>{t.starterUpdateAvailable && <div className="text-xs text-amber-700 dark:text-amber-400">The platform updated the starter</div>}</td>
                  <td className="px-3 py-2 text-xs">{CATEGORY_LABELS[t.category]}</td>
                  <td className="px-3 py-2 text-xs">{t.status === "published" ? `Published, version ${t.publishedVersion}` : t.status === "archived" ? "Archived" : "Draft, not published"}</td>
                  <td className="px-3 py-2 text-xs">{t.draftReviewed ? "Reviewed" : t.legalReview ? <span className="text-amber-700 dark:text-amber-400">Needs review by a qualified advocate</span> : "Not reviewed"}</td>
                  <td className="px-3 py-2 text-xs">{t.updatedAt.toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
