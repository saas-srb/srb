import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { listPartyOverview, CONFIRMATION_STATUSES } from "@/lib/products/cashflow-ai/party-recon/store";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
const dmy = (d: string) => d.split("-").reverse().join("-");
const STATUS_LABEL = Object.fromEntries(CONFIRMATION_STATUSES.map((s) => [s.value, s.label]));
const STATUS_TONE: Record<string, string> = {
  agreed: "bg-green-500/15 text-green-700 dark:text-green-400",
  disputed: "bg-destructive/15 text-destructive",
  requested: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  written_off: "bg-muted text-muted-foreground",
};

export default async function PartyReconciliationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const kind = sp.kind === "vendor" ? "vendor" : "customer";
  const page = Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1);
  const search = (sp.search ?? "").slice(0, 80);
  const data = await listPartyOverview(kind, { page, pageSize: PAGE_SIZE, search });
  const href = (over: Record<string, string>) => {
    const q = new URLSearchParams({ kind, ...(search ? { search } : {}), ...over });
    return `/cashflow-ai/party-reconciliation?${q.toString()}`;
  };
  const owe = kind === "customer" ? "Owes us" : "We owe";

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Party reconciliation" }]}
        title={<>Customer &amp; vendor reconciliation</>}
        description={<>For each customer and vendor: what the books say is owed, how overdue it is, what looks wrong, and whether they have confirmed the figure. Balances are worked out from invoices, receipts, bills, payments and notes, in rupees only.</>}
      />

      <p className="text-xs text-muted-foreground">
        When accrual books are switched on in <Link href="/cashflow-ai/settings/accrual" className="text-primary hover:underline">accrual settings</Link>, the ledger&apos;s Receivable and Payable accounts can be compared with the totals on this page.
      </p>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-1.5">
          {(["customer", "vendor"] as const).map((k) => (
            <Link key={k} href={`/cashflow-ai/party-reconciliation?kind=${k}`} aria-current={kind === k ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", kind === k ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary")}>
              {k === "customer" ? "Customers" : "Vendors"}
            </Link>
          ))}
        </div>
        <form method="get" className="flex items-end gap-2">
          <input type="hidden" name="kind" value={kind} />
          <input name="search" defaultValue={search} placeholder="Name or code" maxLength={80} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" />
          <Button type="submit" size="sm" variant="secondary">Search</Button>
        </form>
      </div>

      <GlassCard interactive={false}>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{kind === "customer" ? "Customer" : "Vendor"}</TableHead>
                <TableHead className="text-right">{owe}</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead>Checks</TableHead>
                <TableHead>Their confirmation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">{search ? "No one matches that search." : `No ${kind}s yet.`}</TableCell></TableRow>
              )}
              {data.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/cashflow-ai/party-reconciliation/${kind}/${r.id}`} className="font-medium hover:text-primary hover:underline">{r.name}</Link>
                    <div className="text-xs text-muted-foreground">{r.code}</div>
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.balance < 0 && "text-destructive")}>{formatMoney(r.balance)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.overdue > 0 ? formatMoney(r.overdue) : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.unusual && <Badge className="bg-destructive/15 text-destructive">{kind === "customer" ? "Credit balance" : "Debit balance"}</Badge>}
                      {r.badFlags > (r.unusual ? 1 : 0) && <Badge className="bg-destructive/15 text-destructive">Needs fixing</Badge>}
                      {r.warnFlags > 0 && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">{r.warnFlags} to review</Badge>}
                      {!r.unusual && r.badFlags === 0 && r.warnFlags === 0 && <span className="text-xs text-muted-foreground">Nothing found</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.confirmation ? (
                      <div className="space-y-0.5">
                        <Badge className={STATUS_TONE[r.confirmation.status]}>{STATUS_LABEL[r.confirmation.status]}</Badge>
                        <div className="text-xs text-muted-foreground">as of {dmy(r.confirmation.asOf)}{r.confirmation.difference ? `, difference ${formatMoney(Math.abs(r.confirmation.difference))}` : ""}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not asked</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{data.total} {kind}{data.total === 1 ? "" : "s"} · page {data.page} of {data.totalPages}</span>
        <div className="flex gap-2">
          {data.page > 1 && <Link href={href({ page: String(data.page - 1) })} className="text-primary hover:underline">Previous</Link>}
          {data.page < data.totalPages && <Link href={href({ page: String(data.page + 1) })} className="text-primary hover:underline">Next</Link>}
        </div>
      </div>
    </div>
  );
}
