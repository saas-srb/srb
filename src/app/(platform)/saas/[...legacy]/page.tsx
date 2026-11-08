import { notFound, permanentRedirect } from "next/navigation";
import { productKeyFromSlug, productPath, productSlugFor } from "@/lib/platform/saas/product-routes";

/** Pages of earlier versions of the website, sent to where their content lives now. Only these paths are routed here (see lib/saas/routes.ts). */
const MOVED: Record<string, string> = {
  features: "/products",
  modules: "/products",
  ai: "/products",
  automation: "/products",
  integrations: "/products",
  "how-it-works": "/docs",
  "use-cases": "/about#stories",
  industries: "/about#what-we-do",
  resources: "/docs",
  changelog: "/about",
  "product-vision": "/vision",
  help: "/docs",
  faq: "/faqs",
  tutorials: "/docs#walkthroughs",
  mission: "/about#mission",
  "what-we-do": "/about#what-we-do",
};

export default async function LegacyRedirect({ params }: { params: Promise<{ legacy: string[] }> }) {
  const [first, second] = (await params).legacy;
  if (first === "products" && second) {
    const productKey = productKeyFromSlug(second);
    if (productKey && second !== productSlugFor(productKey)) permanentRedirect(productPath(productKey));
  }
  if ((first === "modules" || first === "features") && second) permanentRedirect(productPath(second));
  if (first === "resources" && second) permanentRedirect(`/docs/${second}`);
  if (first === "tutorials" && second) permanentRedirect(`/docs/walkthroughs/${second}`);
  const to = MOVED[first];
  if (!to) notFound();
  permanentRedirect(to);
}
