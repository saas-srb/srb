import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { hasStaffRole } from "@/lib/hrms-roles";
import { uploadDocument } from "@/lib/products/talentos/documents";
import { validateDocumentFile } from "@/lib/products/talentos/document-categories";
import { validateDocumentMeta } from "@/lib/products/talentos/validation-payroll";
import { recordAudit } from "@/lib/products/talentos/audit";
import { notify } from "@/lib/products/talentos/notifications";
import { employeeFullName, getEmployee } from "@/lib/products/talentos/employees";

async function handlePOST(req: NextRequest) {
  const user = await getCurrentHrmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Request body must be multipart form data." }, { status: 400 });
  }

  const staff = hasStaffRole(user.roles);
  const targetEmployeeId = staff ? String(formData.get("employeeId") ?? "") : user.employeeId ?? "";
  if (!targetEmployeeId) return NextResponse.json({ error: "No employee context." }, { status: 400 });
  // Employees can only upload for themselves.
  if (!staff && targetEmployeeId !== user.employeeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actorRole: "staff" | "employee" = staff ? "staff" : "employee";
  const meta = validateDocumentMeta(
    {
      category: formData.get("category"),
      title: formData.get("title"),
      issuedDate: formData.get("issuedDate"),
      expiryDate: formData.get("expiryDate"),
    },
    actorRole
  );
  if (!meta.valid) return NextResponse.json({ error: "Validation failed.", fields: meta.errors }, { status: 422 });

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Validation failed.", fields: { file: "Select a file." } }, { status: 422 });
  }
  const fileError = validateDocumentFile(file);
  if (fileError) return NextResponse.json({ error: "Validation failed.", fields: { file: fileError } }, { status: 422 });

  const replacesId = String(formData.get("replacesId") ?? "") || undefined;
  const result = await uploadDocument(
    { employeeId: targetEmployeeId, ...meta.data, replacesId },
    file,
    { id: user.id, role: actorRole }
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: replacesId ? "update" : "create",
    entity: "employee_document",
    entityId: result.document._id,
    entityLabel: `${meta.data.title} (${meta.data.category})`,
    summary: replacesId ? `Replaced — version ${result.document.version}` : "Uploaded",
  });

  if (actorRole === "employee") {
    const emp = await getEmployee(targetEmployeeId);
    await notify({
      audience: "staff",
      type: "document_uploaded",
      title: `${emp ? employeeFullName(emp) : "An employee"} uploaded a document`,
      body: `${meta.data.title} · ${meta.data.category.replace(/_/g, " ")}`,
      link: `/talentos/employees/${targetEmployeeId}?tab=documents`,
      entityType: "employee_document",
      entityId: result.document._id,
    });
  }

  return NextResponse.json({ ok: true, id: result.document._id }, { status: 201 });
}

export const POST = withTransport(handlePOST);
