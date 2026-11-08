import PanelTabs from "@/components/platform/panel/PanelTabs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import ConfirmDelete from "@/components/products/playbook-ai/ConfirmDelete";
import CsvImportDialog from "@/components/products/rankmax-ai/CsvImportDialog";
import { PageHeader, SectionCard, Position, PositionChange, EmptyState, TrustBadge, fmtNum } from "@/components/products/rankmax-ai/SeoUi";
import { keywordFields, keywordInitial } from "@/components/products/rankmax-ai/keyword-fields";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { listKeywords, listGroups, detectCannibalization, isLongTail } from "@/lib/products/rankmax-ai/keywords";
import { getSettings } from "@/lib/products/rankmax-ai/settings";
import { listSeoUsers } from "@/lib/products/rankmax-ai/people";
import { saveKeywordAction, importKeywordsAction, saveGroupAction, deleteGroupAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { cn } from "@/lib/utils";

const TABS = [
  ["keywords", "Keywords"],
  ["groups", "Groups & clusters"],
  ["cannibalization", "Cannibalization"],
] as const;

const KIND_LABEL = { duplicate_target: "Same keyword, different targets", shared_focus: "Shared focus keyword", search_split: "Search Console split", wrong_page: "Wrong page ranking" } as const;

export default async function KeywordsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "keywords";
  const [settings, groups, users] = await Promise.all([getSettings(), listGroups(), listSeoUsers()]);
  const groupOpts = groups.map((g) => ({ value: g._id, label: g.name }));
  const userOpts = users.map((u) => ({ value: u.id, label: u.label }));
  const canManage = can(viewer, "MANAGE_KEYWORDS");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Keywords"
        crumbs={[{ label: "Keywords" }]}
        description={<>Tracked keywords with intent, targets and positions. Volume, difficulty, CPC and competition are <TrustBadge trust="estimated" /> third-party figures; positions are recorded or synced in Rankings.</>}
        actions={
          canManage && (
            <>
              <CsvImportDialog
                title="Import keywords"
                description="Existing keywords (same keyword, country, device, engine and language) are updated; new ones are added."
                columns="keyword, intent, volume, difficulty, cpc, competition, target_url, target_position, country, language, device, engine, priority, type, group, cluster, related_keywords"
                onImport={async (csv, source) => {
                  "use server";
                  return importKeywordsAction(csv, source);
                }}
              />
              <EditDialog
                trigger={<Button size="sm"><Plus className="size-3.5" data-icon="inline-start" />Add keyword</Button>}
                title="Track a keyword"
                columns={2}
                fields={keywordFields(groupOpts, userOpts)}
                initial={keywordInitial(null, settings.defaults)}
                onSubmit={async (v) => {
                  "use server";
                  return saveKeywordAction(null, v);
                }}
              />
            </>
          )
        }
      />

      <PanelTabs active={tab} tabs={TABS.map(([k, label]) => ({ key: k, label, href: `/rankmax-ai/keywords?tab=${k}` }))} />

      {tab === "keywords" && <KeywordList sp={sp} groups={groups} users={userOpts} canExport={can(viewer, "EXPORT_REPORTS")} />}
      {tab === "groups" && <Groups groups={groups} canManage={canManage} canDelete={can(viewer, "DELETE")} />}
      {tab === "cannibalization" && <Cannibalization />}
    </div>
  );
}

