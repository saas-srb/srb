import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { listAccounts } from "@/lib/products/cashflow-ai/accounts";
import { generalLedgerForAccount } from "@/lib/products/cashflow-ai/reports/general-ledger";
import { formatMoney, normalBalanceSide } from "@/lib/products/cashflow-ai/constants";

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const accountId = sp.account ?? null;
  const dateFrom = sp.dateFrom ? new Date(`${sp.dateFrom}T00:00:00`) : undefined;
  const dateTo = sp.dateTo ? new Date(`${sp.dateTo}T23:59:59`) : undefined;

  const accounts = await listAccounts({ isActive: true });
  const ledger = accountId ? await generalLedgerForAccount(accountId, { dateFrom, dateTo }) : null;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Reports" }, { label: "General Ledger" }]}
        title={<>General Ledger</>}
        description={<>Per-account journal-line detail with a running balance, computed live from posted entries.</>}
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="text-sm">Accounts</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/40">
              {accounts.map((a) => (
                <li key={a._id}>
                  <Link
                    href={`/cashflow-ai/general-ledger?account=${a._id}`}
                    className={`flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/50 ${
                      a._id === accountId ? "bg-muted/60 font-medium text-primary" : "text-foreground"
                    }`}
                  >
                    <span className="text-xs text-muted-foreground">{a.code}</span>
                    {a.name}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </GlassCard>

        <div className="space-y-4">
          {!ledger && (
            <GlassCard>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">Select an account to view its ledger.</CardContent>
            </GlassCard>
          )}

          {ledger && (
            <>
              <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
                <div className="flex items-center gap-3 border-b border-border/40 pb-4">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <CalendarRange className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight text-foreground">Ledger Period</h3>
                    <p className="text-xs text-muted-foreground">Filter this account&apos;s journal-line detail by date range</p>
                  </div>
                </div>
                <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
                  <input type="hidden" name="account" value={accountId ?? ""} />
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">From</label>
                    <Input type="date" name="dateFrom" defaultValue={sp.dateFrom ?? ""} className="h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">To</label>
                    <Input type="date" name="dateTo" defaultValue={sp.dateTo ?? ""} className="h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
                  </div>
                  <Button type="submit" size="sm" variant="secondary">Apply</Button>
                </form>
              </div>

              <GlassCard interactive={false}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Badge variant="secondary">{ledger.accountCode}</Badge>
                    {ledger.accountName}
                    <span className="text-xs font-normal text-muted-foreground">({normalBalanceSide(ledger.accountType)}-normal)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Transaction</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">Opening Balance</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatMoney(ledger.openingBalance)}</TableCell>
                      </TableRow>
                      {ledger.lines.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">No activity in this range.</TableCell>
                        </TableRow>
                      )}
                      {ledger.lines.map((l, i) => (
                        <TableRow key={`${l.entryId}-${i}`}>
                          <TableCell>{new Date(l.entryDate).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {l.transactionId ? (
                              <Link href={`/cashflow-ai/transactions/${l.transactionId}`} className="text-primary hover:underline">
                                {l.transactionNumber}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">{l.description ?? "Period closing entry"}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{l.description ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.side === "debit" ? formatMoney(l.amount) : ""}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.side === "credit" ? formatMoney(l.amount) : ""}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{formatMoney(l.runningBalance)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={5} className="font-medium text-foreground">Closing Balance</TableCell>
                        <TableCell className="text-right tabular-nums font-bold">{formatMoney(ledger.closingBalance)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </GlassCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
