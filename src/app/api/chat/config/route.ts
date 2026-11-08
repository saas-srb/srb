import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getChatbotConfig } from "@/lib/chatbot-config";
import { isOpenAIConfigured } from "@/lib/openai";
import { isElevenLabsConfigured } from "@/lib/elevenlabs";
import { getVisitorIdFromRequest } from "@/lib/chatbot-sessions";
import { getVisitorProfile } from "@/lib/chat-visitors";

/** Public subset of the chatbot config, for the welcome screen / composer. */
async function handleGET(req: NextRequest) {
  const config = await getChatbotConfig();

  const visitorId = getVisitorIdFromRequest(req);
  const profile = visitorId ? await getVisitorProfile(visitorId) : null;

  const liveVoice = config.voice.enabled && (await isElevenLabsConfigured());

  return NextResponse.json({
    available: await isOpenAIConfigured(),
    demo: false,
    welcomeMessage: config.welcomeMessage,
    suggestedQuestions: config.suggestedQuestions,
    maxMessageChars: config.rateLimit.maxMessageChars,
    preChat: {
      enabled: config.preChat.enabled,
      title: config.preChat.title,
      description: config.preChat.description,
      fields: config.preChat.fields,
      consentText: config.preChat.consentText,
    },
    identified: Boolean(profile),
    visitorName: profile?.name ?? null,
    voice: {
      enabled: config.voice.enabled,
      available: liveVoice,
      streaming: config.voice.streaming,
      mode: "elevenlabs",
    },
  });
}

export const GET = withTransport(handleGET);
