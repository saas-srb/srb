import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeChatbotApi } from "@/app/(products)/commandos/(protected)/chatbot/access";
import { getPdfDocument } from "@/lib/kb-pdf";
import { readKbFileStream } from "@/lib/kb-storage";

type Context = { params: Promise<{ id: string }> };

async function handleGET(req: NextRequest, { params }: Context) {
  const auth = await authorizeChatbotApi("view");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const doc = await getPdfDocument(id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const object = await readKbFileStream(doc.storageKey);
  if (!object) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.filename)}"`,
      "Content-Length": String(doc.size),
    },
  });
}

export const GET = withTransport(handleGET);
