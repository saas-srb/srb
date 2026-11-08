import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { hasTmsStaffRole } from "@/lib/tms-roles";
import { findInstallment, summarise } from "@/lib/products/cohort-ai/payments";
import { getStudent } from "@/lib/products/cohort-ai/students";
import { getProgram } from "@/lib/products/cohort-ai/programs";
import { getBatch } from "@/lib/products/cohort-ai/batches";
import { getTmsSettings } from "@/lib/products/cohort-ai/settings";
import { renderInvoicePdf } from "@/components/products/cohort-ai/InvoicePdf";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ invoiceNumber: string }> };

async function handleGET(_req: Request, { params }: Context) {
  const user = await getCurrentTmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invoiceNumber } = await params;
  const found = await findInstallment(invoiceNumber);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { plan, installment } = found;
  const isStaff = hasTmsStaffRole(user.roles);
  if (!isStaff && user.studentId !== plan.studentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [student, program, batch, settings] = await Promise.all([
    getStudent(plan.studentId),
    getProgram(plan.programId),
    plan.batchId ? getBatch(plan.batchId) : Promise.resolve(null),
    getTmsSettings(),
  ]);
  const { paidAmount, pendingAmount, netFees } = summarise(plan);

  const buffer = await renderInvoicePdf({
    invoiceNumber,
    paidOn: installment.paidOn,
    method: installment.method,
    transactionId: installment.transactionId,
    amount: installment.amount,
    currency: plan.currency,
    totalFees: netFees,
    discount: plan.discount,
    paidToDate: paidAmount,
    pending: pendingAmount,
    studentName: student?.fullName ?? "Unknown",
    studentCode: student?.studentCode ?? null,
    programName: program?.name ?? "Training program",
    batchName: batch?.name ?? null,
    institute: {
      name: settings.institute.name,
      addressLine: settings.institute.addressLine,
      city: settings.institute.city,
      email: settings.institute.email,
      phone: settings.institute.phone,
    },
  });

  await recordPdf({ type: "tms_invoice", ref: invoiceNumber, by: user.email, role: isStaff ? "staff" : "student" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
