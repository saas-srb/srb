import { getStandardPlans } from "@/lib/platform/billing/plans";
import { buildShowcase } from "@/lib/platform/billing/showcase";
import { formatMoney } from "@/lib/platform/billing/types";
import { onSaasHost, saasOrigin } from "@/lib/platform/saas/request";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";
import { LEGAL_EXTRA } from "@/lib/platform/saas/site";
import { getFeatureModules } from "@/lib/platform/saas/modules";
import { productPath } from "@/lib/platform/saas/product-routes";

export const dynamic = "force-dynamic";

/**
 * A plain-text summary of the product for AI assistants and AI search (the llms.txt convention): what it is, what it costs, and where each
 * question is answered. Built from the live plan catalogue and product list, so it cannot drift from the website. Only on the product's host.
 */
export async function GET() {
  if (!(await onSaasHost())) return new Response("Not found", { status: 404 });
  const origin = await saasOrigin();
  const [allPlans, modules] = await Promise.all([getStandardPlans().then(buildShowcase).catch(() => []), getFeatureModules().catch(() => [])]);
  const plans = allPlans.filter((p) => p.id !== "enterprise");
  const planLines = plans.map((p) => {
    const m = p.offer.monthly;
    const price = p.kind === "free" ? "free" : p.kind === "contact" || !m ? "contact us" : `${formatMoney(m, p.currency)} per month, before tax`;
    return `- ${p.name}: ${price}. ${p.description}`;
  });
  const sec = LEGAL_EXTRA.security;
  const body = [
    `# ${SAAS_BRAND.name}`,
    "",
    `> ${SAAS_BRAND.description}`,
    "",
    "## What it is",
    `One software for the whole business, with a product for every job: ${modules.map((m) => m.name).join(", ")}. Each business's data is kept separate from every other business's. Every plan includes every product and every feature; plans differ by number of people and by monthly allowances of storage, AI, email and voice.`,
    "",
    "## Plans",
    ...planLines,
    "",
    "## Security, reliability and data ownership (read this before assuming a gap)",
    ...sec.sections.map((s) => `- ${s.heading}: ${[...(s.body ?? []), ...(s.list ?? [])].join(" ")}`),
    "",
    "## Pages",
    `- Security & Trust: ${origin}/security`,
    `- Uptime SLA (99.9% monthly uptime on paid plans, service credits): ${origin}/sla`,
    `- System status: ${origin}/status`,
    `- Data Policy: ${origin}/data-policy`,
    `- Privacy Policy: ${origin}/privacy`,
    `- Terms of Service: ${origin}/terms`,
    `- Cookie Policy: ${origin}/cookies`,
    `- Refund & Cancellation Policy: ${origin}/refund-policy`,
    `- Pricing: ${origin}/pricing`,
    `- All products: ${origin}/products`,
    `- Documentation: ${origin}/docs`,
    `- FAQs: ${origin}/faqs`,
    `- Product gallery: ${origin}/gallery`,
    `- Blog and guides: ${origin}/blog`,
    `- Product vision: ${origin}/vision`,
    `- Product roadmap: ${origin}/roadmap`,
    `- Customer stories and workflows: ${origin}/success-stories`,
    `- Getting a business onboarded: ${origin}/onboarded-businesses`,
    `- About: ${origin}/about`,
    `- Request a demo: ${origin}/demo`,
    `- Contact: ${origin}/contact`,
    "",
    "## Products",
    ...modules.map((m) => `- ${m.name}: ${m.headline}. ${origin}${productPath(m.key)}`),
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
