import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportExpenses } from "@/lib/products/spendiq/expenses";
import { isValidExpenseStatus } from "@/lib/products/spendiq/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.prms.expenses");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("approvalStatus");
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportExpenses({
    search: sp.get("search") ?? undefined,
    approvalStatus: status && isValidExpenseStatus(status) ? status : undefined,
    ids,
  });

  const csv = toCsv(rows, [
    { header: "Expense Code", value: (r) => r.expenseCode },
    { header: "Category", value: (r) => r.category },
    { header: "Vendor", value: (r) => r.vendorName ?? "" },
    { header: "Department", value: (r) => r.departmentName ?? "" },
    { header: "Amount", value: (r) => String(r.amount) },
    { header: "Total (incl. GST)", value: (r) => String(r.totalAmount) },
    { header: "Currency", value: (r) => r.currency },
    { header: "Status", value: (r) => r.approvalStatus },
    { header: "Raised By", value: (r) => r.raisedByName },
    { header: "Expense Date", value: (r) => new Date(r.expenseDate).toISOString().slice(0, 10) },
  ]);

  const filename = `admin-prms-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
