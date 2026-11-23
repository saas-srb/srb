import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { mayReadDocument } from "@/lib/products/talentos/doc-access";
import { getDocument } from "@/lib/products/talentos/documents";
import { readDocumentStream } from "@/lib/products/talentos/document-storage";
import { isInlinePreviewable } from "@/lib/products/talentos/document-categories";

type Context = { params: Promise<{ id: string }> };

async function handleGET(req: NextRequest, { params }: Context) {
  const user = await getCurrentHrmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  // An employee reads their own documents; staff read the documents of the employees they can reach (their reporting line, or everyone), nobody else's.
  if (!(await mayReadDocument(user, doc.employeeId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const inline = req.nextUrl.searchParams.get("inline") === "1" && isInlinePreviewable(doc.contentType);
  const object = await readDocumentStream(doc.storageKey);
  if (!object) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(doc.filename)}"`,
      "Content-Length": String(doc.size),
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
