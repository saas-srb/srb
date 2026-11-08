import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getViewer, can, DlmsInputError, ForbiddenError } from "@/lib/products/cybervault/viewer";
import { addDocumentVersion, createDocument } from "@/lib/products/cybervault/records";

/**
 * Multipart upload for the Document Vault (a route rather than a server action
 * because actions cap request bodies at 1 MB). `docId` present → new version of
 * that document; absent → a new document. The session, MANAGE_DOCUMENTS
 * permission and company/client scope are all re-checked here and in the data
 * layer; file type/size/magic-byte validation happens in `saveDlmsFile`.
 */
async function handlePOST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Your session has expired — please sign in again." }, { status: 401 });
  if (!can(viewer, "MANAGE_DOCUMENTS")) return NextResponse.json({ ok: false, error: "You don't have permission to manage documents." }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "That upload could not be read." }, { status: 400 });
  }
  const file = form.get("file");
  const upload = file instanceof File && file.size > 0 ? file : null;
  const input = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  const docId = typeof input.docId === "string" && input.docId ? input.docId : null;

  try {
    const out = docId ? { version: await addDocumentVersion(viewer, docId, upload, String(input.note ?? "")) } : { id: await createDocument(viewer, input, upload) };
    revalidatePath("/cybervault", "layout");
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    if (err instanceof DlmsInputError) return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    if (err instanceof ForbiddenError) return NextResponse.json({ ok: false, error: "You don't have permission to do that." }, { status: 403 });
    console.error("[dlms upload]", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
