"use client";

import { createContext, useContext } from "react";
import { EMPTY_SITE_INFO, type SiteInfo } from "@/lib/products/sitecraft-ai/site-info-shared";
import { TextProvider } from "@/components/products/sitecraft-ai/TextContext";

/**
 * Site identity & contact (CMS → Site Identity), provided by the root layout so
 * every client component that shows contact details / social links / brand
 * reads the same values. Every site layout provides it.
 */
const SiteInfoContext = createContext<SiteInfo>(EMPTY_SITE_INFO);

export function SiteInfoProvider({ value, children }: { value: SiteInfo; children: React.ReactNode }) {
  return (
    <SiteInfoContext.Provider value={value}>
      <TextProvider text={value.text}>{children}</TextProvider>
    </SiteInfoContext.Provider>
  );
}

export const useSiteInfo = () => useContext(SiteInfoContext);

/** Interface text for shared components (CMS → Site Identity → Interface text). */
export const useUiLabels = () => useContext(SiteInfoContext).labels;
