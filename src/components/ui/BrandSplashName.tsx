"use client";

import { BrandName, useBrand } from "@/components/platform/BrandProvider";

/** The company's name under its mark, or nothing at all when the host has no company (nothing here is ever the product's own). */
export default function BrandSplashName({ className = "" }: { className?: string }) {
  const brand = useBrand();
  if (!brand.name && !brand.namePrimary) return null;
  return (
    <p className={className}>
      <BrandName />
    </p>
  );
}
