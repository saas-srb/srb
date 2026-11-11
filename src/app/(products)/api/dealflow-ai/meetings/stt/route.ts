import { NextRequest } from "next/server";
import { userRateLimit } from "@/lib/security/rate-limit";
import { getMeeting } from "@/lib/dealflow-ai/db-meetings";
import { reserveSpeech } from "@/lib/dealflow-ai/meeting-speech-guard";
import { getLiveKitCredentials, verifyRoomToken } from "@/lib/dealflow-ai/meetings/livekit";
import { handleStt, STT_PER_MINUTE } from "@/lib/dealflow-ai/meetings/speech-routes";
import { transcribeAudio } from "@/lib/elevenlabs";
import type { MeetingDoc } from "@/lib/dealflow-ai/meetings/types";

import { withTransport } from "@/lib/security/transport";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/dealflow-ai/meetings/stt?roomId=&u=<utterance id>&ms=<duration>&lang=<optional hint>
 * Body: one finished utterance (audio/webm | ogg | mp4), as cut by the speaker's own browser.
 * Authorization: Bearer <the participant's LiveKit token>, so guests (no account) and staff are both covered and each only for their own room.
 * Returns { ok, text, language }. Transcription uses the company's ElevenLabs Scribe key (else the platform's).
 */
async function handlePOST(req: NextRequest) {
  try {
    return await handleStt(req, {
      verify: async (token) => {
        const creds = await getLiveKitCredentials();
        if (!creds) return null;
        const v = await verifyRoomToken(creds, token);
        return v ? { participantId: v.participantId, roomId: v.roomId } : null;
      },
      getMeeting: async (roomId) => (await getMeeting(roomId)) as unknown as MeetingDoc | null,
      limit: (key) => userRateLimit("meeting-stt", key, STT_PER_MINUTE, 60),
      reserve: (roomId) => reserveSpeech(roomId, "stt"),
      transcribe: (audio, mime, lang) => transcribeAudio(audio, mime, { languageCode: lang }),
    });
  } catch (err) {
    console.error("[stt] POST error:", err);
    return Response.json({ ok: false, error: "Speech recognition failed" }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
