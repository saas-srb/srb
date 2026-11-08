import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHeader, SectionCard, EmptyState, Notice } from "@/components/products/cybervault/DlmsUi";
import DlmsFilterBar from "@/components/products/cybervault/DlmsFilterBar";
import { getViewer } from "@/lib/products/cybervault/viewer";
import { searchClients } from "@/lib/products/cybervault/access";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, addDaysIso, todayIso } from "@/lib/products/cybervault/db";
import { getSettings } from "@/lib/products/cybervault/settings";
import { getClientStatusMeta } from "@/lib/products/sprintos/constants";
import type { SearchParams } from "@/lib/products/cybervault/page";

async function countsByClient(ids: string[]) {
  const db = await getDb();
  const settings = await getSettings();
  const today = todayIso();
  const soon = addDaysIso(today, settings.warnDays);
  const out = new Map<string, { credentials: number; documents: number; links: number; notes: number; expiring: number }>();
  for (const id of ids) out.set(id, { credentials: 0, documents: 0, links: 0, notes: 0, expiring: 0 });
  if (ids.length === 0) return out;
  const spec = [
    ["credentials", COLLECTIONS.credentials],
    ["documents", COLLECTIONS.documents],
    ["links", COLLECTIONS.links],
    ["notes", COLLECTIONS.notes],
  ] as const;
  await Promise.all(
    spec.map(async ([key, col]) => {
      const rows = await db
        .collection(col)
        .aggregate<{ _id: string; n: number; exp: number }>([
          { $match: { scope: "client", clientId: { $in: ids }, deletedAt: null, status: "active" } },
          { $group: { _id: "$clientId", n: { $sum: 1 }, exp: { $sum: { $cond: [{ $and: [{ $ne: ["$expiryDate", null] }, { $lte: ["$expiryDate", soon] }] }, 1, 0] } } } },
        ])
        .toArray();
      for (const r of rows) {
        const o = out.get(r._id);
        if (o) {
          o[key] = r.n;
          o.expiring += r.exp;
        }
      }
    })
  );
  return out;
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/cybervault/login");
  const sp = await searchParams;
  // The client list is the PMS client master, narrowed to what this viewer may see. DLMS creates no clients of its own.
  const { items } = await searchClients({ search: sp.q?.trim() || undefined, pageSize: 100, sortBy: "companyName", sortDir: "asc" });
  const visible = viewer.seesAll ? items : items.filter((c) => viewer.clientIds.includes(c._id));
  const counts = await countsByClient(visible.map((c) => c._id));

  return (
    <div className="space-y-4">
      <PageHeader title="Clients Vault" crumbs={[{ label: "Clients" }]} description="Each client has one vault profile: credentials, URLs, documents, notes and expiry. Clients themselves are managed in the client master (SprintOS)." />
      <DlmsFilterBar fields={[{ key: "q", label: "Search", type: "search", placeholder: "Client name or code…" }]} values={{ q: sp.q ?? "" }} />
      {!viewer.seesAll && <Notice tone="info">Showing the clients you have been assigned to.</Notice>}
      <SectionCard title={`${visible.length} client${visible.length === 1 ? "" : "s"}`}>
        {visible.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title="No clients to show">
            {viewer.seesAll ? "Add clients in the SprintOS client master and they appear here." : "A CyberVault manager can assign clients to you under Settings."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Credentials</TableHead>
                  <TableHead className="text-right">URLs</TableHead>
                  <TableHead className="text-right">Documents</TableHead>
                  <TableHead className="text-right">Notes</TableHead>
                  <TableHead className="text-right">Expiring / expired</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => {
                  const n = counts.get(c._id)!;
                  const meta = getClientStatusMeta(c.status);
                  return (
                    <TableRow key={c._id}>
                      <TableCell>
                        <Link href={`/cybervault/clients/${c._id}`} className="font-medium hover:text-primary">{c.companyName}</Link>
                        <p className="text-[11px] text-muted-foreground">{c.clientCode}{c.industry ? ` · ${c.industry}` : ""}</p>
                      </TableCell>
                      <TableCell><Badge className={meta.badgeClass}>{meta.label}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{n.credentials}</TableCell>
                      <TableCell className="text-right tabular-nums">{n.links}</TableCell>
                      <TableCell className="text-right tabular-nums">{n.documents}</TableCell>
                      <TableCell className="text-right tabular-nums">{n.notes}</TableCell>
                      <TableCell className="text-right tabular-nums">{n.expiring > 0 ? <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">{n.expiring}</Badge> : "—"}</TableCell>
                      <TableCell className="text-right"><Link href={`/cybervault/clients/${c._id}`} aria-label={`Open ${c.companyName}`}><ChevronRight className="size-4 text-muted-foreground" /></Link></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
