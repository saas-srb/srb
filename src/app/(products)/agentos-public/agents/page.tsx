import type { Metadata } from "next";
import { headers } from "next/headers";
import AgentDirectory from "@/components/products/agentos/public/AgentDirectory";
import { issuePageToken, listPublicAgents } from "@/lib/products/agentos/calls/public";
import { embedderOrigin, parseOrigin } from "@/lib/products/agentos/calls/public-security";
import { clientIpFrom } from "@/lib/security/ip";

/**
 * The company's agent directory, for its own website and for any website it lists on an agent (embedded in a frame; see
 * /agentos-public/embed.js). The company is the one that owns the Host. Rendered per request: it carries a one-use page token.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Talk to our agents", robots: { index: false, follow: false } };

export default async function PublicAgentsPage() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() === "http" ? "http" : "https";
  const ownOrigin = parseOrigin(`${proto}://${(h.get("host") ?? "").toLowerCase()}`);
  if (!ownOrigin) return null;
  const embedder = embedderOrigin({ referer: h.get("referer"), secFetchSite: h.get("sec-fetch-site"), ownOrigin });
  const { agents, killSwitch } = await listPublicAgents(embedder, ownOrigin);
  const token = embedder && agents.length ? await issuePageToken({ embedder, ip: clientIpFrom(h) }) : null;
  const unavailable = killSwitch ? "Voice calls are switched off at the moment. Please check back later." : agents.length && !token ? "Voice calls aren't available right now." : null;
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <AgentDirectory agents={agents} token={token} unavailable={unavailable} />
    </main>
  );
}
