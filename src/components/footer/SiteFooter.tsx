import Footer from "@/components/Footer";
import FooterCompact from "@/components/FooterCompact";
import { FooterCentered, FooterSplit, FooterMinimal } from "@/components/footer/FooterVariants";
import type { SiteInfo } from "@/lib/products/sitecraft-ai/site-info-shared";
import type { PublicFooterColumn } from "@/lib/products/sitecraft-ai/footer";

/** The footer layout the active theme picked (component-variants.ts); anything unknown is the standard footer. */
export default function SiteFooter({ variant, cmsFooter, siteInfo }: { variant: string; cmsFooter: PublicFooterColumn[]; siteInfo: SiteInfo }) {
  switch (variant) {
    case "compact": return <FooterCompact cmsFooter={cmsFooter} siteInfo={siteInfo} />;
    case "centered": return <FooterCentered cmsFooter={cmsFooter} siteInfo={siteInfo} />;
    case "split": return <FooterSplit cmsFooter={cmsFooter} siteInfo={siteInfo} />;
    case "minimal": return <FooterMinimal cmsFooter={cmsFooter} siteInfo={siteInfo} />;
    default: return <Footer cmsFooter={cmsFooter} siteInfo={siteInfo} />;
  }
}
