import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { resolveSuspendedHost } from "@/lib/platform/tenancy/companies";
import { isSameOriginPost } from "@/lib/platform/email-verification-rule";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { hashIp, submitReactivationRequest } from "@/lib/platform/reactivation";

/**
 * "Request reactivation" from a suspended company's address (public: nobody can sign in there). The proxy lets only this one POST through
 * for a suspended host. Same-origin only, rate limited per address, and the company is always the one the HOST belongs to, never a
 * field the browser sends.
 */
export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const h = await headers();
  const host = h.get("host");
  if (!isSameOriginPost({ secFetchSite: h.get("sec-fetch-site"), origin: h.get("origin"), host })) return json({ ok: false, error: "Cross-site request refused." }, 403);
  const limited = await rateLimit(req, "reactivation", 5, 3600);
  if (!limited.ok) return json({ ok: false, error: "Too many attempts. Please try again later." }, 429);
  const company = await resolveSuspendedHost(host);
  if (!company) return json({ ok: false, error: "This workspace isn't suspended." }, 404);

  const form = await req.formData().catch(() => null);
  if (!form) return json({ ok: false, error: "We couldn't read that form. Please try again." }, 400);
  const file = form.get("idFile");
  if (!(file instanceof File)) return json({ ok: false, error: "Upload a government ID." }, 400);
  const text = (k: string, max: number) => String(form.get(k) ?? "").slice(0, max);
  const res = await submitReactivationRequest({
    companyId: company.companyId,
    fields: { name: text("name", 200), email: text("email", 300), message: text("message", 4000), consent: form.get("consent") === "on" || form.get("consent") === "true" },
    file: { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) },
    ipHash: hashIp(clientIp(req)),
    origin: `${h.get("x-forwarded-proto") ?? "https"}://${host}`,
  });
  return res.ok ? json({ ok: true, reference: res.reference }) : json({ ok: false, error: res.error }, 400);
}
