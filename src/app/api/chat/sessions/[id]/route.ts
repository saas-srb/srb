import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import {
  getVisitorIdFromRequest,
  renameVisitorSession,
  deleteVisitorSession,
} from "@/lib/chatbot-sessions";

type Context = { params: Promise<{ id: string }> };

async function handlePATCH(req: NextRequest, { params }: Context) {
  const visitorId = getVisitorIdFromRequest(req);
  if (!visitorId) return NextResponse.json({ error: "No session." }, { status: 401 });

  const { id } = await params;
  let body: { title?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title : "";
  if (!title.trim()) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ error: "Title is too long." }, { status: 400 });

  const updated = await renameVisitorSession(id, visitorId, title);
  if (!updated) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json({ session: updated });
}

async function handleDELETE(req: NextRequest, { params }: Context) {
  const visitorId = getVisitorIdFromRequest(req);
  if (!visitorId) return NextResponse.json({ error: "No session." }, { status: 401 });

  const { id } = await params;
  const ok = await deleteVisitorSession(id, visitorId);
  if (!ok) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withTransport(handlePATCH);
export const DELETE = withTransport(handleDELETE);
