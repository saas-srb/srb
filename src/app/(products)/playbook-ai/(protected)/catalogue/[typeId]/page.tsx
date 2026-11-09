import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { playbookCan } from "@/lib/playbook-roles";
import { CATEGORY_LABELS, getCatalogueMeta, getTemplateDef, LEGAL_REVIEW_BANNER, STATUTE_NOTICE } from "@/lib/products/playbook-ai/catalogue";
import { listTemplates } from "@/lib/products/playbook-ai/tpl/store";
import { requireActor } from "@/lib/products/playbook-ai/tpl/actor";
import StarterActions from "@/components/products/playbook-ai/templates/StarterActions";

export const dynamic = "force-dynamic";

/** One starter template: what it is, what it asks for, how it is built, and the two buttons: use it as it is, or make the company's own copy. */
export default async function StarterDetailPage({ params }: { params: Promise<{ typeId: string }> }) {
  const { typeId } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const actor = await requireActor();
  if (!playbookCan(actor, "VIEW")) redirect("/playbook-ai");
  const meta = getCatalogueMeta(typeId);
  if (!meta) notFound();
  const def = getTemplateDef(typeId);
  const mine = await listTemplates(actor);
  const own = (mine.ok ? mine.items : []).find((t) => t.typeId === typeId && t.status !== "archived") ?? null;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Playbook", href: "/playbook-ai" }, { label: "Template library", href: "/playbook-ai/catalogue" }, { label: meta.name }]}
        title={<>{meta.name}</>}
        description={<>{meta.purpose}</>}
      />
      {meta.legal.review && <p role="note" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{LEGAL_REVIEW_BANNER} Platform starters are not reviewed: a template becomes &quot;reviewed&quot; only when a reviewer at your company marks the company&apos;s copy.</p>}
      {meta.legal.statute && <p role="note" className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-3 text-sm">{STATUTE_NOTICE}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <StarterActions typeId={typeId} hasContent={!!def} canCreate={playbookCan(actor, "CREATE")} canManage={playbookCan(actor, "MANAGE_TEMPLATES")} ownId={own?._id ?? null} ownStatus={own?.status ?? null} ownVersion={own?.publishedVersion ?? null} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/50 bg-card p-5 text-sm">
          <h2 className="font-semibold">About</h2>
          <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1.5">
            <dt className="text-muted-foreground">Category</dt><dd>{CATEGORY_LABELS[meta.category]}</dd>
            <dt className="text-muted-foreground">Party</dt><dd>{meta.party}</dd>
            <dt className="text-muted-foreground">Audience</dt><dd>{meta.audience}</dd>
            <dt className="text-muted-foreground">Signed</dt><dd>{meta.sign === "yes" ? "Yes, in ContractFlow" : meta.sign === "optional" ? "Optional" : "No"}{meta.esignIneligible ? " (wet signature or registration may be needed)" : ""}</dd>
            <dt className="text-muted-foreground">Stamp duty</dt><dd>{meta.stamp.rule === "none" ? "Not usually" : `${meta.stamp.rule === "likely" ? "Likely" : "Maybe"} (${meta.stamp.category?.replace(/_/g, " ")})`}</dd>
            <dt className="text-muted-foreground">Number</dt><dd>{meta.numberingPrefix}/…</dd>
            <dt className="text-muted-foreground">Version</dt><dd>{def ? `Starter version ${def.version}` : "Not written yet"}</dd>
          </dl>
        </section>
        <section className="rounded-2xl border border-border/50 bg-card p-5 text-sm">
          <h2 className="font-semibold">{def ? "What it asks for" : "What it will ask for"}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {(def ? def.inputs.map((i) => `${i.label}${i.required ? "" : " (optional)"}`) : meta.inputsSummary).map((x) => <li key={x}>{x}</li>)}
          </ul>
          <h2 className="mt-4 font-semibold">Sections</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            {(def ? def.sections.filter((s) => !s.draftOnly).map((s) => `${s.title}${s.aiMode === "fixed" ? "" : s.aiMode === "ai" ? " (written by AI)" : " (partly written by AI)"}`) : meta.sectionsSummary).map((x) => <li key={x}>{x}</li>)}
          </ol>
        </section>
      </div>
      {!def && <p className="text-sm text-muted-foreground">This document type is part of the library plan. Its full template has not been written yet, so it cannot be used today.</p>}
      <p className="text-xs text-muted-foreground"><Link href="/playbook-ai/catalogue" className="underline-offset-2 hover:underline">Back to the library</Link></p>
    </div>
  );
}
