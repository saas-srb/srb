import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { authorizeChatbotApi } from "@/app/(products)/commandos/(protected)/chatbot/access";
import { isElevenLabsConfigured, listVoices } from "@/lib/elevenlabs";

/** ElevenLabs voice catalogue for the AI Config voice picker. */
async function handleGET() {
  const auth = await authorizeChatbotApi("manage");
  if (!auth.ok) return auth.response;
  if (!(await isElevenLabsConfigured())) return NextResponse.json({ voices: [], configured: false });

  try {
    const voices = await listVoices();
    return NextResponse.json({ voices, configured: true });
  } catch (err) {
    console.error("voice: failed to list voices", err);
    return NextResponse.json({ voices: [], configured: true, error: "Couldn't load voices from ElevenLabs." });
  }
}

export const GET = withTransport(handleGET);
