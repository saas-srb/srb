import { NextRequest } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { requireLms } from "@/lib/lms-auth";
import { limitOr429, userRateLimit } from "@/lib/security/rate-limit";
import { getMeeting } from "@/lib/dealflow-ai/db-meetings";
import { getAgentForSpeech } from "@/lib/dealflow-ai/meeting-agents";
import { reserveSpeech } from "@/lib/dealflow-ai/meeting-speech-guard";
import { handleAnswer, type AnswerDeps } from "@/lib/dealflow-ai/meetings/answer";
import { buildBriefing } from "@/lib/products/agentos/calls/briefing";
import { viewerForUserId } from "@/lib/products/agentos/viewer";
import type { MeetingDoc } from "@/lib/dealflow-ai/meetings/types";

import { withTransport } from "@/lib/security/transport";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** The model that writes meeting replies: small and fast, because the first spoken word has to follow the question within a couple of seconds. */
const MEETING_MODEL = "gpt-4.1-mini";

/**
 * POST /api/dealflow-ai/meetings/agent-speak
 * Streams what an AI agent says next in a live meeting (NDJSON, see handleAnswer). Requires a signed-in team member who is on the meeting's
 * roster: the AI quota is spent only on behalf of staff, never by a guest link. The agent's instructions, persona, knowledge, the agenda and
 * the lead briefing are read server-side; the browser sends the room, the agent and the recent lines only.
 */
async function handlePOST(req: NextRequest) {
  try {
    const limited = await limitOr429(req, "dealflow-agent-speak", 60, 60);
    if (limited) return limited;
    const body = await req.json().catch(() => null);
    const deps: AnswerDeps = {
      staff: async () => {
        const u = await requireLms("VIEW_LEADS");
        return u ? { id: u.id } : null;
      },
      limit: async (userId) => {
        const r = await userRateLimit("meeting-answer", userId, 40, 60);
        return r.ok ? null : Response.json({ ok: false, error: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(r.retryAfter) } });
      },
      getMeeting: async (roomId) => (await getMeeting(roomId)) as unknown as MeetingDoc | null,
      agent: (roomId, agentId) => getAgentForSpeech(roomId, agentId),
      reserve: (roomId) => reserveSpeech(roomId, "llm"),
      briefing: async (userId, target) => {
        const viewer = await viewerForUserId(userId);
        if (!viewer) return "";
        const b = await buildBriefing(viewer, target);
        return b.available ? b.text : "";
      },
      stream: async ({ system, user, maxTokens }) => {
        const openai = await getOpenAI({ timeoutMs: 25_000, maxRetries: 1 });
        const completion = await openai.chat.completions.create({
          model: MEETING_MODEL,
          stream: true,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: maxTokens,
          temperature: 0.6,
        });
        return (async function* () {
          for await (const chunk of completion) {
            const d = chunk.choices[0]?.delta?.content;
            if (d) yield d;
          }
        })();
      },
    };
    return await handleAnswer(body, deps);
  } catch (err) {
    console.error("[agent-speak] POST error:", err);
    return Response.json({ ok: false, error: "Failed to generate agent response" }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
