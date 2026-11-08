import { notFound } from "next/navigation";
import "./saas.css";
import Header from "@/components/platform/saas/Header";
import Footer from "@/components/platform/saas/Footer";
import Interactions from "@/components/platform/saas/Interactions";
import { OfferTopBar } from "@/components/platform/saas/OfferChrome";
import { onSaasHost, requestHostOrNull, saasOrigin } from "@/lib/platform/saas/request";
import { saasCanonicalHost } from "@/lib/platform/saas/hosts";
import { SAAS_BRAND, saasContact } from "@/lib/platform/saas/brand";
import { jsonForScript } from "@/lib/security/json-script";
import FreeForeverToast from "@/components/platform/saas/FreeForeverToast";
import SrRoot from "@/components/platform/saas/SrRoot";
import SaasFloatingContact from "@/components/platform/saas/SaasFloatingContact";


/** The product website exists only on the product's own host; on a customer's domain this path is not a page. */
export default async function SaasLayout({ children }: { children: React.ReactNode }) {
  if (!(await onSaasHost())) notFound();
  const host = saasCanonicalHost(await requestHostOrNull());
  const origin = await saasOrigin();
  const contact = saasContact(host);
  /** The brand's own profiles (`SAAS_SOCIAL_URLS`, comma separated): LinkedIn, X, YouTube, Facebook, Instagram. Only real ones are listed. */
  const sameAs = (process.env.SAAS_SOCIAL_URLS ?? "").split(",").map((u) => u.trim()).filter((u) => /^https:\/\//.test(u));
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: SAAS_BRAND.name,
    legalName: SAAS_BRAND.operator || undefined,
    url: origin,
    logo: { "@type": "ImageObject", url: `${origin}${SAAS_BRAND.assets.mark}`, width: 512, height: 512 },
    image: `${origin}${SAAS_BRAND.assets.logo}`,
    brand: { "@type": "Brand", name: SAAS_BRAND.name },
    description: SAAS_BRAND.description,
    slogan: SAAS_BRAND.tagline,
    ...(sameAs.length ? { sameAs } : {}),
    knowsAbout: ["Business automation", "CRM", "HR and payroll", "Accounting", "Project management", "Procurement", "AI assistants", "Website building"],
    contactPoint: [
      { "@type": "ContactPoint", contactType: "sales", email: contact.sales, availableLanguage: ["English"] },
      { "@type": "ContactPoint", contactType: "customer support", email: contact.support, availableLanguage: ["English"] },
    ],
  };
  const site = { "@context": "https://schema.org", "@type": "WebSite", "@id": `${origin}/#website`, name: SAAS_BRAND.name, alternateName: ["SelfRun", "SelfRun Business"], url: origin, inLanguage: "en-IN", publisher: { "@id": `${origin}/#organization` } };
  // The product's own colours (light by default, dark when chosen), set on the wrapper.
  return (
    <SrRoot>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(org) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(site) }} />
      <Interactions />
      <OfferTopBar />
      <Header />
      <main>{children}</main>
      <Footer host={host} />
      <FreeForeverToast />
      <SaasFloatingContact />
    </SrRoot>
  );
}
