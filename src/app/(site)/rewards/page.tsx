import { getCurrentPortalUser } from "@/lib/portal-auth";
import { jsonForScript } from "@/lib/security/json-script";
import { getRewardsGuide } from "@/lib/wallet/guide";
import { GUIDE_FAQS } from "@/lib/wallet/earn-guide";
import { cmsPageMetadata, requirePublicPage } from "@/lib/products/sitecraft-ai/page-route";
import RewardsContent from "./Content";

/** SEO + structured data: the CMS page "/rewards". The guide itself comes from the Wallet product's reward rules. */
export const generateMetadata = () => cmsPageMetadata("/rewards");

// Amounts come from the live reward rules, so this page is rendered per request.
export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const [page, guide, user] = await Promise.all([requirePublicPage("/rewards"), getRewardsGuide(), getCurrentPortalUser()]);
  return (
    <>
      {page.jsonLd.map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />
      ))}
      <RewardsContent guide={guide} signedIn={Boolean(user)} defaultAudience={user?.role ?? "trainee"} faqs={GUIDE_FAQS} />
    </>
  );
}
