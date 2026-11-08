import { withTransport } from "@/lib/security/transport";
import { recordPdf } from "@/lib/pdf/activity";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { hasPmsStaffRole } from "@/lib/pms-roles";
import { getDb } from "@/lib/mongodb";
import { getProject, getProjectByCode } from "@/lib/products/sprintos/projects";
import { getClient } from "@/lib/products/sprintos/clients";
import { getPrmsSettings } from "@/lib/products/spendiq/settings";
import {
  renderProjectInvoicePdf,
  renderProjectReceiptPdf,
  type ProjectPdfBillingDetails,
} from "@/components/products/sprintos/ProjectBillingPdf";

type Context = { params: Promise<{ id: string }> };

async function handleGET(req: NextRequest, { params }: Context) {
  const user = await getCurrentPmsUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Invoices and receipts are billing documents: PMS staff only (a project member doesn't see the client's invoice).
  if (!hasPmsStaffRole(user.roles)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const searchParams = req.nextUrl.searchParams;
  const pdfType = searchParams.get("type") === "receipt" ? "receipt" : "invoice";

  const db = await getDb();
  let project = (await getProject(id)) || (await getProjectByCode(id));

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Fetch Client
  let clientName = "Client Organization";
  let clientEmail = undefined;
  if (project.clientId) {
    const client = await getClient(project.clientId);
    if (client) {
      clientName = client.companyName;
      clientEmail = client.primaryContact?.email || undefined;
    }
  }

  // Fetch Milestones
  const milestonesDocs = await db
    .collection("pms_milestones")
    .find({ projectId: project._id, deletedAt: null })
    .toArray();

  const milestones = milestonesDocs.map((m: any) => ({
    title: m.title || "Milestone",
    amount: m.amount || m.cost || 0,
    status: m.status || "completed",
  }));

  // Fetch Timesheet hours
  const timesheetDocs = await db
    .collection("pms_timesheets")
    .find({ projectId: project._id, deletedAt: null })
    .toArray();

  let billableHours = 0;
  let nonBillableHours = 0;
  timesheetDocs.forEach((ts: any) => {
    const hrs = Number(ts.hours) || 0;
    if (ts.isBillable !== false) {
      billableHours += hrs;
    } else {
      nonBillableHours += hrs;
    }
  });

  const pdfDetails: ProjectPdfBillingDetails = {
    id: String(project._id),
    projectCode: project.projectCode,
    projectName: project.name,
    clientName,
    clientEmail,
    billingModel: (project.category?.toLowerCase().includes("hourly") ? "hourly" : "fixed_cost") as any,
    hourlyRate: 1500, // default rate per hour if hourly
    billableHours,
    nonBillableHours,
    totalBudget: project.estimatedBudget || 0,
    currency: project.currency || "INR",
    status: project.status || "active",
    date: new Date(project.createdAt || Date.now()).toISOString().slice(0, 10),
    milestones: milestones.length > 0 ? milestones : undefined,
    notes: project.description || undefined,
  };

  const settings = await getPrmsSettings();
  const buffer =
    pdfType === "receipt"
      ? await renderProjectReceiptPdf(pdfDetails, settings.company)
      : await renderProjectInvoicePdf(pdfDetails, settings.company);

  const filename = `PROJECT_${pdfType.toUpperCase()}_${project.projectCode}.pdf`;

  await recordPdf({ type: "pms_billing", variant: pdfType, ref: project.projectCode, by: user.email, role: "staff" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
