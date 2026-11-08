import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportPaymentPlans } from "@/lib/products/cohort-ai/payments";
import { getPaymentStatusMeta } from "@/lib/products/cohort-ai/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.tms.payments");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportPaymentPlans({ ids });

  const csv = toCsv(rows, [
    { header: "Student", value: (r) => r.studentName },
    { header: "Program", value: (r) => r.programName },
    { header: "Batch", value: (r) => r.batchName ?? "" },
    { header: "Total Fees", value: (r) => String(r.totalFees) },
    { header: "Discount", value: (r) => String(r.discount) },
    { header: "Paid", value: (r) => String(r.paidAmount) },
    { header: "Pending", value: (r) => String(r.pendingAmount) },
    { header: "Status", value: (r) => getPaymentStatusMeta(r.status).label },
    { header: "Currency", value: (r) => r.currency },
  ]);

  const filename = `admin-tms-payments-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
