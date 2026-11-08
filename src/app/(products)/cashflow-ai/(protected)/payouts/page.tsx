import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { ArrowUpRight, Clock, AlertCircle } from "lucide-react";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PayoutDesk, { type DeskRow } from "@/components/products/cashflow-ai/PayoutDesk";
import { resolveRazorpayCredentials } from "@/lib/platform/integrations/payments";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { isFmsAdmin } from "@/lib/fms-roles";
import { getPaymentControls } from "@/lib/products/cashflow-ai/payment-controls";
import { paymentHealth } from "@/lib/products/cashflow-ai/payment-health";
import { listPayouts, refreshStalePayouts } from "@/lib/products/cashflow-ai/payments/payouts";

const PURPOSE: Record<string, string> = { vendor_bill: "Vendor bill", refund: "Refund", reimbursement: "Reimbursement", advance: "Advance", other: "Other" };

export default async function PayoutDeskPage() {
  await refreshStalePayouts();
  const health = await paymentHealth().catch(() => []);
  const [payouts, creds, controls, user] = await Promise.all([listPayouts({ limit: 100 }), resolveRazorpayCredentials("payouts"), getPaymentControls(), getCurrentFmsUser()]);
  const paid = payouts.filter((p) => p.status === "processed");
  const rows: DeskRow[] = payouts.map((p) => ({
    _id: p._id,
    payeeName: p.payeeName,
    detail: p.upiId ?? `${p.mode} to ••${p.accountLast4 ?? ""}`,
    amount: p.amount,
    purpose: PURPOSE[p.purpose] ?? p.purpose,
    status: p.status,
    utr: p.utr,
    failureReason: p.failureReason,
    at: p.createdAt.toLocaleDateString("en-IN"),
    canRetry: p.status === "queued" && !p.providerPayoutId,
    startedBy: p.createdBy ?? "",
  }));

  return (
    <div className="relative space-y-6">
      <PanelPageHeader
        title={<>Payments</>}
        description={<>Every payment the company makes goes out through your RazorpayX account. A payment shows as paid, with its UTR, only when Razorpay confirms it. <Link href="/commandos/settings/payments#payroll-bank" className="underline">Top up and bank accounts</Link></>}
      />
      {health.some((h) => h.level !== "ok") && (
        <details open={health.some((h) => h.level === "fail")} className="rounded-lg border bg-card">
          <summary className="cursor-pointer p-4 text-sm font-semibold">Payment setup check: {health.filter((h) => h.level === "fail").length} to fix, {health.filter((h) => h.level === "warn").length} to look at</summary>
          <ul className="divide-y border-t">
            {health.map((h) => (
              <li key={h.key} className="flex gap-3 p-4 text-sm">
                <span className={`mt-0.5 size-2.5 shrink-0 rounded-full ${h.level === "ok" ? "bg-emerald-500" : h.level === "warn" ? "bg-amber-500" : "bg-destructive"}`} />
                <div><p className="font-medium">{h.title}</p><p className="text-xs text-muted-foreground">{h.detail}</p></div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <KpiGrid>
        <KpiCard label="Paid" value={paid.reduce((n, p) => n + p.amount, 0)} format="currency" icon={<ArrowUpRight className="size-4" />} />
        <KpiCard label="On their way" value={payouts.filter((p) => p.status === "processing" || p.status === "queued").length} icon={<Clock className="size-4" />} />
        <KpiCard label="Failed or returned" value={payouts.filter((p) => p.status === "failed" || p.status === "reversed").length} icon={<AlertCircle className="size-4" />} />
      </KpiGrid>
      <PayoutDesk rows={rows} connected={!!creds} userId={user?.id ?? ""} controls={{ perPayoutMax: controls.perPayoutMax, dailyMax: controls.dailyMax, salaryDailyMax: controls.salaryDailyMax, approvalThreshold: controls.approvalThreshold, requireCode: controls.requireCode, payeeHoldHours: controls.payeeHoldHours }} isOwner={!!user && isFmsAdmin(user)} />
    </div>
  );
}
