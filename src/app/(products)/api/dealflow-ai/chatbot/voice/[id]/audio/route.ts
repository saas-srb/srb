import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeChatbotApi } from "@/app/(products)/commandos/(protected)/chatbot/access";
import { getVoiceMessageAudioKey } from "@/lib/voice-conversations";
import { readVoiceAudioStream } from "@/lib/voice-storage";

type Context = { params: Promise<{ id: string }> };

async function handleGET(req: NextRequest, { params }: Context) {
  const auth = await authorizeChatbotApi("view");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const msg = req.nextUrl.searchParams.get("msg");
  if (!msg) return NextResponse.json({ error: "Missing message id." }, { status: 400 });

  const key = await getVoiceMessageAudioKey(id, msg);
  if (!key) return NextResponse.json({ error: "Audio not found." }, { status: 404 });

  const object = await readVoiceAudioStream(key);
  if (!object) return NextResponse.json({ error: "Audio not found." }, { status: 404 });

  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="voice-${msg}.mp3"`,
    },
  });
}

export const GET = withTransport(handleGET);
