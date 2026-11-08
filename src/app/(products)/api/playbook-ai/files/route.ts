import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { getReadableSop } from "@/lib/products/playbook-ai/sops";
import { canEditSop, toAccessDoc } from "@/lib/products/playbook-ai/access";
import { saveSopFile } from "@/lib/products/playbook-ai/files";
import { recordAudit } from "@/lib/products/playbook-ai/audit";
import { todayIso } from "@/lib/products/playbook-ai/db";

/**
 * Upload a file to an SOP (image / video / attachment). Requires edit rights
 * over THAT SOP; the file is validated (type, magic bytes, size) before it is
 * stored in the private blob store.
 */
async function handlePOST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid upload." }, { status: 400 });
  }
  const sopId = String(form.get("sopId") ?? "");
  const file = form.get("file");
  if (!sopId || !(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file to upload." }, { status: 400 });

  const found = await getReadableSop(viewer, sopId);
  if (!found) return NextResponse.json({ ok: false, error: "SOP not found." }, { status: 404 });
  if (!canEditSop(viewer, toAccessDoc(found.doc, todayIso()))) return NextResponse.json({ ok: false, error: "You can't edit this SOP." }, { status: 403 });

  const saved = await saveSopFile(sopId, file, viewer.userId);
  if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: 400 });

  await recordAudit({
    actorId: viewer.userId,
    actorEmail: viewer.email,
    action: "edit",
    entity: "file",
    entityId: saved.doc._id,
    sopId,
    entityLabel: `${found.doc.code} · ${saved.doc.filename}`,
    summary: `Uploaded ${saved.doc.kind} "${saved.doc.filename}" (${Math.round(saved.doc.size / 1024)} KB)`,
  });
  const { _id, filename, size, kind } = saved.doc;
  return NextResponse.json({ ok: true, file: { id: _id, filename, size, kind } });
}

export const POST = withTransport(handlePOST);
