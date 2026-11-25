"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useUnavailableProducts } from "@/components/platform/PanelsProvider";
import { localHref } from "@/lib/platform/products/routes";

/**
 * A link that may point into another product. A company without that product goes to the same record inside its own
 * product when there is such a screen; otherwise the text shows without a link (or `fallback`, which may be null).
 */
export default function ProductLink({ href, children, fallback, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string; fallback?: ReactNode }) {
  const target = localHref(href, useUnavailableProducts());
  if (target) return <Link {...props} href={target}>{children}</Link>;
  return fallback === undefined ? <span>{children}</span> : <>{fallback}</>;
}
