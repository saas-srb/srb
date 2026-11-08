import { NextRequest } from "next/server";
import { handleTwilioStatus } from "@/lib/products/agentos/calls/conference";
import { isTwilioResponse, toTwilioRequest } from "@/lib/products/agentos/calls/conference-route";

/**
 * Twilio calls this (status). The company comes from the opaque `?t=` token, and the request must carry a valid X-Twilio-Signature made with THAT
 * company's Twilio auth token; see calls/conference.ts. Anything else gets the same bare 403.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const parsed = await toTwilioRequest(req);
  const res = isTwilioResponse(parsed) ? parsed : await handleTwilioStatus(parsed);
  return new Response(res.body, { status: res.status, headers: { "content-type": res.contentType === "text/xml" ? "text/xml; charset=utf-8" : "application/json", "cache-control": "no-store" } });
}
