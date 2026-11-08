import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { panelNameMap } from "@/lib/platform/panels/store";
import { CreditCard, CheckCircle2, Clock, AlertTriangle, RefreshCw, Link as LinkIcon } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { searchPaymentIntents, serializePaymentIntent, PaymentIntentStatus, PaymentSourceModule } from "@/lib/products/cashflow-ai/payments/intents";
import { listPaymentLinks } from "@/lib/products/cashflow-ai/payments/links";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCompanyBrand } from "@/lib/platform/branding";

export default async function FmsPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const panelName = await panelNameMap();
  const brand = await getCompanyBrand();
  const sp = await searchParams;
  await getCurrentFmsUser();

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status as PaymentIntentStatus | undefined;
  const sourceModule = sp.sourceModule as PaymentSourceModule | undefined;

  const [result, activeLinks] = await Promise.all([
    searchPaymentIntents({
      search: sp.search,
      status,
      sourceModule,
      page,
      pageSize: 20,
    }),
    listPaymentLinks({ status: "ACTIVE", pageSize: 50 }),
  ]);

  const totalPayments = result.total;
  const successfulCount = result.items.filter((i) => i.status === "SUCCESS").length;
  const grossCollected = result.items
    .filter((i) => i.status === "SUCCESS")
    .reduce((sum, i) => sum + i.netAmount, 0);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Central Payments" }]}
        title={<>Central Payment Engine</>}
        description={<>Single financial source of truth for all {brand.name} payment operations & collections.</>}
        actions={<><div className="flex items-center gap-2">
          <Link href="/cashflow-ai/payment-links">
            <Button size="sm" variant="outline">
              <LinkIcon className="size-3.5 mr-1" />
              Manage Payment Links
            </Button>
          </Link>
        </div></>}
      />

      <KpiGrid>
        <KpiCard
          label="Total Payment Intents"
          value={totalPayments}
          accent
          icon={<CreditCard className="size-4" />}
        />
        <KpiCard
          label="Successful Payments"
          value={successfulCount}
          tone="up"
          icon={<CheckCircle2 className="size-4" />}
        />
        <KpiCard
          label="Gross Collections (Page)"
          value={<span>{formatMoney(grossCollected)}</span>}
          icon={<Clock className="size-4" />}
        />
        <KpiCard
          label="Active Payment Links"
          value={activeLinks.total}
          icon={<LinkIcon className="size-4" />}
        />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "number", header: "Payment Ref", sortable: true },
          { key: "customer", header: "Customer" },
          { key: "source", header: "Source Module" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "provider", header: "Gateway Provider" },
          { key: "status", header: "Status" },
          { key: "date", header: "Initiated", sortable: true },
        ]}
        rows={result.items.map(serializePaymentIntent).map((pi) => ({
          id: pi._id,
          href: `/cashflow-ai/payments`,
          cells: {
            number: (
              <div>
                <span className="font-mono font-medium">{pi.paymentNumber}</span>
                {pi.receiptNumber && (
                  <p className="text-[10px] text-cyan-500 font-mono">Receipt: {pi.receiptNumber}</p>
                )}
              </div>
            ),
            customer: (
              <div>
                <p className="font-medium text-xs">{pi.customerName}</p>
                <p className="text-[11px] text-muted-foreground">{pi.customerEmail}</p>
              </div>
            ),
            source: (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted uppercase tracking-wider">
                {pi.sourceModule} ({pi.sourceType})
              </span>
            ),
            amount: (
              <div>
                <p className="font-bold">{formatMoney(pi.netAmount, pi.currency)}</p>
                {pi.walletCreditsUsed > 0 && (
                  <p className="text-[10px] text-amber-500">Includes {pi.walletCreditsUsed} Wallet Credits</p>
                )}
              </div>
            ),
            provider: (
              <span className="capitalize text-xs font-medium text-muted-foreground">
                {pi.paymentProvider}
              </span>
            ),
            status: (
              <Badge
                className={
                  pi.status === "SUCCESS"
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : pi.status === "FAILED"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                }
              >
                {pi.status}
              </Badge>
            ),
            date: formatDate(pi.initiatedAt),
          },
        }))}
        filters={[
          {
            key: "sourceModule",
            label: "Source Module",
            value: sp.sourceModule ?? "",
            options: [
              { value: "Cohort AI", label: panelName("tms", "Cohort AI (Training)") },
              { value: "SprintOS", label: panelName("pms", "SprintOS (Projects)") },
              { value: "SpendIQ", label: panelName("prms", "SpendIQ (Procurement)") },
              { value: "PORTAL", label: "Client Portal" },
              { value: "OFFERS", label: "Offers Engine" },
              { value: "DIRECT", label: "Direct Payment Link" },
            ],
          },
          {
            key: "status",
            label: "Status",
            value: sp.status ?? "",
            options: [
              { value: "SUCCESS", label: "Success" },
              { value: "PENDING", label: "Pending" },
              { value: "FAILED", label: "Failed" },
              { value: "CREATED", label: "Created" },
            ],
          },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Payment number, customer name, email, UTR"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No payment intents match these filters."
      />
    </div>
  );
}
