import "server-only";
import type { NextRequest } from "next/server";
import { MAX_TWILIO_BODY, type TwilioRequest, type TwilioResponse } from "@/lib/products/agentos/calls/conference";

/** Next request -> the framework-free shape the Twilio handlers take. The body is read as text (the signature covers it) and bounded first. */
export async function toTwilioRequest(req: NextRequest): Promise<TwilioRequest | TwilioResponse> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_TWILIO_BODY) return { status: 413, body: "Too large", contentType: "application/json" };
  const rawBody = await req.text();
  return {
    rawBody, pathAndQuery: `${req.nextUrl.pathname}${req.nextUrl.search}`, token: req.nextUrl.searchParams.get("t"), signature: req.headers.get("x-twilio-signature"),
    forwardedProto: req.headers.get("x-forwarded-proto"), forwardedHost: req.headers.get("x-forwarded-host"), host: req.headers.get("host"),
  };
}
export const isTwilioResponse = (v: TwilioRequest | TwilioResponse): v is TwilioResponse => "status" in v;
