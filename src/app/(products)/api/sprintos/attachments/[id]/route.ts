import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { checkProjectAccess } from "@/lib/products/sprintos/access";
import { getAttachment, deleteAttachment } from "@/lib/products/sprintos/task-attachments";
import { readAttachmentStream } from "@/lib/products/sprintos/attachment-storage";

type Context = { params: Promise<{ id: string }> };

async function handleGET(req: NextRequest, { params }: Context) {
  const user = await getCurrentPmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const att = await getAttachment(id);
  if (!att) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!(await checkProjectAccess(user, att.projectId)).allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const object = await readAttachmentStream(att.storageKey);
  if (!object) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": att.contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(att.filename)}"`,
      "Content-Length": String(att.size),
      "Cache-Control": "private, no-store",
    },
  });
}

async function handleDELETE(_req: NextRequest, { params }: Context) {
  const user = await getCurrentPmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const att = await getAttachment(id);
  if (!att) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const access = await checkProjectAccess(user, att.projectId);
  // Staff can delete any; an employee only their own uploads.
  if (!access.canManage && att.uploadedBy !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await deleteAttachment(id);
  if (!result.ok) return NextResponse.json({ error: "Could not delete." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export const GET = withTransport(handleGET);
export const DELETE = withTransport(handleDELETE);
