"use client";

import { createContext, useContext } from "react";
import { NEUTRAL_BRAND, type CompanyBrand } from "@/lib/platform/branding/types";

const BrandContext = createContext<CompanyBrand>(NEUTRAL_BRAND);

/** Provided once in the root layout with the current company's brand. */
export function BrandProvider({ brand, children }: { brand: CompanyBrand; children: React.ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): CompanyBrand {
  return useContext(BrandContext);
}

/** The company's two-tone wordmark (primary part in the text colour, accent part in the brand colour). */
export function BrandName() {
  const { namePrimary, nameAccent } = useBrand();
  return (
    <span>
      <span className="text-foreground">{namePrimary}</span>
      {nameAccent && <span className="text-primary">{nameAccent}</span>}
    </span>
  );
}
