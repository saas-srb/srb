import { NextRequest, NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { listChannelMessages, sendToLead, type ChannelKind } from "@/lib/dealflow-ai/channels";

import { withTransport } from "@/lib/security/transport";
const channelOf = (v: string): ChannelKind | null => (v === "email" || v === "whatsapp" ? v : null);

/** GET ?leadId= : what was sent to that lead on this channel. */
async function handleGET(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  if (!(await requireLms("VIEW_LEADS"))) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const channel = channelOf((await params).channel);
  const leadId = new URL(req.url).searchParams.get("leadId");
  if (!channel || !leadId) return NextResponse.json({ ok: false, error: "A channel and a leadId are required" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, messages: await listChannelMessages(channel, leadId) });
  } catch (err) {
    console.error("[channels] GET error:", err);
    return NextResponse.json({ ok: false, error: "Failed to load messages" }, { status: 500 });
  }
}

/** POST { leadId, subject?, body } : sends to the lead through the company's own account and records the attempt. */
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const user = await requireLms("MESSAGE_LEADS");
  if (!user) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const channel = channelOf((await params).channel);
  const body = await req.json().catch(() => null);
  if (!channel || !body || typeof body.leadId !== "string" || typeof body.body !== "string") {
    return NextResponse.json({ ok: false, error: "leadId and body are required" }, { status: 400 });
  }
  try {
    const r = await sendToLead({ channel, leadId: body.leadId, subject: typeof body.subject === "string" ? body.subject : "", body: body.body, sentByName: user.email });
    return NextResponse.json(r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error, message: r.message ?? null }, { status: r.ok ? 201 : r.status });
  } catch (err) {
    console.error("[channels] POST error:", err);
    return NextResponse.json({ ok: false, error: "Failed to send" }, { status: 500 });
  }
}

export const GET = withTransport(handleGET);
export const POST = withTransport(handlePOST);
