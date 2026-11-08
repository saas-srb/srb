import { withTransport } from "@/lib/security/transport";
import type { NextRequest } from "next/server";
import { requireSession, jsonError } from "@/lib/products/huddle-ai/route-helpers";
import { globalSearch, type SearchType } from "@/lib/products/huddle-ai/search";

export const dynamic = "force-dynamic";

const VALID_TYPES: SearchType[] = ["messages", "channels", "users", "files", "projects", "groups"];

/** GET /api/huddle-ai/search?q=&types=messages,channels,users */
async function handleGET(request: NextRequest) {
  try {
    const user = await requireSession();
    const sp = request.nextUrl.searchParams;
    const q = sp.get("q") ?? "";
    const typesParam = sp.get("types");
    const types = typesParam
      ? (typesParam.split(",").filter((t) => VALID_TYPES.includes(t as SearchType)) as SearchType[])
      : undefined;
    const results = await globalSearch(q, user, { types, limit: sp.get("limit") ? Number(sp.get("limit")) : undefined });
    return Response.json({ results });
  } catch (err) {
    return jsonError(err);
  }
}

export const GET = withTransport(handleGET);
