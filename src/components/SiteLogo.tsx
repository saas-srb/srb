"use client";

import BrandMark from "@/components/BrandMark";

/**
 * The site's logo mark: the CMS Site Identity logo (with an optional dark-mode
 * image) when one is set, else the company's own mark — its uploaded brand
 * logo or a monogram of its initials (the platform owner keeps the built-in
 * artwork). Nothing here is tied to one company.
 */
export default function SiteLogo({ className, logoUrl, logoDarkUrl }: { className: string; logoUrl: string; logoDarkUrl?: string }) {
  if (!logoUrl) return <BrandMark className={`${className} shrink-0`} />;
  if (logoDarkUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- CMS logo URL (any host) */}
        <img src={logoUrl} alt="" className={`${className} object-contain dark:hidden`} />
        {/* eslint-disable-next-line @next/next/no-img-element -- CMS logo URL (any host) */}
        <img src={logoDarkUrl} alt="" className={`${className} hidden object-contain dark:block`} />
      </>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- CMS logo URL (any host)
  return <img src={logoUrl} alt="" className={`${className} object-contain`} />;
}
