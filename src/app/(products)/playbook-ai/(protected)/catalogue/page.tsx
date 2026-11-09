import Link from "next/link";
import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { playbookCan } from "@/lib/playbook-roles";
import { CATEGORY_KEYS, CATEGORY_LABELS, PARTY_TYPES, searchCatalogue, type CategoryKey, type PartyType } from "@/lib/products/playbook-ai/catalogue";
import { listTemplates } from "@/lib/products/playbook-ai/tpl/store";
import { requireActor } from "@/lib/products/playbook-ai/tpl/actor";

export const dynamic = "force-dynamic";

const sel = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm";

/** The template library: every document type Playbook knows, with search and filters. Platform starters are read-only; "Make my copy" is on the detail page. */
export default async function CataloguePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const actor = await requireActor();
  if (!playbookCan(actor, "VIEW")) redirect("/playbook-ai");

  const category = (CATEGORY_KEYS as readonly string[]).includes(sp.category ?? "") ? (sp.category as CategoryKey) : undefined;
  const party = (PARTY_TYPES as readonly string[]).includes(sp.party ?? "") ? (sp.party as PartyType) : undefined;
  const entries = searchCatalogue(sp.q ?? "", {
    category, party, legalReview: sp.legal === "1" ? true : undefined, needsSignature: sp.sign === "1" ? true : undefined, withContent: sp.ready === "1" ? true : undefined,
  });
  const mine = await listTemplates(actor);
  const byType = new Map((mine.ok ? mine.items : []).map((t) => [t.typeId, t]));
  const ready = entries.filter((e) => e.hasContent).length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Playbook", href: "/playbook-ai" }, { label: "Template library" }]}
        title={<>Template library</>}
        description={<>Every kind of business document, ready to start from. {ready} of {entries.length} shown have a full template today; the rest are listed so you can see what is coming.</>}
      />
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/50 bg-card p-4 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Search</span><input name="q" defaultValue={sp.q ?? ""} placeholder="offer, NDA, policy..." className={`${sel} w-56`} /></label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Category</span>
          <select name="category" defaultValue={category ?? ""} className={sel}><option value="">All</option>{CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}</select></label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Party</span>
          <select name="party" defaultValue={party ?? ""} className={sel}><option value="">Any</option>{PARTY_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="ready" value="1" defaultChecked={sp.ready === "1"} className="size-4 accent-[var(--primary)]" />Ready to use</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="legal" value="1" defaultChecked={sp.legal === "1"} className="size-4 accent-[var(--primary)]" />Legal review needed</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="sign" value="1" defaultChecked={sp.sign === "1"} className="size-4 accent-[var(--primary)]" />Signed</label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Filter</button>
        <Link href="/playbook-ai/catalogue" className="text-xs text-muted-foreground underline-offset-2 hover:underline">Clear</Link>
      </form>
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-border/50 bg-card p-6 text-sm text-muted-foreground">No document type matches. Try fewer filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Document</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Party</th><th className="px-3 py-2">Signed</th><th className="px-3 py-2">Notes</th><th className="px-3 py-2">Your company</th></tr></thead>
            <tbody>
              {entries.map(({ meta: m, hasContent }) => {
                const own = byType.get(m.id);
                return (
                  <tr key={m.id} className="border-t border-border/40 align-top">
                    <td className="px-3 py-2"><Link href={`/playbook-ai/catalogue/${m.id}`} className="font-medium text-primary underline-offset-2 hover:underline">{m.name}</Link><div className="text-xs text-muted-foreground">{m.purpose}</div></td>
                    <td className="px-3 py-2 text-xs">{CATEGORY_LABELS[m.category]}</td>
                    <td className="px-3 py-2 text-xs">{m.party}</td>
                    <td className="px-3 py-2 text-xs">{m.sign === "yes" ? "Yes" : m.sign === "optional" ? "Optional" : "No"}</td>
                    <td className="px-3 py-2 text-xs">
                      {m.legal.review && <span className="mr-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">Legal review</span>}
                      {m.legal.statute && <span className="mr-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-blue-700 dark:text-blue-400">Statute</span>}
                      {!hasContent && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Coming</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">{own ? <Link href={`/playbook-ai/my-templates/${own._id}`} className="underline-offset-2 hover:underline">{own.status === "published" ? `Version ${own.publishedVersion}` : own.status}</Link> : hasContent ? "Platform starter" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
