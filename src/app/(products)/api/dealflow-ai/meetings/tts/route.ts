import { NextRequest } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { limitOr429, userRateLimit } from "@/lib/security/rate-limit";
import { getMeeting } from "@/lib/dealflow-ai/db-meetings";
import { getAgentForSpeech } from "@/lib/dealflow-ai/meeting-agents";
import { reserveSpeech } from "@/lib/dealflow-ai/meeting-speech-guard";
import { handleTts } from "@/lib/dealflow-ai/meetings/speech-routes";
import { streamTts } from "@/lib/elevenlabs";
import type { MeetingDoc } from "@/lib/dealflow-ai/meetings/types";

import { withTransport } from "@/lib/security/transport";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/dealflow-ai/meetings/tts
 * Speaks one sentence of an AI agent's reply in that agent's own ElevenLabs voice (from its AgentOS voice settings), with the company's
 * ElevenLabs key (else the platform's). Team members on the meeting's roster only: the browser sends the room, the agent and the text,
 * never a voice id or a key. Returns audio/mpeg.
 */
async function handlePOST(req: NextRequest) {
  try {
    const limited = await limitOr429(req, "dealflow-tts", 120, 60);
    if (limited) return limited;
    const body = await req.json().catch(() => null);
    return await handleTts(body, {
      staff: async () => {
        const u = await requireLms("VIEW_LEADS");
        return u ? { id: u.id } : null;
      },
      limit: async (userId) => {
        const r = await userRateLimit("meeting-tts", userId, 90, 60);
        return r.ok ? null : Response.json({ ok: false, error: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(r.retryAfter) } });
      },
      getMeeting: async (roomId) => (await getMeeting(roomId)) as unknown as MeetingDoc | null,
      agent: (roomId, agentId) => getAgentForSpeech(roomId, agentId),
      reserve: (roomId, chars) => reserveSpeech(roomId, "tts", chars),
      speak: (text, voiceId) =>
        streamTts(text, { voiceId, modelId: "eleven_turbo_v2_5", stability: 0.5, similarityBoost: 0.75, style: 0, speed: 1 }),
    });
  } catch (err) {
    console.error("[tts] POST error:", err);
    return Response.json({ ok: false, error: "TTS request failed" }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
