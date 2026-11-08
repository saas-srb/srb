"use client";

import React from "react";
import { useBrand } from "@/components/platform/BrandProvider";
import { brandInitials } from "@/lib/platform/branding/types";

/**
 * The current company's logo mark: its uploaded logo, else a monogram of its
 * initials in the active theme's primary colour. Nothing here belongs to any
 * one company.
 */
export default function BrandMark({ className = "w-4 h-4 shrink-0" }: { className?: string }) {
  const brand = useBrand();
  if (brand.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- company-uploaded logo from arbitrary storage hosts
    return <img src={brand.logoUrl} alt="" aria-hidden="true" className={`${className} rounded object-contain`} />;
  }
  // SVG so the initials scale with whatever size the mark is given.
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" className="fill-primary" />
      <text x="32" y="33" textAnchor="middle" dominantBaseline="central" fontSize="28" fontWeight="800" className="fill-primary-foreground">
        {brandInitials(brand.name || `${brand.namePrimary} ${brand.nameAccent}`)}
      </text>
    </svg>
  );
}
