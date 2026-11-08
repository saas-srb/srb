import { NextRequest } from "next/server";
import { PublicCallError, startPublicSession } from "@/lib/products/agentos/calls/public";
import { publicErrorResponse, publicJson, publicRequestContext } from "@/lib/products/agentos/calls/public-request";

import { withTransport } from "@/lib/security/transport";
/**
 * POST /api/agentos-public/session: a website visitor starts a call with a PUBLIC agent. The body carries the page token, the agent id,
 * the consent flag and the optional visitor fields; the answer is a one-call signed URL. Every rule lives in `calls/public.ts`.
 */
export const dynamic = "force-dynamic";

async function handlePOST(req: NextRequest) {
  try {
    const ctx = publicRequestContext(req);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const raw = req.headers.get("content-length");
    if (!body || typeof body !== "object" || (raw && Number(raw) > 8_000)) throw new PublicCallError("That request couldn't be read.", "input", 400);
    const started = await startPublicSession({ token: body.token, agentId: body.agentId, consent: body.consent, visitor: body.visitor as Record<string, unknown> | undefined, ...ctx });
    return publicJson({ ...started });
  } catch (e) {
    return publicErrorResponse(e);
  }
}

export const POST = withTransport(handlePOST);
