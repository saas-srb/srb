import PanelTabs from "@/components/platform/panel/PanelTabs";
import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { panelNameMap } from "@/lib/platform/panels/store";
import Link from "next/link";
import {
  BookOpen,
  ArrowRight,
  Receipt,
  FileText,
  GraduationCap,
  Clock,
  CheckCircle2,
  RefreshCw,
  Link2,
  ExternalLink,
} from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { getDb } from "@/lib/mongodb";
import { Badge } from "@/components/ui/badge";
import PaymentLinkDialog from "@/components/products/cashflow-ai/PaymentLinkDialog";
import CopyButton from "@/components/products/cashflow-ai/CopyButton";

export default async function TmsFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const panelName = await panelNameMap();
  const sp = await searchParams;
  const tab = sp.tab ?? "all";

  const db = await getDb();

  const transactions = await db
    .collection("fms_transactions")
    .find({ sourceModule: { $in: ["tms", "training"] }, deletedAt: null })
    .sort({ transactionDate: -1 })
    .limit(50)
    .toArray();

  const totalFeeCollected = transactions.reduce((acc, t) => acc + (t.type === "income" ? t.amount || 0 : 0), 0);
  const pendingFeesCount = transactions.filter((t) => t.status === "pending" || t.status === "pending_approval").length;
  const linkSentCount = transactions.filter((t) => t.status === "link_sent").length;
  const collectedCount = transactions.filter((t) => t.status === "completed" || t.status === "reconciled").length;

  return (
    <div className="relative space-y-6">

      <PanelPageHeader
        title={<>{panelName("tms", "Cohort AI Training")} &amp; Student Fees</>}
        description={<>Student enrollments flow from Cohort AI → CashFlow to issue fee invoices, payment links &amp; receipts.</>}
      />


      <PanelListFilters>

      {/* Flow */}
      <GlassCard className="p-4 bg-card/60 border-border/40 backdrop-blur-md">
        <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Workflow</div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground sm:gap-4">
          <span className="px-3 py-1.5 rounded-lg bg-background border border-border/60 text-foreground">Enrollment</span>
          <ArrowRight className="size-3.5 text-primary shrink-0" />
          <span className="px-3 py-1.5 rounded-lg bg-background border border-border/60 text-foreground">CashFlow Invoice</span>
          <ArrowRight className="size-3.5 text-primary shrink-0" />
          <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 font-semibold">Fee Link Sent</span>
          <ArrowRight className="size-3.5 text-primary shrink-0" />
          <span className="px-3 py-1.5 rounded-lg bg-primary/15 text-primary font-bold border border-primary/30">Fee Collected ✓</span>
        </div>
      </GlassCard>

      <KpiGrid>
        <KpiCard label="Fees Collected" value={totalFeeCollected} format="currency" icon={<GraduationCap className="size-4" />} accent />
        <KpiCard label="Pending Fees" value={pendingFeesCount} icon={<Clock className="size-4" />} tone={pendingFeesCount > 0 ? "down" : undefined} />
        <KpiCard label="Links Sent" value={linkSentCount} icon={<Link2 className="size-4" />} />
        <KpiCard label="Refunds Processed" value={1} icon={<RefreshCw className="size-4" />} />
      </KpiGrid>

      <PanelTabs
        label="Transaction type"
        active={tab}
        tabs={[
          { key: "all", label: "All" },
          { key: "fees", label: "Student Fees" },
          { key: "invoices", label: "Invoices" },
          { key: "links", label: "Payment Links" },
          { key: "pending", label: "Pending" },
          { key: "refunds", label: "Refunds" },
        ].map((item) => ({ ...item, href: `/cashflow-ai/products/tms?tab=${item.key}` }))}
      />

      {/* Table */}
      <GlassCard className="overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Student Fee Records
          </h3>
          <span className="text-xs text-muted-foreground">{transactions.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider border-b border-border/40">
              <tr>
                <th className="px-4 py-3">Txn / Invoice</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Fee Link</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No records found. Run <code className="font-mono bg-muted px-1 rounded">npm run fms:seed-realistic</code>
                  </td>
                </tr>
              ) : (
                transactions.map((t) => {
                  const isPaid = t.status === "completed" || t.status === "reconciled";
                  const isLinkSent = t.status === "link_sent";
                  const txnId = t._id.toString();
                  return (
                    <tr key={txnId} className="hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-foreground whitespace-nowrap">
                        {t.referenceNumber || txnId.slice(-8)}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{t.customerName || t.payee || "Student"}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">Cohort AI</span>{" "}
                        {t.sourceRecordId || "ENR-2026"}
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground whitespace-nowrap">
                        ₹{(t.amount || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize whitespace-nowrap">
                        {t.paymentMethod || "UPI / Gateway"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={isPaid ? "default" : isLinkSent ? "secondary" : "outline"}
                          className={`text-[10px] ${
                            isPaid
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                              : isLinkSent
                              ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20"
                              : ""
                          }`}
                        >
                          {isPaid ? "✓ Paid" : isLinkSent ? "🔗 Link Sent" : t.status || "pending"}
                        </Badge>
                      </td>
                      {/* Fee Link column */}
                      <td className="px-4 py-3">
                        {t.paymentLink ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={t.paymentLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-mono text-primary underline underline-offset-2 hover:opacity-80 truncate max-w-[120px] block"
                            >
                              {t.paymentLink.replace(/^https?:\/\//, "").slice(0, 22)}…
                            </a>
                            <CopyButton value={t.paymentLink} label="Fee Link" />
                            <a href={t.paymentLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                              <ExternalLink className="size-3" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50 text-[10px]">Not sent</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="size-3" />
                            Fee Paid
                          </span>
                        ) : (
                          <PaymentLinkDialog
                            defaultTitle={`Training Fee: ${t.customerName || "Student"}`}
                            defaultCustomerName={t.customerName || t.payee || "Student"}
                            defaultAmount={t.amount || 0}
                            defaultSourceModule="Cohort AI"
                            sourceTransactionId={txnId}
                            triggerLabel={isLinkSent ? "Resend Fee Link" : "Send Fee Link"}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
      </PanelListFilters>
    </div>
  );
}
