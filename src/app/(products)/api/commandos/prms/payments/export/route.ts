import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportPayments } from "@/lib/products/spendiq/payments";
import { toCsv } from "@/lib/csv";

const VALID_STATUSES = ["scheduled", "processed", "failed"] as const;

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.prms.payments");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportPayments({
    search: sp.get("search") ?? undefined,
    status: (VALID_STATUSES as readonly string[]).includes(status ?? "") ? (status as (typeof VALID_STATUSES)[number]) : undefined,
    ids,
  });

  const csv = toCsv(rows, [
    { header: "Payment Code", value: (r) => r.paymentCode },
    { header: "Invoice Number", value: (r) => r.invoiceNumber },
    { header: "Vendor", value: (r) => r.vendorName },
    { header: "Amount", value: (r) => String(r.amount) },
    { header: "TDS Deducted", value: (r) => String(r.tdsDeducted) },
    { header: "Method", value: (r) => r.method },
    { header: "Transaction Reference", value: (r) => r.transactionReference ?? "" },
    { header: "Status", value: (r) => r.status },
    { header: "Payment Date", value: (r) => r.paymentDate.toISOString().slice(0, 10) },
  ]);

  const filename = `admin-prms-payments-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
