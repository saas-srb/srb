import { NextRequest, NextResponse } from "next/server";
import { withTransport } from "@/lib/security/transport";
import { userRateLimit } from "@/lib/security/rate-limit";
import { getPbActor } from "@/lib/products/playbook-ai/pb-actor";
import { EXPORT_FORMATS, exportDocument, type ExportFormat } from "@/lib/products/playbook-ai/exports-store";
import type { PbError } from "@/lib/products/playbook-ai/documents-types";

/**
 * GET /api/playbook-ai/documents/[id]/export?format=pdf|docx&version=<number|draft>
 *
 * Streams the file as an attachment. The reply is binary, which `withTransport` passes through untouched; error replies are JSON and are
 * sealed like every other browser-called JSON route. Permission, watermark, sealing and the page cap are decided in `exportDocument`.
 */
export const maxDuration = 300;

const STATUS: Record<PbError["code"], number> = {
  not_found: 404, forbidden: 403, invalid: 400, bad_status: 409, conflict: 409, locked: 423, unresolved_variables: 422, self_approval: 403,
  legal_hold: 409, reason_required: 400, legal_ack_required: 400, retention_active: 409, too_large: 422, render_failed: 500, busy: 503,
  ai_disabled: 403, rate_limited: 429, ai_failed: 502, section_locked: 409, stale_proposal: 409,
};

const json = (status: number, error: { code: string; message: string }, headers: Record<string, string> = {}) =>
  NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store", ...headers } });

async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getPbActor();
  if (!actor) return json(401, { code: "unauthorized", message: "Sign in to download documents." });

  const limited = await userRateLimit("pb-export", actor.id, 30, 60);
  if (!limited.ok) return json(429, { code: "rate_limited", message: "Too many downloads. Wait a moment and try again." }, { "Retry-After": String(limited.retryAfter) });

  const format = (req.nextUrl.searchParams.get("format") ?? "pdf").toLowerCase();
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) return json(400, { code: "invalid", message: "format must be pdf or docx." });
  const v = req.nextUrl.searchParams.get("version");
  let version: number | "draft" | undefined;
  if (v === null || v === "") version = undefined;
  else if (v === "draft") version = "draft";
  else if (/^\d{1,6}$/.test(v) && Number(v) > 0) version = Number(v);
  else return json(400, { code: "invalid", message: "version must be a number or draft." });

  const { id } = await params;
  const r = await exportDocument(actor, { id, format: format as ExportFormat, version });
  if (!r.ok) return json(STATUS[r.error.code] ?? 500, r.error, r.error.code === "busy" ? { "Retry-After": "5" } : {});

  const f = r.file;
  return new NextResponse(new Uint8Array(f.bytes), {
    headers: {
      "Content-Type": f.contentType,
      "Content-Disposition": `attachment; filename="${f.filename}"`,
      "Content-Length": String(f.bytes.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Playbook-Sealed": f.sealed ? "1" : "0",
      ETag: `"${f.sha256}"`,
    },
  });
}

export const GET = withTransport(handleGET);
