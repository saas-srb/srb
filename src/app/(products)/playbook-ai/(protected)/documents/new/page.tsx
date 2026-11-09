import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { playbookCan } from "@/lib/playbook-roles";
import { LEGAL_REVIEW_BANNER, STATUTE_NOTICE } from "@/lib/products/playbook-ai/catalogue";
import { resolveTemplate } from "@/lib/products/playbook-ai/tpl/store";
import { requireActor } from "@/lib/products/playbook-ai/tpl/actor";
import { defaultInputs } from "@/lib/products/playbook-ai/tpl/inputs";
import { brandSummary } from "@/lib/products/playbook-ai/brand/summary";
import ItemWizard from "@/components/products/playbook-ai/items/ItemWizard";
import { getPbSettings } from "@/lib/products/playbook-ai/pb-settings";
import NewDocumentForm from "@/components/products/playbook-ai/templates/NewDocumentForm";

export const dynamic = "force-dynamic";

/** Start a document from a template: the form is built from the template's inputs. */
export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ type?: string; template?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const actor = await requireActor();
  if (!playbookCan(actor, "CREATE")) redirect("/playbook-ai/documents");
  if (!sp.type && !sp.template) {
    const settings = await getPbSettings();
    return (
      <div className="space-y-4">
        <PanelPageHeader title={<>Create document</>} description={<>Three steps: details, an AI draft you check, then the editor with a live PDF preview.</>} />
        <p className="rounded-xl border border-border/50 bg-card p-3 text-sm">Need a specific kind of document, such as an offer letter, NDA or service agreement? <Link href="/playbook-ai/documents/library" className="font-medium text-primary underline-offset-2 hover:underline">Choose it from the Document Library</Link>, and the form is built from what that document needs.</p>
        <ItemWizard kind="document" aiEnabled={settings.ai.enabled && playbookCan(actor, "USE_AI")} brand={await brandSummary(actor)} />
      </div>
    );
  }
  const r = await resolveTemplate(actor, { typeId: sp.type, templateId: sp.template });
  if (!r.ok) notFound();
  const t = r.resolved;
  const needsAdvocate = t.def.legal.review && !t.reviewed;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Playbook", href: "/playbook-ai" }, { label: "Document Library", href: "/playbook-ai/documents/library" }, { label: t.def.name }]}
        title={<>New {t.def.name.toLowerCase()}</>}
        description={<>{t.def.purpose} Using {t.source === "company" ? `your company's version ${t.version}` : "the platform starter"}.</>}
      />
      {needsAdvocate && <p role="note" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{LEGAL_REVIEW_BANNER} This template has not been marked as reviewed by your company.</p>}
      {t.def.legal.statute && <p role="note" className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-3 text-sm">{STATUTE_NOTICE}</p>}
      <NewDocumentForm typeId={t.typeId} templateId={t.source === "company" ? t.templateId : undefined} inputs={t.def.inputs} defaults={defaultInputs(t.def.inputs)} templateName={t.def.name} />
      <p className="text-xs text-muted-foreground"><Link href={`/playbook-ai/catalogue/${t.typeId}`} className="underline-offset-2 hover:underline">About this template</Link></p>
    </div>
  );
}