async function KeywordList({ sp, groups, users, canExport }: { sp: Record<string, string | undefined>; groups: { _id: string; name: string; color: string }[]; users: { value: string; label: string }[]; canExport: boolean }) {
  const list = await listKeywords({ ...sp, page: Math.max(Number(sp.page) || 1, 1), pageSize: 40 });
  const gById = new Map(groups.map((g) => [g._id, g]));
  const uById = new Map(users.map((u) => [u.value, u.label]));
  return (
    <FmsDataTable
      columns={[
        { key: "keyword", header: "Keyword", sortable: true },
        { key: "position", header: "Position", sortable: true },
        { key: "change", header: "Change" },
        { key: "best", header: "Best" },
        { key: "target", header: "Target URL" },
        { key: "volume", header: "Volume", sortable: true, align: "right" },
        { key: "difficulty", header: "KD", sortable: true, align: "right" },
        { key: "intent", header: "Intent" },
        { key: "priority", header: "Priority", sortable: true },
        { key: "group", header: "Group / cluster" },
        { key: "market", header: "Market" },
        { key: "assignee", header: "Owner" },
      ]}
      rows={list.items.map((k) => {
        const g = k.groupId ? gById.get(k.groupId) : null;
        return {
          id: k._id,
          href: `/rankmax-ai/keywords/${k._id}`,
          cells: {
            keyword: (
              <span className="flex items-center gap-1.5">
                {k.keyword}
                {k.type === "secondary" && <Badge variant="outline" className="h-4 px-1 text-[9px]">secondary</Badge>}
                {isLongTail(k.keyword) && <Badge variant="outline" className="h-4 px-1 text-[9px]">long-tail</Badge>}
                {k.status !== "tracking" && <Badge className="h-4 bg-muted px-1 text-[9px] text-muted-foreground">{k.status}</Badge>}
              </span>
            ),
            position: <Position value={k.currentPosition} />,
            change: <PositionChange from={k.previousPosition} to={k.currentPosition} />,
            best: k.bestPosition ?? "—",
            target: <span className="block max-w-[180px] truncate text-xs">{k.targetUrl || "—"}{k.rankingUrl && k.targetUrl && k.rankingUrl !== k.targetUrl && <Badge className="ml-1 h-4 bg-amber-500/15 px-1 text-[9px] text-amber-700">other page ranks</Badge>}</span>,
            volume: fmtNum(k.volume),
            difficulty: k.difficulty ?? "—",
            intent: <span className="text-xs capitalize">{k.intent ?? "—"}</span>,
            priority: <Badge className={k.priority === "critical" ? "bg-rose-500/15 text-rose-600" : k.priority === "high" ? "bg-orange-500/15 text-orange-600" : "bg-muted text-muted-foreground"}>{k.priority}</Badge>,
            group: (
              <span className="text-xs">
                {g && <span className="mr-1 inline-block size-2 rounded-full" style={{ background: g.color }} />}
                {g?.name ?? ""}
                {k.cluster && <span className="text-muted-foreground">{g ? " · " : ""}{k.cluster}</span>}
                {!g && !k.cluster && "—"}
              </span>
            ),
            market: <span className="text-xs text-muted-foreground">{k.country} · {k.device} · {k.engine}</span>,
            assignee: <span className="text-xs">{k.assigneeId ? uById.get(k.assigneeId) ?? "—" : "—"}</span>,
          },
        };
      })}
      filters={[
        { key: "position", label: "Position", value: sp.position ?? "", options: [{ value: "top3", label: "Top 3" }, { value: "top10", label: "Top 10" }, { value: "top20", label: "Top 20" }, { value: "top50", label: "Top 50" }, { value: "top100", label: "Top 100" }, { value: "11-20", label: "11–20 (striking)" }, { value: "none", label: "Not ranking" }] },
        { key: "priority", label: "Priority", value: sp.priority ?? "", options: ["low", "medium", "high", "critical"].map((x) => ({ value: x, label: x })) },
        { key: "intent", label: "Intent", value: sp.intent ?? "", options: ["informational", "navigational", "commercial", "transactional"].map((x) => ({ value: x, label: x })) },
        { key: "group", label: "Group", value: sp.group ?? "", options: [{ value: "none", label: "No group" }, ...groups.map((g) => ({ value: g._id, label: g.name }))] },
        { key: "type", label: "Type", value: sp.type ?? "", options: [{ value: "primary", label: "Primary" }, { value: "secondary", label: "Secondary" }] },
        { key: "longTail", label: "Long-tail", value: sp.longTail ?? "", options: [{ value: "yes", label: "Long-tail (4+ words)" }, { value: "no", label: "Head terms" }] },
        { key: "device", label: "Device", value: sp.device ?? "", options: [{ value: "desktop", label: "Desktop" }, { value: "mobile", label: "Mobile" }] },
        { key: "status", label: "Status", value: sp.status ?? "", options: [{ value: "tracking", label: "Tracking" }, { value: "paused", label: "Paused" }, { value: "archived", label: "Archived" }] },
      ]}
      search={sp.search ?? ""}
      searchPlaceholder="Keyword, cluster or URL"
      sortBy={sp.sortBy}
      sortDir={sp.sortDir}
      page={list.page}
      totalPages={list.totalPages}
      total={list.total}
      exportBase={canExport ? "/api/rankmax-ai/export/keywords" : undefined}
    />
  );
}

