import { onSaasHost, requestHostOrNull, saasOrigin } from "@/lib/platform/saas/request";
import { saasContact } from "@/lib/platform/saas/brand";
import { saasCanonicalHost } from "@/lib/platform/saas/hosts";

/**
 * /.well-known/security.txt (RFC 9116): where a researcher reports a vulnerability. Only on the product's own website; on a company's host
 * it is a 404, because the company's visitors are not reaching the platform's security team.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await onSaasHost())) return new Response("Not found", { status: 404 });
  const origin = await saasOrigin();
  const contact = saasContact(saasCanonicalHost(await requestHostOrNull()));
  // The file must carry an expiry; it is always a year ahead, so a running site never publishes a lapsed one.
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    `Contact: mailto:${contact.security}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    `Canonical: ${origin}/.well-known/security.txt`,
    `Policy: ${origin}/vulnerability-disclosure`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
