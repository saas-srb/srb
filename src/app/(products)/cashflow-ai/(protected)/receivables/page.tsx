import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { panelNameMap } from "@/lib/platform/panels/store";
import {
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Link2,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { getDb } from "@/lib/mongodb";
import { Badge } from "@/components/ui/badge";
import PaymentLinkDialog from "@/components/products/cashflow-ai/PaymentLinkDialog";
import CopyButton from "@/components/products/cashflow-ai/CopyButton";
import CollectMoneyForm from "@/components/products/cashflow-ai/CollectMoneyForm";

export default async function CollectMoneyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const panelName = await panelNameMap();

  const db = await getDb();

  // Fetch pending customer/student receivables from invoices & payment links
  const pendingInvoices = await db
    .collection("fms_invoices")
    .find({ status: { $in: ["SENT", "PARTIALLY_PAID", "OVERDUE", "pending"] }, deletedAt: null })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();

  // Fetch payment links created
  const activeLinks = await db
    .collection("fms_payment_links")
    .find({ status: "ACTIVE", deletedAt: null })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  const totalOutstanding = pendingInvoices.reduce((sum, inv) => sum + (inv.amount || inv.totalAmount || 0), 0);
  const overdueCount = pendingInvoices.filter((inv) => inv.status === "OVERDUE").length;

  return (
    <div className="relative space-y-6">

      <PanelPageHeader
        title={<>Collect Money</>}
        description={<>Generate 1-click payment links &amp; send instant payment requests to Students (Cohort AI) or Clients (SprintOS).</>}
        actions={
            <Badge variant="outline" className="px-3 py-1.5 text-xs font-semibold bg-primary/10 text-primary border-primary/20">
          <Sparkles className="size-3.5 mr-1" />
          Customers pay through Razorpay
        </Badge>
          }
        />

      <PanelListFilters>

      {/* Summary Cards */}
      <KpiGrid>
        <KpiCard
          label="Total Money to Collect"
          value={totalOutstanding}
          format="currency"
          accent
          icon={<ArrowDownLeft className="size-4" />}
        />
        <KpiCard
          label="Pending Customer Invoices"
          value={pendingInvoices.length}
          icon={<Clock className="size-4" />}
        />
        <KpiCard
          label="Active Payment Links"
          value={activeLinks.length}
          icon={<Link2 className="size-4" />}
        />
        <KpiCard
          label="Overdue Invoices"
          value={overdueCount}
          tone={overdueCount > 0 ? "down" : undefined}
          icon={<AlertCircle className="size-4" />}
        />
      </KpiGrid>

      {/* 1-CLICK INSTANT COLLECT LINK GENERATOR */}
      <GlassCard className="p-5 border-border/40 bg-card/60 backdrop-blur-md">
        <div className="border-b border-border/40 pb-3 mb-4">
          <h3 className="font-bold text-base text-foreground flex items-center gap-2">
            <Plus className="size-4 text-primary" />
            1-Click Collect Money Request
          </h3>
          <p className="text-xs text-muted-foreground">Type student/client name &amp; amount to instantly create and send a payment link</p>
        </div>

        <CollectMoneyForm
          portals={[
            { value: "TMS", label: `${panelName("tms", "TMS")} Student Portal (Course Fee)` },
            { value: "PMS", label: `${panelName("pms", "PMS")} Client Portal (Project Invoice)` },
            { value: "DIRECT", label: "Direct Payment Link (Public URL)" },
          ]}
        />
      </GlassCard>

      {/* ACTIVE PAYMENT LINKS LISTING WITH DIRECT CTA */}
      <GlassCard className="overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Link2 className="size-4 text-primary" />
            Active Collection Links ({activeLinks.length})
          </h3>
          <span className="text-xs text-muted-foreground">Click link to copy or share with customer</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider border-b border-border/40">
              <tr>
                <th className="px-4 py-3">Payer / Customer</th>
                <th className="px-4 py-3">Purpose</th>
                <th className="px-4 py-3">Portal</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action CTA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {activeLinks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No active collection links. Use the form above to generate your first link.
                  </td>
                </tr>
              ) : (
                activeLinks.map((l) => (
                  <tr key={l._id.toString()} className="hover:bg-primary/5 transition-colors">
                    <td className="px-4 py-3 font-bold text-foreground">{l.customerName || "Customer"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.title || "Fee Collection"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="uppercase text-[10px] font-semibold bg-primary/10 text-primary border-primary/20">
                        {l.sourceModule || "DIRECT"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground">₹{(l.amount || 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px]">
                        {l.status || "ACTIVE"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <a
                        href={`/pay/${l.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-3 py-1 text-[11px] font-bold text-foreground hover:bg-primary/10 transition-colors border border-border/60"
                      >
                        Open Link ↗
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* PENDING CUSTOMER & STUDENT INVOICES TABLE WITH DIRECT CTA */}
      <GlassCard className="overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            Pending Money to Collect ({pendingInvoices.length})
          </h3>
          <span className="text-xs text-muted-foreground">Open invoices awaiting student/client payment</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider border-b border-border/40">
              <tr>
                <th className="px-4 py-3">Invoice No</th>
                <th className="px-4 py-3">Payer / Customer</th>
                <th className="px-4 py-3">Source Product</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payment Link</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {pendingInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    All customer and student payments are collected! No pending invoices.
                  </td>
                </tr>
              ) : (
                pendingInvoices.map((inv) => {
                  const isPaid = inv.status === "completed" || inv.status === "reconciled";
                  const isLinkSent = inv.status === "link_sent";
                  const invId = inv._id.toString();
                  return (
                    <tr key={invId} className="hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-foreground">{inv.invoiceNumber || invId.slice(-8)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{inv.customerName || "Customer"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="uppercase text-[10px] font-semibold bg-primary/10 text-primary border-primary/20">
                          {inv.sourceModule || "SprintOS"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground whitespace-nowrap">₹{(inv.amount || inv.totalAmount || 0).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={isPaid ? "default" : isLinkSent ? "secondary" : "outline"}
                          className={`text-[10px] capitalize ${
                            isPaid
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                              : isLinkSent
                              ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20"
                              : ""
                          }`}
                        >
                          {isPaid ? "✓ Paid" : isLinkSent ? "🔗 Link Sent" : inv.status || "pending"}
                        </Badge>
                      </td>
                      {/* Payment Link column */}
                      <td className="px-4 py-3">
                        {inv.paymentLink ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={inv.paymentLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-mono text-primary underline underline-offset-2 hover:opacity-80 truncate max-w-[120px] block"
                            >
                              {inv.paymentLink.replace(/^https?:\/\//, "").slice(0, 22)}…
                            </a>
                            <CopyButton value={inv.paymentLink} label="Link" />
                            <a href={inv.paymentLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
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
                            defaultTitle={`Invoice: ${inv.invoiceNumber || "Payment"}`}
                            defaultCustomerName={inv.customerName || "Customer"}
                            defaultAmount={inv.amount || inv.totalAmount || 0}
                            defaultSourceModule={inv.sourceModule || "DIRECT"}
                            sourceTransactionId={invId}
                            triggerLabel={isLinkSent ? "Resend Link" : "Send Payment Link"}
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
