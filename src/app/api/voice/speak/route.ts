import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getChatbotConfig } from "@/lib/chatbot-config";
import { isElevenLabsConfigured, streamTts, usesOwnVoiceKey } from "@/lib/elevenlabs";
import { getSessionFromRequest } from "@/lib/chatbot-sessions";
import { ensureVoiceConversation, recordVoiceTurn } from "@/lib/voice-conversations";
import { saveVoiceAudio } from "@/lib/voice-storage";
import { bumpVoiceRollup } from "@/lib/voice-rollup";
import { afterForCompany } from "@/lib/platform/tenancy/context";
import { voiceBlockReason } from "@/lib/platform/billing/enforce";
import { recordUsage } from "@/lib/platform/billing/usage";

export const maxDuration = 300;

const MAX_TTS_CHARS = 5000;
// mp3 @ 128 kbps ≈ 16000 bytes/sec — used to estimate spoken duration.
const MP3_BYTES_PER_SEC = 16000;

async function handlePOST(req: NextRequest) {
  const config = await getChatbotConfig();

  if (!config.voice.enabled) {
    return NextResponse.json({ error: "Voice mode is turned off." }, { status: 403 });
  }
  if (!(await isElevenLabsConfigured())) {
    return NextResponse.json({ error: "Voice mode is not configured yet." }, { status: 503 });
  }
  // The plan's voice minutes (and any bought).
  const voiceBlocked = await voiceBlockReason().catch(() => null);
  if (voiceBlocked) return NextResponse.json({ error: voiceBlocked }, { status: 402 });

  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "No active session." }, { status: 401 });
  }

  let body: {
    text?: unknown;
    chatMessageId?: unknown;
    transcriptId?: unknown;
    userChatMessageId?: unknown;
    userText?: unknown;
    userAudioDurationMs?: unknown;
    sttMs?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = (typeof body.text === "string" ? body.text : "").trim().slice(0, MAX_TTS_CHARS);
  if (!text) {
    return NextResponse.json({ error: "Nothing to speak." }, { status: 400 });
  }

  const voice = config.voice;
  const startedAt = Date.now();

  let ttsStream: ReadableStream<Uint8Array>;
  try {
    ttsStream = await streamTts(text, {
      voiceId: voice.voiceId,
      modelId: voice.modelId,
      stability: voice.stability,
      similarityBoost: voice.similarityBoost,
      style: voice.style,
      speed: voice.speed,
    });
  } catch (err) {
    console.error("voice: TTS failed", err);
    return NextResponse.json({ error: "Couldn't generate audio. Please try again." }, { status: 502 });
  }

  const [clientStream, persistStream] = ttsStream.tee();

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const userAudioDurationMs = num(body.userAudioDurationMs);

  // Persist the turn + audio file after the response has been sent.
  await afterForCompany(async () => {
    try {
      const reader = persistStream.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const audio = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      const ttsMs = Date.now() - startedAt;
      const assistantDurationMs = Math.round((audio.byteLength / MP3_BYTES_PER_SEC) * 1000);
      if (!(await usesOwnVoiceKey())) await recordUsage("voice_seconds", assistantDurationMs / 1000, new Date(), { source: "Voice reply (assistant speaking)" }).catch(() => {});

      const stored = await saveVoiceAudio(audio, "mp3");
      const conversationId = await ensureVoiceConversation(session, voice.voiceId);

      const { firstTurn } = await recordVoiceTurn({
        sessionId: session.sessionId,
        conversationId,
        user: {
          chatMessageId: str(body.userChatMessageId),
          text: str(body.userText) ?? "",
          transcriptId: str(body.transcriptId),
          audioDurationMs: userAudioDurationMs,
          sttMs: num(body.sttMs),
        },
        assistant: {
          chatMessageId: str(body.chatMessageId),
          text,
          audioStorageKey: stored.storageKey,
          audioBytes: stored.size,
          audioDurationMs: assistantDurationMs,
          ttsMs,
          voiceId: voice.voiceId,
        },
      });

      await bumpVoiceRollup({
        conversations: firstTurn ? 1 : 0,
        voiceMessages: 2,
        durationMs: userAudioDurationMs + assistantDurationMs,
        responseMs: ttsMs,
        visitorId: session.visitorId,
        hour: new Date().getHours(),
        voiceId: voice.voiceId,
        device: session.device,
      });
    } catch (err) {
      console.error("voice: failed to persist turn", err);
    }
  });

  return new NextResponse(clientStream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export const POST = withTransport(handlePOST);
