import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Banknote, CheckCircle2, CalendarClock, FileDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import UnauthorizedNotice from "@/components/products/dealflow-ai/UnauthorizedNotice";
import { PaymentStatusBadge } from "@/components/products/spendiq/StatusBadges";
import PaymentRowActions from "@/components/products/spendiq/PaymentRowActions";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageFinance } from "@/lib/prms-roles";
import { searchPayments, paymentsThisMonth, serializePayment } from "@/lib/products/spendiq/payments";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  if (!user || !canManageFinance(user)) {
    return (
      <div className="space-y-4">
        <UnauthorizedNotice backHref="/spendiq" message="Finance access required to view payments." />
      </div>
    );
  }

  const page = Math.max(Number(sp.page) || 1, 1);
  const [result, vendors, monthTotal] = await Promise.all([
    searchPayments({ search: sp.search, vendorId: sp.vendorId, page, pageSize: 20 }),
    listVendorOptions(),
    paymentsThisMonth(),
  ]);

  const scheduled = result.items.filter((p) => p.status === "scheduled").length;
  const processed = result.items.filter((p) => p.status === "processed").length;
  const vOpts = vendors.map((v) => ({ _id: v._id, companyName: v.companyName }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Payments" }]}
        title={<>Payments</>}
        description={<>{result.total} payment{result.total === 1 ? "" : "s"} recorded against invoices.</>}
      />

      <KpiGrid>
        <KpiCard label="Paid This Month" value={<span>{formatMoney(monthTotal)}</span>} accent icon={<Banknote className="size-4" />} />
        <KpiCard label="Processed (page)" value={processed} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Scheduled (page)" value={scheduled} icon={<CalendarClock className="size-4" />} />
      </KpiGrid>

      <PrmsDataTable
        columns={[
          { key: "code", header: "Payment" },
          { key: "invoice", header: "Invoice" },
          { key: "vendor", header: "Vendor" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "date", header: "Date" },
          { key: "method", header: "Method" },
          { key: "status", header: "Status" },
          { key: "_actions", header: "", align: "right" as const },
        ]}
        rows={result.items.map(serializePayment).map((p) => ({
          id: p._id,
          cells: {
            code: p.paymentCode,
            invoice: <Link className="text-primary hover:underline" href={`/spendiq/invoices/${p.invoiceId}`}>{p.invoiceNumber}</Link>,
            vendor: p.vendorName,
            amount: formatMoney(p.amount),
            date: formatDate(p.paymentDate),
            method: p.method.replace(/_/g, " "),
            status: <PaymentStatusBadge status={p.status} />,
            _actions: (
              <span className="flex items-center justify-end gap-1.5">
                <a href={`/api/spendiq/payments/${p.paymentCode}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "icon-xs" })} aria-label="Receipt PDF">
                  <FileDown className="size-3.5" />
                </a>
                <PaymentRowActions id={p._id} code={p.paymentCode} status={p.status} />
              </span>
            ),
          },
        }))}
        filters={[{ key: "vendorId", label: "Vendor", value: sp.vendorId ?? "", options: vOpts.map((v) => ({ value: v._id, label: v.companyName })) }]}
        search={sp.search ?? ""}
        searchPlaceholder="Payment #, invoice #, vendor"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        exportBase="/api/spendiq/export/payments"
        emptyLabel="No payments recorded yet."
      />
    </div>
  );
}
