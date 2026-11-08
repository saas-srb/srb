import { NextRequest, NextResponse } from "next/server";
import { handleVoiceWebhook, SIGNATURE_HEADER } from "@/lib/products/agentos/calls/webhook";

/**
 * ElevenLabs post-call webhook. The company comes from the opaque `?t=` token in the URL (never from the body) and the request must
 * carry a valid HMAC signature for that company; see `calls/webhook.ts`. The raw body is read as text because the signature covers it.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const res = await handleVoiceWebhook({ rawBody, signature: req.headers.get(SIGNATURE_HEADER), token: req.nextUrl.searchParams.get("t") });
  return NextResponse.json(res.body, { status: res.status });
}
