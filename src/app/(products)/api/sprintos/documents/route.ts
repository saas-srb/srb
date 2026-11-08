import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects } from "@/lib/pms-roles";
import { getProject } from "@/lib/products/sprintos/projects";
import { addDocument, replaceDocument } from "@/lib/products/sprintos/documents";
import { saveDocumentFile } from "@/lib/products/sprintos/document-storage";
import { isValidDocumentCategory, validateDocumentFile, DEFAULT_DOCUMENT_CATEGORY } from "@/lib/products/sprintos/document-categories";
import { recordActivity } from "@/lib/products/sprintos/activity";

async function handlePOST(req: NextRequest) {
  const user = await getCurrentPmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProjects(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Request body must be multipart form data." }, { status: 400 });
  }

  const projectId = String(formData.get("projectId") ?? "");
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Validation failed.", fields: { file: "Select a file." } }, { status: 422 });
  }
  const fileError = validateDocumentFile({ name: file.name, size: file.size });
  if (fileError) return NextResponse.json({ error: "Validation failed.", fields: { file: fileError } }, { status: 422 });

  const replacesId = String(formData.get("replacesId") ?? "") || undefined;
  const titleRaw = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const categoryRaw = String(formData.get("category") ?? "");
  const category = isValidDocumentCategory(categoryRaw) ? categoryRaw : DEFAULT_DOCUMENT_CATEGORY;

  const stored = await saveDocumentFile(file);

  if (replacesId) {
    const doc = await replaceDocument(
      replacesId,
      { title: titleRaw || undefined, notes, uploadedBy: user.id, uploadedByEmail: user.email },
      stored
    );
    if (!doc) return NextResponse.json({ error: "Document to replace not found." }, { status: 404 });
    await recordActivity({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "project",
      entityId: projectId,
      entityLabel: `Document · ${doc.title} v${doc.version}`,
      projectId,
      summary: `New version of "${doc.title}"`,
    });
    return NextResponse.json({ ok: true, id: doc._id }, { status: 201 });
  }

  const doc = await addDocument(
    {
      projectId,
      category,
      title: titleRaw || file.name,
      notes,
      uploadedBy: user.id,
      uploadedByEmail: user.email,
    },
    stored
  );
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "project",
    entityId: projectId,
    entityLabel: `Document · ${doc.title}`,
    projectId,
    summary: `Uploaded "${doc.title}"`,
  });
  return NextResponse.json({ ok: true, id: doc._id }, { status: 201 });
}

export const POST = withTransport(handlePOST);
