import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canRunPayroll } from "@/lib/hrms-roles";
import { searchPayouts } from "@/lib/products/talentos/salary-payouts";
import { isValidPayoutStatus } from "@/lib/products/talentos/payout-status";
import { payoutStatusMeta } from "@/lib/products/talentos/payout-status";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const user = await getCurrentHrmsUser();
  if (!user || !canRunPayroll(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const result = await searchPayouts({
    month: sp.get("month") ?? undefined,
    status: status && isValidPayoutStatus(status) ? status : undefined,
    departmentId: sp.get("department") ?? undefined,
    q: sp.get("q") ?? undefined,
    pageSize: 100,
    page: 1,
  });

  // Paginate through everything for the report.
  const all = [...result.items];
  for (let page = 2; page <= result.totalPages; page++) {
    const next = await searchPayouts({
      month: sp.get("month") ?? undefined,
      status: status && isValidPayoutStatus(status) ? status : undefined,
      departmentId: sp.get("department") ?? undefined,
      q: sp.get("q") ?? undefined,
      pageSize: 100,
      page,
    });
    all.push(...next.items);
  }

  const csv = toCsv(all, [
    { header: "Month", value: (p) => p.month },
    { header: "Employee Code", value: (p) => p.employeeCode },
    { header: "Employee", value: (p) => p.employeeName },
    { header: "Gross", value: (p) => p.grossSalary },
    { header: "Deductions", value: (p) => p.totalDeductions },
    { header: "Net Payable", value: (p) => p.netPayable },
    { header: "Paid Amount", value: (p) => p.paymentAmount },
    { header: "Bank Account", value: (p) => p.bankAccountMasked },
    { header: "Status", value: (p) => payoutStatusMeta(p.status).label },
    { header: "Provider", value: (p) => p.paymentProvider },
    { header: "UTR", value: (p) => p.utr ?? "" },
    { header: "Failure Reason", value: (p) => p.failureReason ?? "" },
    { header: "Paid At", value: (p) => p.paidAt ?? "" },
    { header: "Reconciled At", value: (p) => p.reconciledAt ?? "" },
  ]);

  const filename = `salary-payouts-${sp.get("month") ?? "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
