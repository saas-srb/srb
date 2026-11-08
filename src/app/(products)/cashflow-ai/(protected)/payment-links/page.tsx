import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Link as LinkIcon, Plus, Copy, CheckCircle, Clock } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { listPaymentLinks, serializePaymentLink, PaymentLinkStatus } from "@/lib/products/cashflow-ai/payments/links";
import { paymentPublicBaseUrl } from "@/lib/products/cashflow-ai/payments/public-url";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import PaymentLinkCreateDialog from "./PaymentLinkCreateDialog";

export default async function PaymentLinksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  await getCurrentFmsUser();

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status as PaymentLinkStatus | undefined;

  const result = await listPaymentLinks({
    search: sp.search,
    status,
    page,
    pageSize: 20,
  });

  const baseUrl = await paymentPublicBaseUrl();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Payment Links" }]}
        title={<>Payment Links</>}
        description={<>Generate secure public payment links (`/pay/[token]`) for direct payment collection.</>}
        actions={<><PaymentLinkCreateDialog /></>}
      />

      <KpiGrid>
        <KpiCard
          label="Total Payment Links"
          value={result.total}
          accent
          icon={<LinkIcon className="size-4" />}
        />
        <KpiCard
          label="Active Links"
          value={result.items.filter((l) => l.status === "ACTIVE").length}
          tone="up"
          icon={<CheckCircle className="size-4" />}
        />
        <KpiCard
          label="Paid Links"
          value={result.items.filter((l) => l.status === "PAID").length}
          icon={<Clock className="size-4" />}
        />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "title", header: "Title & Token" },
          { key: "customer", header: "Customer" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "status", header: "Status" },
          { key: "url", header: "Public Link" },
          { key: "date", header: "Created", sortable: true },
        ]}
        rows={result.items.map(serializePaymentLink).map((pl) => {
          const token = typeof pl.token === "string" ? pl.token : "";
          const publicUrl = token ? `${baseUrl}/pay/${token}` : null;
          return {
            id: pl._id,
            cells: {
              title: (
                <div>
                  <p className="font-bold text-xs">{pl.title}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">Token: {token ? `${token.slice(0, 12)}...` : "Unavailable"}</p>
                </div>
              ),
              customer: (
                <div>
                  <p className="font-medium text-xs">{pl.customerName}</p>
                  <p className="text-[11px] text-muted-foreground">{pl.customerEmail}</p>
                </div>
              ),
              amount: (
                <span className="font-bold">{formatMoney(pl.amount, pl.currency)}</span>
              ),
              status: (
                <Badge
                  className={
                    pl.status === "ACTIVE"
                      ? "bg-green-500/15 text-green-600 dark:text-green-400"
                      : pl.status === "PAID"
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {pl.status}
                </Badge>
              ),
              url: publicUrl ? (
                <a
                  href={`/pay/${token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-mono font-medium"
                >
                  /pay/{token.slice(0, 8)}...
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">Unavailable</span>
              ),
              date: formatDate(pl.createdAt),
            },
          };
        })}
        filters={[
          {
            key: "status",
            label: "Status",
            value: sp.status ?? "",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "PAID", label: "Paid" },
              { value: "EXPIRED", label: "Expired" },
              { value: "CANCELLED", label: "Cancelled" },
            ],
          },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Title, customer name, email, token"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No payment links match these filters."
      />
    </div>
  );
}
