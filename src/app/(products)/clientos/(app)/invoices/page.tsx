import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { ReceiptText, Download } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getClientOverview } from "@/lib/products/clientos/client";
import { listPortalInvoicesForClient } from "@/lib/products/cashflow-ai/portal-invoices";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { cn } from "@/lib/utils";
import PayWithCreditsButton from "@/components/products/clientos/PayWithCreditsButton";
import { quoteInvoiceCredits } from "@/lib/wallet/panel-redemption";
import { payInvoiceWithCreditsAction } from "../wallet/pay-actions";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Invoices · {brand} {product:portal}");

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  partially_paid: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  paid: "bg-green-500/15 text-green-600 dark:text-green-400",
  overdue: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export default async function InvoicesPage() {
  const user = await guardPortalPage("client");
  const [data, invoices] = await Promise.all([
    getClientOverview(user.clientId),
    user.clientId ? listPortalInvoicesForClient(user.clientId) : Promise.resolve([]),
  ]);
  const quotes = new Map(await Promise.all(invoices.map(async (i) => [i.invoiceNumber, await quoteInvoiceCredits(user, i.invoiceNumber).catch(() => null)] as const)));
  if (!data) return <EmptyPortalState title="No billing yet" body="Your invoice summary appears here once projects are set up." />;

  const inv = data.invoiceSummary;
  const money = (n: number) => `${inv.currency === "INR" ? "₹" : inv.currency + " "}${Math.round(n).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Invoices" subtitle="Your formal tax invoices and a milestone-billing view of your engagements" />

      <PanelListFilters>
{invoices.length > 0 && (
        <GlassCard>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="size-4" /> Invoices
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Invoice #</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 pr-3 text-right font-medium">Balance</th>
                  <th className="py-2 text-right font-medium">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.invoiceNumber} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 font-mono text-foreground">{i.invoiceNumber}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{i.invoiceDate}</td>
                    <td className="py-2 pr-3">
                      <Badge className={STATUS_BADGE[i.status] ?? "bg-muted text-muted-foreground"}>{i.statusLabel}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">{i.formattedTotal}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{i.formattedBalance}</td>
                    <td className="py-2 text-right">
                      {(quotes.get(i.invoiceNumber)?.usable ?? 0) > 0 && (
                        <div className="mb-1"><PayWithCreditsButton usable={quotes.get(i.invoiceNumber)!.usable} action={payInvoiceWithCreditsAction.bind(null, i.invoiceNumber)} /></div>
                      )}
                      <a
                        href={`/api/clientos/invoices/${i.invoiceNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Download className="size-3.5" /> PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </GlassCard>
      )}

      <div>
        <h2 className="text-sm font-semibold text-foreground">Milestone Billing</h2>
        <p className="text-xs text-muted-foreground">What&apos;s in progress and not yet formally invoiced above.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Contract value", value: inv.contractValue, tone: "" },
          { label: "Billed to date", value: inv.billed, tone: "text-green-600 dark:text-green-400" },
          { label: "In progress", value: inv.inProgress, tone: "" },
          { label: "Outstanding", value: inv.outstanding, tone: "text-foreground" },
        ].map((s) => (
          <GlassCard key={s.label}>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("mt-1 text-lg font-bold", s.tone || "text-foreground")}>{money(s.value)}</p>
            </CardContent>
          </GlassCard>
        ))}
      </div>

      <GlassCard>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="size-4" /> Milestone billing
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Project</th>
                <th className="py-2 pr-3 font-medium">Milestone</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 text-right font-medium">Amount</th>
                <th className="py-2 text-right font-medium">Billed</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">No milestones to bill yet.</td>
                </tr>
              )}
              {inv.lines.map((l, i) => (
                <tr key={i} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3 text-muted-foreground">{l.projectCode}</td>
                  <td className="py-2 pr-3 text-foreground">{l.milestone}</td>
                  <td className="py-2 pr-3 capitalize text-muted-foreground">{l.status.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">{money(l.amount)}</td>
                  <td className="py-2 text-right">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", l.billed ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground")}>
                      {l.billed ? "Yes" : "No"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        The milestone view above is an indicative summary based on completion against each project&apos;s agreed
        value, not a formal invoice — your issued tax invoices are listed at the top of this page.
      </p>
</PanelListFilters>
    </div>
  );
}
