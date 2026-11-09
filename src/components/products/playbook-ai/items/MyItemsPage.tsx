import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, FilePlus2, Files, Library, Send } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { Button } from "@/components/ui/button";
import ItemsTable from "@/components/products/playbook-ai/items/ItemsTable";
import { playbookCan } from "@/lib/playbook-roles";
import { getPbActor } from "@/lib/products/playbook-ai/pb-actor";
import { listItems } from "@/lib/products/playbook-ai/items";
import { ITEM_KIND_INFO, type ItemKind } from "@/lib/products/playbook-ai/items-types";

/** "My SOPs", "My Documents" and "My KPI sheets": the same page for the three kinds. Heading, one Search & Filters card, stat cards, tabs. */
export default async function MyItemsPage({ kind, searchParams }: { kind: ItemKind; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string): string => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const actor = await getPbActor();
  if (!actor) redirect("/playbook-ai/login");
  const info = ITEM_KIND_INFO[kind];
  const tab = ["all", "draft", "sent", "signed"].includes(one("tab")) ? one("tab") : "all";
  const res = await listItems(actor, { kind, q: one("q"), tab, department: one("department") || undefined });
  const ctx = { roles: actor.roles, permissionOverrides: actor.permissionOverrides ?? undefined };
  const canCreate = playbookCan(ctx, "CREATE");

  const base = `/playbook-ai/${info.segment}`;
  const href = (t: string) => { const p = new URLSearchParams(); if (one("q")) p.set("q", one("q")); if (one("department")) p.set("department", one("department")); if (t !== "all") p.set("tab", t); const s = p.toString(); return s ? `${base}?${s}` : base; };

  // Departments for the filter come from every item, not only the ones the current tab shows.
  const all = res.ok ? await listItems(actor, { kind }) : null;
  const departments = all?.ok ? [...new Set(all.rows.map((r) => (kind === "kpi" ? r.designation || r.department : r.department)).filter(Boolean))].sort() : [];

  return (
    <div className="space-y-4">
      <PanelPageHeader
        title={<>{info.mine}</>}
        description={<>Everything your company created for {info.plural === "Employee KPIs" ? "employee KPIs" : info.plural}, whether it started from the library or from scratch. Items are sent to ContractFlow, which is where they are signed.</>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href={`${base}/library`} />}><Library className="size-4" /> {info.library}</Button>
            {canCreate && <Button nativeButton={false} render={<Link href={`${base}/new`} />}><FilePlus2 className="size-4" /> {info.create}</Button>}
          </div>
        }
        filters={
          <PanelFilterBar
            title="Search & Filters"
            description={`Find a ${info.singular.toLowerCase()} by title or department`}
            fields={[
              { key: "q", label: "Search", type: "search", placeholder: "Title" },
              ...(departments.length ? [{ key: "department", label: kind === "kpi" ? "Role" : "Department", type: "select" as const, options: departments.map((d) => ({ value: d, label: d })), allLabel: "All" }] : []),
            ]}
          />
        }
      />
      {!res.ok ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{res.error.message}</p>
      ) : (
        <>
          <KpiGrid>
            <KpiCard label={`All ${info.plural.toLowerCase()}`} value={res.counts.all} icon={<Files className="size-4" />} />
            <KpiCard label="Drafts" value={res.counts.draft} icon={<FilePlus2 className="size-4" />} />
            <KpiCard label="In ContractFlow" value={res.counts.sent} icon={<Send className="size-4" />} />
            <KpiCard label="Signed" value={res.counts.signed} icon={<CheckCircle2 className="size-4" />} />
          </KpiGrid>
          <PanelTabs
            active={tab}
            tabs={[
              { key: "all", label: "All", href: href("all"), count: res.counts.all },
              { key: "draft", label: "Drafts", href: href("draft"), count: res.counts.draft },
              { key: "sent", label: "In ContractFlow", href: href("sent"), count: res.counts.sent },
              { key: "signed", label: "Signed", href: href("signed"), count: res.counts.signed },
            ]}
          />
          {kind === "sop" && <p className="text-xs text-muted-foreground">SOPs created before this version are still available in the <Link className="text-primary underline-offset-2 hover:underline" href="/playbook-ai/library">earlier SOP library</Link>.</p>}
          <ItemsTable
            rows={res.rows}
            kind={kind}
            canSend={playbookCan(ctx, "SEND_FOR_SIGNATURE")}
            canEdit={playbookCan(ctx, "EDIT") || canCreate}
            canExport={playbookCan(ctx, "EXPORT")}
            canDelete={playbookCan(ctx, "EDIT")}
            emptyText={one("q") || one("department") || tab !== "all" ? "Nothing matches these filters." : `You have no ${info.plural.toLowerCase()} yet. Use one from the ${info.library}, or create your own.`}
          />
        </>
      )}
    </div>
  );
}
