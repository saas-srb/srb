import { notFound } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ConfirmationForm from "@/components/products/cashflow-ai/party-recon/ConfirmationForm";
import { ProposeWriteOffForm, WriteOffRowActions } from "@/components/products/cashflow-ai/party-recon/WriteOffPanel";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canApproveTransactions, canReconcile } from "@/lib/fms-roles";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { AGEING_EDGES, AGEING_LABELS, DOC_LABEL, OLD_ITEM_DAYS, isYmd } from "@/lib/products/cashflow-ai/party-recon/core";
import { CONFIRMATION_STATUSES, analysePartyById, defaultFrom, getParty, listConfirmations, listWriteOffs } from "@/lib/products/cashflow-ai/party-recon/store";
import { cn } from "@/lib/utils";

const dmy = (d: string) => d.split("-").reverse().join("-");
const LEVEL: Record<string, string> = { bad: "border-destructive/40 bg-destructive/5", warn: "border-amber-500/40 bg-amber-500/5", info: "border-border bg-muted/30" };
const STATUS_LABEL = Object.fromEntries(CONFIRMATION_STATUSES.map((s) => [s.value, s.label]));

export default async function PartyDetailPage({ params, searchParams }: { params: Promise<{ kind: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ kind: rawKind, id }, sp] = await Promise.all([params, searchParams]);
  if (rawKind !== "customer" && rawKind !== "vendor") notFound();
  const kind = rawKind;
  const party = await getParty(kind, id);
  if (!party) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const to = sp.to && isYmd(sp.to) ? sp.to : today;
  const from = sp.from && isYmd(sp.from) ? sp.from : defaultFrom(to);
  const [user, a, confirmations, writeOffs] = await Promise.all([getCurrentFmsUser(), analysePartyById(kind, id, { from, to }), listConfirmations(kind, id), listWriteOffs(kind, id)]);
  if (!a || !user) notFound();
  const canManage = canReconcile(user);
  const canApprove = canApproveTransactions(user);
  const s = a.statement;
  const word = kind === "customer" ? "invoice" : "bill";
  const owed = kind === "customer" ? "owed to us" : "owed by us";

  // what can still go into the write-off register today, per open item
  const listed = new Map<string, number>();
  for (const w of writeOffs) listed.set(w.docId, (listed.get(w.docId) ?? 0) + w.amount);
  const todaysItems = to === today ? a.ageing.items : [];
  const room = todaysItems
    .filter((i) => i.outstanding > 0 && (i.type === "invoice" || i.type === "bill"))
    .map((i) => ({ docId: i.docId, number: i.number, room: Math.round((i.outstanding - (listed.get(i.docId) ?? 0)) * 100) / 100 }))
    .filter((i) => i.room > 0);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Party reconciliation", href: `/cashflow-ai/party-reconciliation?kind=${kind}` }, { label: party.name }]}
        title={<>{party.name}</>}
        description={<>{party.code} · {kind === "customer" ? "Customer" : "Vendor"} statement of account. Amounts are in rupees; documents in another currency are left out.</>}
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">From<input type="date" name="from" defaultValue={from} className="mt-1 block h-9 rounded-lg border border-border bg-background px-2 text-sm" /></label>
        <label className="text-xs text-muted-foreground">To (also the ageing date)<input type="date" name="to" defaultValue={to} className="mt-1 block h-9 rounded-lg border border-border bg-background px-2 text-sm" /></label>
        <Button type="submit" size="sm" variant="secondary">Show</Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Opening balance", s.opening],
          [kind === "customer" ? "Invoiced and refunded" : "Billed and debit notes", s.totalCharges],
          [kind === "customer" ? "Received and credited" : "Paid", s.totalSettlements],
          ["Closing balance", s.closing],
        ].map(([label, value], i) => (
          <GlassCard key={label as string} interactive={false}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={cn("mt-1 text-xl font-semibold tabular-nums", i === 3 && (value as number) < 0 && "text-destructive")}>{formatMoney(value as number)}</div>
              {i === 3 && <div className="text-xs text-muted-foreground">{owed}, as of {dmy(s.to)}</div>}
            </CardContent>
          </GlassCard>
        ))}
      </div>

      {a.flags.length > 0 ? (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Things to look at</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {a.flags.map((f, i) => <div key={i} className={cn("rounded-lg border px-3 py-2 text-sm", LEVEL[f.level])}>{f.message}</div>)}
          </CardContent>
        </GlassCard>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing unusual found for this {kind}.</p>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>How old is what is open</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Counted from each {word}&apos;s due date as of {dmy(a.ageing.asOf)}. Not yet due means due today or later; the other columns count days past the due date (edges at {AGEING_EDGES.slice(1).join(", ")} days). An item open more than {OLD_ITEM_DAYS} days past due is flagged for review.</p>
          <div className="grid gap-2 sm:grid-cols-5">
            {AGEING_LABELS.map((label, i) => (
              <div key={label} className="rounded-lg border border-border/50 p-2.5">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="font-medium tabular-nums">{formatMoney(a.ageing.buckets[i])}</div>
              </div>
            ))}
          </div>
          {a.ageing.onAccount !== 0 && <p className="text-sm">Not tied to any {word}: <strong>{formatMoney(Math.abs(a.ageing.onAccount))}</strong> {a.ageing.onAccount > 0 ? (kind === "customer" ? "received in advance, less anything returned" : "paid in advance") : "in the other direction"}. Open items less this equals the closing balance.</p>}
          {a.ageing.items.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>{word === "invoice" ? "Invoice" : "Bill"}</TableHead><TableHead>Date</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Original</TableHead><TableHead className="text-right">Open</TableHead><TableHead>Age</TableHead></TableRow></TableHeader>
                <TableBody>
                  {a.ageing.items.map((i) => (
                    <TableRow key={i.docId}>
                      <TableCell className="font-medium">{i.number}</TableCell>
                      <TableCell>{dmy(i.date)}</TableCell>
                      <TableCell>{dmy(i.dueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(i.original)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", i.outstanding < 0 && "text-destructive")}>{formatMoney(i.outstanding)}</TableCell>
                      <TableCell>{AGEING_LABELS[i.bucket]}{i.daysPastDue > 0 ? ` (${i.daysPastDue} days)` : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Statement of account, {dmy(s.from)} to {dmy(s.to)}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Document</TableHead><TableHead>Details</TableHead><TableHead className="text-right">{kind === "customer" ? "Billed" : "Billed by them"}</TableHead><TableHead className="text-right">{kind === "customer" ? "Received" : "Paid"}</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow><TableCell>{dmy(s.from)}</TableCell><TableCell colSpan={2} className="text-muted-foreground">Opening balance</TableCell><TableCell /><TableCell /><TableCell className="text-right tabular-nums">{formatMoney(s.opening)}</TableCell></TableRow>
              {s.lines.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No documents in this period.</TableCell></TableRow>}
              {s.lines.map((l) => (
                <TableRow key={l.docId}>
                  <TableCell>{dmy(l.date)}</TableCell>
                  <TableCell><span className="font-medium">{l.number}</span> <span className="text-xs text-muted-foreground">{DOC_LABEL[l.type]}</span></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.charge ? formatMoney(l.charge) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.settlement ? formatMoney(l.settlement) : ""}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", l.balance < 0 && "text-destructive")}>{formatMoney(l.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold"><TableCell>{dmy(s.to)}</TableCell><TableCell colSpan={2}>Closing balance</TableCell><TableCell className="text-right tabular-nums">{formatMoney(s.totalCharges)}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(s.totalSettlements)}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(s.closing)}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Does the {kind} agree?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ConfirmationForm kind={kind} partyId={id} today={today} statuses={CONFIRMATION_STATUSES.map((x) => ({ value: x.value, label: x.label }))} canManage={canManage} />
          {confirmations.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>As of</TableHead><TableHead className="text-right">Ours</TableHead><TableHead className="text-right">Theirs</TableHead><TableHead className="text-right">Difference</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
                <TableBody>
                  {confirmations.map((c) => (
                    <TableRow key={c._id}>
                      <TableCell>{dmy(c.asOf)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(c.ourBalance)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.theirBalance === null ? "—" : formatMoney(c.theirBalance)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.difference === null ? "—" : formatMoney(c.difference)}</TableCell>
                      <TableCell><Badge className={c.status === "agreed" ? "bg-green-500/15 text-green-700 dark:text-green-400" : c.status === "disputed" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}>{STATUS_LABEL[c.status]}</Badge></TableCell>
                      <TableCell className="max-w-xs text-xs text-muted-foreground">{c.note}{c.explanations.length > 0 && <div className="mt-1 italic">Possible cause: {c.explanations[0]}</div>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>{kind === "customer" ? "Write-offs and doubtful debts" : "Write-backs"} register</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            This register is a record of decisions only. Nothing here changes the {word}, the balance above or the books; the entry in the accounts will be made once invoices and bills are posted to the ledger. Whoever approves must be a different person from whoever proposed it, and your CA should agree the treatment.
          </p>
          {canManage && (to === today ? <ProposeWriteOffForm kind={kind} partyId={id} items={room} /> : <p className="text-xs text-muted-foreground">Set the &quot;To&quot; date back to today to add an entry.</p>)}
          {writeOffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>{word === "invoice" ? "Invoice" : "Bill"}</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Why</TableHead><TableHead>Proposed by</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {writeOffs.map((w) => (
                    <TableRow key={w._id}>
                      <TableCell className="font-medium">{w.docNumber}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(w.amount)}</TableCell>
                      <TableCell className="max-w-xs text-sm">{w.reason}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{w.proposedByEmail ?? w.proposedBy}</TableCell>
                      <TableCell>{w.status === "approved" ? <span className="text-xs">Approved by {w.approvedByEmail ?? w.approvedBy}</span> : <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Waiting for approval</Badge>}</TableCell>
                      <TableCell><WriteOffRowActions id={w._id} status={w.status} proposedByMe={w.proposedBy === user.id} canApprove={canApprove} canManage={canManage} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
