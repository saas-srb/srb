import { redirect } from "next/navigation";
import { CheckCircle2, Eye, FileText, Send, XCircle } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import CloneTable, { type CloneRow } from "@/components/products/contractflow-ai/CloneTable";
import { lpmsCan } from "@/lib/lpms-roles";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { cloneCapabilities, listClones } from "@/lib/products/contractflow-ai/clones";
import { cfSigners } from "@/lib/products/contractflow-ai/cf-db";
import { ITEM_KIND_INFO, SEND_STATE_LABEL, SEND_STATES, type ItemKind, type SendState } from "@/lib/products/playbook-ai/items-types";

const CF_TITLE: Record<ItemKind, string> = { sop: "SOPs", document: "Documents", kpi: "KPIs" };

/** ContractFlow's SOPs, Documents and KPIs lists: what Playbook sent, with status, tracking and the row actions. */
export default async function CloneListPage({ kind, searchParams }: { kind: ItemKind; searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const v = await getViewer();
  if (!v) redirect("/contractflow-ai/login");
  const info = ITEM_KIND_INFO[kind];
  const clones = await listClones(v, { kind, limit: 500 });

  const requestIds = clones.filter((c) => c.status === "sent" && c.requestId).map((c) => c.requestId as string);
  const viewed = new Set<string>();
  if (requestIds.length) for (const s of await (await cfSigners()).find({ requestId: { $in: requestIds }, documentViewedAt: { $ne: null } }, { projection: { requestId: 1 } } as never).toArray()) viewed.add(s.requestId);

  const stateOf = (c: (typeof clones)[number]): SendState => (c.status === "sent" && c.requestId && viewed.has(c.requestId) ? "viewed" : ((SEND_STATES as readonly string[]).includes(c.status) ? (c.status as SendState) : "clone_draft"));
  const q = (sp.q ?? "").trim().toLowerCase();
  const tab = ["all", "draft", "out", "signed", "closed"].includes(sp.tab ?? "") ? (sp.tab as string) : "all";
  const group = (s: SendState): string => (s === "clone_draft" || s === "ready" ? "draft" : s === "sent" || s === "viewed" || s === "partially_signed" ? "out" : s === "signed" ? "signed" : "closed");
  const stateFilter = SEND_STATES.includes((sp.status ?? "") as SendState) ? (sp.status as SendState) : null;

  const all = clones.filter((c) => !q || `${c.title} ${c.party.displayName}`.toLowerCase().includes(q)).filter((c) => !stateFilter || stateOf(c) === stateFilter);
  const counts = { all: all.length, draft: 0, out: 0, signed: 0, closed: 0 };
  for (const c of all) counts[group(stateOf(c)) as "draft" | "out" | "signed" | "closed"]++;
  const shown = all.filter((c) => tab === "all" || group(stateOf(c)) === tab);

  const rows: CloneRow[] = shown.map((c) => {
    const cap = cloneCapabilities(v, c);
    const st = stateOf(c);
    return {
      id: c._id, title: c.title, kind: c.kind ?? "document", state: st, partyName: c.party.displayName, partyType: c.party.type, partyId: c.party.partyId,
      updatedAt: c.updatedAt.toISOString(), requestId: c.requestId, signerPlan: c.signerPlan.map((s) => ({ name: s.name, email: s.email, role: s.role })),
      canEdit: cap.edit, canSend: lpmsCan({ roles: v.roles, permissionOverrides: v.overrides }, "SIGN") && (st === "clone_draft" || st === "ready"),
      canVoid: cap.void, canDelete: lpmsCan({ roles: v.roles, permissionOverrides: v.overrides }, "EDIT") && !cap.locked, replaces: !!c.replaces,
    };
  });

  const base = `/contractflow-ai/${info.segment}`;
  const href = (t: string) => { const p = new URLSearchParams(); if (sp.q) p.set("q", sp.q); if (sp.status) p.set("status", sp.status); if (t !== "all") p.set("tab", t); const s = p.toString(); return s ? `${base}?${s}` : base; };

  return (
    <div className="space-y-4">
      <PanelPageHeader
        title={<>{CF_TITLE[kind]}</>}
        description={<>{info.plural === "Employee KPIs" ? "Employee KPI sheets" : info.plural} sent here from Playbook. Edit a copy here (Playbook is never changed), then send it to a client, an employee or someone else to sign.</>}
        filters={
          <PanelFilterBar
            title="Search & Filters"
            description="Find a document by title or recipient, or by status"
            fields={[
              { key: "q", label: "Search", type: "search", placeholder: "Title or recipient" },
              { key: "status", label: "Status", type: "select", allLabel: "All statuses", options: SEND_STATES.map((s) => ({ value: s, label: SEND_STATE_LABEL[s] })) },
            ]}
          />
        }
      />
      <KpiGrid>
        <KpiCard label="All" value={counts.all} icon={<FileText className="size-4" />} />
        <KpiCard label="Out for signature" value={counts.out} icon={<Send className="size-4" />} />
        <KpiCard label="Viewed" value={all.filter((c) => stateOf(c) === "viewed").length} icon={<Eye className="size-4" />} />
        <KpiCard label="Signed" value={counts.signed} icon={<CheckCircle2 className="size-4" />} />
      </KpiGrid>
      <PanelTabs
        active={tab}
        tabs={[
          { key: "all", label: "All", href: href("all"), count: counts.all },
          { key: "draft", label: "Drafts", href: href("draft"), count: counts.draft },
          { key: "out", label: "Out for signature", href: href("out"), count: counts.out },
          { key: "signed", label: "Signed", href: href("signed"), count: counts.signed },
          { key: "closed", label: "Rejected, expired or voided", href: href("closed"), count: counts.closed, icon: <XCircle className="size-3.5" /> },
        ]}
      />
      <CloneTable rows={rows} emptyText={q || stateFilter || tab !== "all" ? "Nothing matches these filters." : `Nothing has been sent here yet. In Playbook, open a ${info.singular.toLowerCase()} and choose Send to ContractFlow.`} />
    </div>
  );
}
