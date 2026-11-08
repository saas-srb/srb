import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeChatbotApi } from "@/app/(products)/commandos/(protected)/chatbot/access";
import { getConversation } from "@/lib/chat-conversations";

async function handleGET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeChatbotApi("view");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const detail = await getConversation(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export const GET = withTransport(handleGET);
