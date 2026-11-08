import { logText } from "@/lib/products/agentos/calls/phone";
import { getDb } from "@/lib/mongodb";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { frameAncestorsValue } from "@/lib/products/agentos/calls/public-security";

/**
 * The `Content-Security-Policy: frame-ancestors …` value for the directory page of one company: the company's own site plus every website
 * listed on one of its public agents. The browser enforces it, so a website that isn't listed cannot show the page inside a frame. Read by the
 * proxy (no server-only imports here), cached briefly per company. Any failure answers with the strictest value ('self' only).
 */
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; value: string }>();

export async function frameAncestorsFor(companyId: string): Promise<string> {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value = frameAncestorsValue([]);
  try {
    value = await runAsCompany(companyId, async () => {
      const rows = await (await getDb())
        .collection<{ voice?: { allowedOrigins?: string[] } }>("aibots_bots")
        .find({ kind: "voice", status: "active", "voice.isPublic": true, deletedAt: null }, { projection: { "voice.allowedOrigins": 1 } })
        .limit(100)
        .toArray();
      return frameAncestorsValue(rows.flatMap((b) => b.voice?.allowedOrigins ?? []));
    });
  } catch (e) {
    console.error("[agentos public] frame-ancestors lookup failed", logText(e));
  }
  if (cache.size > 500) cache.clear();
  cache.set(companyId, { at: Date.now(), value });
  return value;
}
