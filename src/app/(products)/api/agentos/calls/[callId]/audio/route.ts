import { NextRequest, NextResponse } from "next/server";
import { getViewer, AibotsInputError, NotFoundError } from "@/lib/products/agentos/viewer";
import { getEngineCallAudio } from "@/lib/products/agentos/calls/audio";
import { getCallAudio } from "@/lib/products/agentos/voice/call-history";
import { parseRange } from "@/lib/products/agentos/voice/call-format";

// A GET with the session cookie, served to an <audio> element, which cannot send the encrypted-transport headers; hence no withTransport.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEADERS = {
  "Cache-Control": "private, no-store",
  "Accept-Ranges": "bytes",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie, Range",
} as const;

const text = (message: string, status: number, extra: Record<string, string> = {}) =>
  new NextResponse(message, { status, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8", ...extra } });

/**
 * The recording of one voice call, streamed from ElevenLabs through the server so the API key and the upstream URL never reach the
 * browser. The caller must be signed in and own the call (or have VIEW_CHATS / call management). Range requests are answered with 206 so seeking works.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ callId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return text("Sign in again to play this call.", 401);
  const { callId } = await ctx.params;
  let audio;
  try {
    // A phone, scheduled, inbound or website call (engine document) first; otherwise a browser call from before the engine (chat id).
    audio = await getEngineCallAudio(viewer, callId).catch((e) => {
      if (e instanceof NotFoundError) return getCallAudio(viewer, callId);
      throw e;
    });
  } catch (err) {
    if (err instanceof NotFoundError) return text("There is no recording for this call.", 404);
    if (err instanceof AibotsInputError) return text(err.message, 502);
    console.error("[agentos call audio]", err instanceof Error ? err.message : err);
    return text("Couldn't load the recording.", 500);
  }
  const size = audio.bytes.byteLength;
  const range = parseRange(req.headers.get("range"), size);
  const base = { ...HEADERS, "Content-Type": audio.contentType };
  if (range === "unsatisfiable") return new NextResponse(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  if (!range) return new NextResponse(audio.bytes, { status: 200, headers: { ...base, "Content-Length": String(size) } });
  const part = audio.bytes.slice(range.start, range.end + 1);
  return new NextResponse(part, { status: 206, headers: { ...base, "Content-Length": String(part.byteLength), "Content-Range": `bytes ${range.start}-${range.end}/${size}` } });
}
