import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { checkProjectAccess } from "@/lib/products/sprintos/access";
import { getTask } from "@/lib/products/sprintos/tasks";
import { addAttachment } from "@/lib/products/sprintos/task-attachments";
import { saveAttachmentFile } from "@/lib/products/sprintos/attachment-storage";
import { validateDocumentFile } from "@/lib/products/sprintos/document-categories";
import { recordActivity } from "@/lib/products/sprintos/activity";

async function handlePOST(req: NextRequest) {
  const user = await getCurrentPmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Request body must be multipart form data." }, { status: 400 });
  }

  const taskId = String(formData.get("taskId") ?? "");
  const task = await getTask(taskId);
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const access = await checkProjectAccess(user, task.projectId);
  if (!access.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Validation failed.", fields: { file: "Select a file." } }, { status: 422 });
  }
  const fileError = validateDocumentFile({ name: file.name, size: file.size });
  if (fileError) return NextResponse.json({ error: "Validation failed.", fields: { file: fileError } }, { status: 422 });

  const stored = await saveAttachmentFile(file);
  const doc = await addAttachment(
    { taskId, projectId: task.projectId, uploadedBy: user.id, uploadedByEmail: user.email },
    stored
  );
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "task",
    entityId: taskId,
    entityLabel: task.title,
    projectId: task.projectId,
    summary: `Attached "${doc.filename}"`,
  });
  return NextResponse.json({ ok: true, id: doc._id }, { status: 201 });
}

export const POST = withTransport(handlePOST);
