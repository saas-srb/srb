import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { limitOr429 } from "@/lib/security/rate-limit";

/** A person's browser reporting that an error screen was shown: one log line with the reference code. Never stores anything else, never fails. */
async function handlePOST(req: NextRequest) {
  try {
    const limited = await limitOr429(req, "client-error", 20, 600);
    if (limited) return limited;
    const b = (await req.json().catch(() => ({}))) as { digest?: unknown; message?: unknown; path?: unknown };
    const s = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\r\n]+/g, " ").slice(0, n) : "");
    console.error(`[client-error] ref=${s(b.digest, 40) || "-"} path=${s(b.path, 200)} message=${s(b.message, 300)}`);
  } catch {
    /* reporting must not fail */
  }
  return new NextResponse(null, { status: 204 });
}

export const POST = withTransport(handlePOST);
