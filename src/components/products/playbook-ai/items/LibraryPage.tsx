import Link from "next/link";
import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Button } from "@/components/ui/button";
import LibraryGrid from "@/components/products/playbook-ai/items/LibraryGrid";
import { playbookCan } from "@/lib/playbook-roles";
import { CATEGORY_LABELS, listCatalogue } from "@/lib/products/playbook-ai/catalogue";
import { listLibrary } from "@/lib/products/playbook-ai/item-library";
import { getPbActor } from "@/lib/products/playbook-ai/pb-actor";
import { ITEM_KIND_INFO, type ItemKind, type LibraryEntryInfo } from "@/lib/products/playbook-ai/items-types";

/** "SOP Library", "KPI Library", "Document Library": prebuilt, fully written items. */
export default async function LibraryPage({ kind }: { kind: ItemKind }) {
  const actor = await getPbActor();
  if (!actor) redirect("/playbook-ai/login");
  const info = ITEM_KIND_INFO[kind];
  const entries: LibraryEntryInfo[] =
    kind === "document"
      ? listCatalogue({ withContent: true }).map((e) => ({ id: e.meta.id, kind: "document", title: e.meta.name, category: CATEGORY_LABELS[e.meta.category], summary: e.meta.purpose, legal: e.meta.legal.review, tags: e.meta.inputsSummary.slice(0, 3).map((x) => x.length > 34 ? `${x.slice(0, 32)}…` : x) }))
      : listLibrary(kind);
  return (
    <div className="space-y-4">
      <PanelPageHeader
        title={<>{info.library}</>}
        description={<>{entries.length} prebuilt, fully written {info.plural === "Employee KPIs" ? "KPI sheets" : info.plural}. Preview one, then use it to make your own copy.</>}
        actions={<Button variant="outline" nativeButton={false} render={<Link href={`/playbook-ai/${info.segment}`} />}>{info.mine}</Button>}
      />
      <LibraryGrid kind={kind} entries={entries} canUse={playbookCan(actor, "CREATE")} />
    </div>
  );
}
