import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VerifyDetailsForm } from "@/components/products/cashflow-ai/vendor-controls/VerifyDetailsForm";
import { MsmeDaysForm, MsmeVendorForm } from "@/components/products/cashflow-ai/vendor-controls/MsmeForms";
import { AdjustAdvanceForm, NewAdvanceForm, RefundAdvanceForm } from "@/components/products/cashflow-ai/vendor-controls/AdvanceForms";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canApproveTransactions, canManageCompliance } from "@/lib/fms-roles";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { istToday, MSME_LABEL, VERIFY_METHODS, verifierProblem } from "@/lib/products/cashflow-ai/vendor-controls/core";
import { listAdvances, listBankReview, listMsmeBills, listMsmeVendors, listOpenBills, listVendorChoices } from "@/lib/products/cashflow-ai/vendor-controls/store";

const dmy = (d: string) => d.split("-").reverse().join("-");
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const STATE: Record<string, { label: string; cls: string }> = {
  overdue: { label: "Past due", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
  due_soon: { label: "Due within 7 days", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  on_time: { label: "On time", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
  unconfirmed: { label: "Days not confirmed", cls: "bg-muted text-muted-foreground" },
};

export default async function VendorControlsPage() {
  const user = await getCurrentFmsUser();
  const today = istToday();
  const [review, msme, msmeVendors, advances, vendors] = await Promise.all([listBankReview(), listMsmeBills(today), listMsmeVendors(), listAdvances(), listVendorChoices()]);
  const openAdvances = advances.filter((a) => a.status === "open");
  const billsByVendor = await listOpenBills([...new Set(openAdvances.map((a) => a.vendorId))]);
  const awaiting = review.rows.filter((r) => r.status === "awaiting");
  const unusable = [...review.rows.filter((r) => r.status === "awaiting" && !r.verifiedLast4).map((r) => ({ vendorId: r.vendorId, name: r.name, why: "New details are waiting for a second person to verify them." })), ...review.noDetails.map((v) => ({ ...v, why: "No bank details saved yet." }))];
  const notChecked = review.rows.filter((r) => r.status === "verified" && r.baseline);
  const late = msme.bills.filter((b) => b.state === "overdue");
  const soon = msme.bills.filter((b) => b.state === "due_soon");
  const canVerifyRole = user ? canApproveTransactions(user) : false;
  const msmeById = new Map(msmeVendors.map((m) => [m.vendorId, m]));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Vendor controls" }]}
        title={<>Vendor Controls</>}
        description={<>Checks that protect vendor payments: a changed bank account is paid only after a second person verifies it with the vendor, small-business (MSME) bills are watched against their payment days, and advances and deposits paid to vendors are tracked until they are used or returned.</>}
      />

      <KpiGrid>
        <KpiCard label="Bank details to verify" value={<span>{awaiting.length}</span>} tone={awaiting.length ? "down" : undefined} accent />
        <KpiCard label="MSME bills past due" value={<span>{msme.days === null ? "—" : late.length}</span>} tone={late.length ? "down" : undefined} />
        <KpiCard label="Advances and deposits open" value={<span>{formatMoney(openAdvances.reduce((n, a) => n + a.remaining, 0))}</span>} />
        <KpiCard label="Vendors that cannot be paid yet" value={<span>{unusable.length}</span>} tone={unusable.length ? "down" : undefined} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Bank details waiting for verification ({awaiting.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {awaiting.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No vendor&apos;s bank details are waiting. When anyone changes a vendor&apos;s account, IFSC or UPI id, it appears here and nothing is paid to the new details until someone else checks them with the vendor.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {awaiting.map((r) => {
                const p = r.pending!;
                const own = user ? verifierProblem(user.id, p.changedById) : null;
                return (
                  <li key={r.vendorId} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{r.name}</span>
                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Waiting for verification</Badge>
                    </div>
                    <p className="text-sm">
                      New account ending <b>{p.last4 || "—"}</b>{p.ifsc ? <> (IFSC {p.ifsc})</> : null}{p.upiSet ? <>, UPI id saved</> : null}, changed by {p.changedBy ?? "a team member"} on {when(p.changedAt)}.{" "}
                      {r.verifiedLast4 ? <>Payments keep going to the old verified account ending <b>{r.verifiedLast4}</b> until this is verified.</> : <>This vendor cannot be paid until this is verified.</>}
                    </p>
                    <p className="text-xs text-muted-foreground">Phone the vendor on a number you already had (not one from the same email or message that asked for the change) and confirm the account. Then record it here.</p>
                    <VerifyDetailsForm vendorId={r.vendorId} token={p.token} methods={VERIFY_METHODS.map((m) => ({ value: m.value, label: m.label }))} blockedReason={!canVerifyRole ? "Only a finance manager or an owner can verify bank details." : own} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Vendors with no verified bank details ({unusable.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {unusable.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Every vendor has bank details that can be paid.</p>
          ) : (
            <ul className="divide-y divide-border/40 text-sm">
              {unusable.map((v) => <li key={v.vendorId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"><span>{v.name}</span><span className="text-xs text-muted-foreground">{v.why}</span></li>)}
            </ul>
          )}
          {notChecked.length > 0 && (
            <p className="border-t border-border/40 px-4 py-3 text-xs text-muted-foreground">
              {notChecked.length} vendor{notChecked.length === 1 ? "" : "s"} can be paid on details that were entered once and never changed, but no one has independently checked them: {notChecked.map((r) => r.name).join(", ")}. Entering the details again as a change will ask for a check.
            </p>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>MSME vendors: bills to pay on time</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <MsmeDaysForm current={msme.days} canEdit={user ? canManageCompliance(user) : false} />
          <p className="text-xs text-muted-foreground">
            {msme.days === null ? "Payment days are not confirmed, so no bill is marked late. " : ""}The due date is counted from the bill date, as the day the bill was accepted is not recorded; if your CA counts from acceptance, add that gap to the days.
          </p>
          {msme.bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">{msmeVendors.length === 0 ? "No vendor is marked as an MSME yet. Add one below." : "No unpaid bill from an MSME vendor."}</p>
          ) : (
            <ul className="divide-y divide-border/40 rounded-lg border border-border/60 text-sm">
              {msme.bills.map((b) => (
                <li key={b.billId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>{b.vendorName} · bill {b.billNumber} <span className="text-xs text-muted-foreground">({MSME_LABEL[b.category]}, dated {dmy(b.billDate)})</span></span>
                  <span className="flex items-center gap-2">
                    {formatMoney(b.outstanding)}
                    <span className="text-xs text-muted-foreground">{b.dueBy ? `pay by ${dmy(b.dueBy)}${b.daysLate ? `, ${b.daysLate} day${b.daysLate === 1 ? "" : "s"} late` : ""}` : "no date yet"}</span>
                    <Badge className={STATE[b.state].cls}>{STATE[b.state].label}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {msme.days !== null && (late.length > 0 || soon.length > 0) && <p className="text-xs text-muted-foreground">{late.length} past due and {soon.length} due within 7 days.</p>}
          <div className="border-t border-border/40 pt-3">
            <p className="mb-2 text-sm font-medium">Mark a vendor as an MSME</p>
            <MsmeVendorForm vendors={vendors.map((v) => ({ ...v, category: msmeById.get(v.id)?.category, udyam: msmeById.get(v.id)?.udyam }))} />
            {msmeVendors.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Marked: {msmeVendors.map((m) => `${m.name} (${MSME_LABEL[m.category].split(" ")[0].toLowerCase()}, ${m.udyam})`).join("; ")}.</p>}
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Advances and security deposits</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">A register of money paid to a vendor ahead of a bill, or held as a deposit. It only records them: the books are kept on a cash basis, so nothing is posted here. An amount set against a bill is no longer payable on that bill.</p>
          <NewAdvanceForm vendors={vendors} today={today} />
          {advances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border/40 rounded-lg border border-border/60 text-sm">
              {advances.map((a) => (
                <li key={a.id} className="space-y-2 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{a.vendorName} · {a.kind === "deposit" ? "security deposit" : "advance"} <span className="text-xs text-muted-foreground">paid {dmy(a.paidOn)}{a.reference ? ` · ${a.reference}` : ""}</span></span>
                    <span className="flex items-center gap-2">{formatMoney(a.amount)}{a.status === "open" && a.remaining !== a.amount ? <span className="text-xs text-muted-foreground">({formatMoney(a.remaining)} open)</span> : null}
                      <Badge className={a.status === "open" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground"}>{a.status === "open" ? "Open" : a.status === "adjusted" ? "Adjusted" : "Refunded"}</Badge>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.purpose}</p>
                  {a.adjustments.length > 0 && <p className="text-xs text-muted-foreground">Adjusted: {a.adjustments.map((j) => `${formatMoney(j.amount)} against bill ${j.billNumber}`).join("; ")}.</p>}
                  {a.refund && <p className="text-xs text-muted-foreground">Refunded {formatMoney(a.refund.amount)} on {dmy(a.refund.on)}{a.refund.note ? `: ${a.refund.note}` : ""}.</p>}
                  {a.status === "open" && (
                    <div className="flex flex-wrap items-center gap-3">
                      <AdjustAdvanceForm advanceId={a.id} remaining={a.remaining} bills={billsByVendor.get(a.vendorId) ?? []} />
                      <RefundAdvanceForm advanceId={a.id} today={today} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Bank detail changes</CardTitle></CardHeader>
        <CardContent className="p-0">
          {review.rows.every((r) => r.history.length === 0) ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border/40 text-sm">
              {review.rows.flatMap((r) => r.history.map((h) => ({ r, h }))).sort((a, b) => b.h.at.localeCompare(a.h.at)).slice(0, 40).map(({ r, h }, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span>{r.name}: {h.kind === "first_entry" ? `first saved, account ending ${h.newLast4}` : h.kind === "verified" ? `account ending ${h.newLast4} verified by ${h.by ?? "a team member"}${h.note ? ` (${h.note})` : ""}` : h.kind === "reverted" ? "changed back to the verified details" : `changed${h.oldLast4 ? ` from account ending ${h.oldLast4}` : ""} to ${h.newLast4}${h.ifscChanged ? ", IFSC changed" : ""}${h.upiChanged ? ", UPI id changed" : ""} by ${h.by ?? "a team member"}`}</span>
                  <span className="text-xs text-muted-foreground">{when(h.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
