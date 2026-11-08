import PanelTabs from "@/components/platform/panel/PanelTabs";
import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { panelNameMap } from "@/lib/platform/panels/store";
import Link from "next/link";
import {
  Briefcase,
  ArrowRight,
  Receipt,
  FileText,
  Clock,
  CheckCircle2,
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

export default async function PmsFinancePage({
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
    .find({ sourceModule: { $in: ["pms", "projects"] }, deletedAt: null })
    .sort({ transactionDate: -1 })
    .limit(50)
    .toArray();

  const totalReceivables = transactions.reduce((acc, t) => acc + (t.type === "income" ? t.amount || 0 : 0), 0);
  const pendingCount = transactions.filter((t) => t.status === "pending" || t.status === "pending_approval").length;
  const linkSentCount = transactions.filter((t) => t.status === "link_sent").length;
  const collectedCount = transactions.filter((t) => t.status === "completed" || t.status === "reconciled").length;

  return (
    <div className="relative space-y-6">

      <PanelPageHeader
        title={<>{panelName("pms", "SprintOS")} Project Finance</>}
        description={<>Project billing flows from SprintOS → CashFlow to raise client invoices and track collections.</>}
      />


      <PanelListFilters>

      {/* Flow */}
      <GlassCard className="p-4 bg-card/60 border-border/40 backdrop-blur-md">
        <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Workflow</div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground sm:gap-4">
          <span className="px-3 py-1.5 rounded-lg bg-background border border-border/60 text-foreground">Milestone</span>
          <ArrowRight className="size-3.5 text-primary shrink-0" />
          <span className="px-3 py-1.5 rounded-lg bg-background border border-border/60 text-foreground">CashFlow Invoice</span>
          <ArrowRight className="size-3.5 text-primary shrink-0" />
          <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 font-semibold">Link Sent</span>
          <ArrowRight className="size-3.5 text-primary shrink-0" />
          <span className="px-3 py-1.5 rounded-lg bg-primary/15 text-primary font-bold border border-primary/30">Payment ✓</span>
        </div>
      </GlassCard>

      <KpiGrid>
        <KpiCard label="Client Receivables" value={totalReceivables} format="currency" icon={<Receipt className="size-4" />} accent />
        <KpiCard label="Pending" value={pendingCount} icon={<Clock className="size-4" />} tone={pendingCount > 0 ? "down" : undefined} />
        <KpiCard label="Links Sent" value={linkSentCount} icon={<Link2 className="size-4" />} />
        <KpiCard label="Collected" value={collectedCount} icon={<CheckCircle2 className="size-4" />} />
      </KpiGrid>

      <PanelTabs
        label="Transaction type"
        active={tab}
        tabs={[
          { key: "all", label: "All" },
          { key: "billing", label: "Client Billing" },
          { key: "invoices", label: "Invoices" },
          { key: "links", label: "Payment Links" },
          { key: "receivables", label: "Receivables" },
        ].map((item) => ({ ...item, href: `/cashflow-ai/products/pms?tab=${item.key}` }))}
      />

      {/* Table */}
      <GlassCard className="overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Client Billing &amp; Invoices
          </h3>
          <span className="text-xs text-muted-foreground">{transactions.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider border-b border-border/40">
              <tr>
                <th className="px-4 py-3">Txn / Invoice</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Gateway</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payment Link</th>
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
                      <td className="px-4 py-3 font-medium text-foreground">{t.customerName || t.payee || "Client"}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">SprintOS</span>{" "}
                        {t.sourceRecordId || "PRJ-00125"}
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground whitespace-nowrap">
                        ₹{(t.amount || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize whitespace-nowrap">
                        {t.paymentMethod || "Razorpay"}
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
                          {isPaid ? "✓ Collected" : isLinkSent ? "🔗 Link Sent" : t.status || "pending"}
                        </Badge>
                      </td>
                      {/* Payment Link column */}
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
                            <CopyButton value={t.paymentLink} label="Link" />
                            <a href={t.paymentLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                              <ExternalLink className="size-3" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50 text-[10px]">Not generated</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="size-3" />
                            Collected
                          </span>
                        ) : (
                          <PaymentLinkDialog
                            defaultTitle={`Project Billing: ${t.customerName || "Client"}`}
                            defaultCustomerName={t.customerName || t.payee || "Client"}
                            defaultAmount={t.amount || 0}
                            defaultSourceModule="SprintOS"
                            sourceTransactionId={txnId}
                            triggerLabel={isLinkSent ? "Resend Link" : "Send Link"}
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
