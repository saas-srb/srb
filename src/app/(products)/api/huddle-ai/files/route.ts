import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { requireSession, jsonError } from "@/lib/products/huddle-ai/route-helpers";
import { resolveVisibleScopes } from "@/lib/products/huddle-ai/access";
import { listAccessibleFiles, type AttachmentKind } from "@/lib/products/huddle-ai/attachments";

export const dynamic = "force-dynamic";

const KINDS: AttachmentKind[] = ["image", "voice", "video", "file"];

/** GET /api/huddle-ai/files?q=&category=&kind=&scopeId=&page= */
async function handleGET(request: NextRequest) {
  try {
    const user = await requireSession();
    const sp = request.nextUrl.searchParams;
    const scopes = await resolveVisibleScopes(user);

    const kindParam = sp.get("kind");
    const result = await listAccessibleFiles(scopes, {
      q: sp.get("q") ?? undefined,
      category: sp.get("category") ?? undefined,
      kind: KINDS.includes(kindParam as AttachmentKind) ? (kindParam as AttachmentKind) : undefined,
      scopeId: sp.get("scopeId") ?? undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
    });
    return Response.json(result);
  } catch (err) {
    return jsonError(err);
  }
}

export const GET = withTransport(handleGET);
