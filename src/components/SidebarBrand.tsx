"use client";

import BrandMark from "@/components/BrandMark";
import { BrandName, useBrand } from "@/components/platform/BrandProvider";

/**
 * The brand at the top of a product sidebar. On the SelfRun product host it is the full SelfRun Business logo (the same one as the website
 * header, light or dark to suit the theme); for every company it is that company's own mark and name, unchanged.
 */
export default function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  const brand = useBrand();
  if (brand.wordmarkUrl && !collapsed) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.wordmarkUrl} alt={brand.name} className="block h-9 w-auto max-w-full object-contain dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.wordmarkDarkUrl || brand.wordmarkUrl} alt={brand.name} className="hidden h-9 w-auto max-w-full object-contain dark:block" />
      </>
    );
  }
  return (
    <>
      <BrandMark className="size-6 shrink-0" />
      {!collapsed && (
        <span className="truncate text-sm font-bold">
          <BrandName />
        </span>
      )}
    </>
  );
}