async function Groups({ groups, canManage, canDelete }: { groups: { _id: string; name: string; description: string; color: string; count: number }[]; canManage: boolean; canDelete: boolean }) {
  const { items } = await listKeywords({ page: 1, pageSize: 5000 });
  const clusters = new Map<string, { n: number; ranked: number; top10: number; volume: number }>();
  for (const k of items) {
    if (!k.cluster) continue;
    const c = clusters.get(k.cluster) ?? { n: 0, ranked: 0, top10: 0, volume: 0 };
    c.n++;
    if (k.currentPosition !== null) c.ranked++;
    if (k.currentPosition !== null && k.currentPosition <= 10) c.top10++;
    c.volume += k.volume ?? 0;
    clusters.set(k.cluster, c);
  }
  const groupFields = [
    { key: "name", label: "Name", type: "text" as const, maxLength: 80 },
    { key: "color", label: "Color", type: "color" as const },
    { key: "description", label: "Description", type: "textarea" as const },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard
        title="Keyword groups"
        description="Organise keywords by service, product or campaign."
        action={canManage && (
          <EditDialog trigger={<Button size="xs"><Plus className="size-3" data-icon="inline-start" />Group</Button>} title="New keyword group" fields={groupFields} initial={{ name: "", color: "#6366f1", description: "" }} onSubmit={async (v) => { "use server"; return saveGroupAction(null, v); }} />
        )}
      >
        {groups.length === 0 ? <EmptyState title="No groups yet" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Group</TableHead><TableHead className="text-right">Keywords</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g._id}>
                  <TableCell>
                    <Link href={`/rankmax-ai/keywords?group=${g._id}`} className="flex items-center gap-2 font-medium hover:underline"><span className="size-2.5 rounded-full" style={{ background: g.color }} />{g.name}</Link>
                    {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                  <TableCell className="text-right">
                    {canManage && <EditDialog trigger={<Button size="icon-xs" variant="ghost" aria-label="Edit group"><Pencil /></Button>} title="Edit group" fields={groupFields} initial={{ name: g.name, color: g.color, description: g.description }} onSubmit={async (v) => { "use server"; return saveGroupAction(g._id, v); }} />}
                    {canDelete && <ConfirmDelete label="Delete group" what={`group “${g.name}” (its keywords are kept, ungrouped)`} action={async () => { "use server"; return deleteGroupAction(g._id); }} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      <SectionCard title="Keyword clusters" description="Topic clusters (set per keyword). Ranking share shows how much of each topic you own.">
        {clusters.size === 0 ? <EmptyState title="No clusters yet">Set a cluster name on keywords that belong to one topic.</EmptyState> : (
          <Table>
            <TableHeader><TableRow><TableHead>Cluster</TableHead><TableHead className="text-right">Keywords</TableHead><TableHead className="text-right">Ranking</TableHead><TableHead className="text-right">Top 10</TableHead><TableHead className="text-right">Volume</TableHead></TableRow></TableHeader>
            <TableBody>
              {Array.from(clusters.entries()).sort((a, b) => b[1].volume - a[1].volume).map(([name, c]) => (
                <TableRow key={name}>
                  <TableCell><Link href={`/rankmax-ai/keywords?search=${encodeURIComponent(name)}`} className="font-medium hover:underline">{name}</Link></TableCell>
                  <TableCell className="text-right tabular-nums">{c.n}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.ranked}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.top10}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(c.volume)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}

async function Cannibalization() {
  const cases = await detectCannibalization();
  return (
    <SectionCard title={`Keyword cannibalization (${cases.length})`} description="Several of our pages competing for the same query. Pick one page per keyword; merge, differentiate or canonicalise the rest, and point internal links at the winner.">
      {cases.length === 0 ? <EmptyState title="No cannibalization detected">Signals come from tracked keywords, focus keywords, Search Console query/page data and recorded ranking URLs.</EmptyState> : (
        <Table>
          <TableHeader><TableRow><TableHead>Keyword</TableHead><TableHead>Signal</TableHead><TableHead>Competing URLs</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
          <TableBody>
            {cases.map((c, i) => (
              <TableRow key={`${c.kind}-${c.keyword}-${i}`}>
                <TableCell className="font-medium">{c.keyword}</TableCell>
                <TableCell><Badge className={c.kind === "search_split" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}>{KIND_LABEL[c.kind]}</Badge></TableCell>
                <TableCell className="text-xs">{c.urls.map((u) => <div key={u}>{u}</div>)}</TableCell>
                <TableCell className="max-w-md whitespace-normal text-xs text-muted-foreground">{c.detail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
