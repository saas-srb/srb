"use client";

import { useMemo } from "react";
import { TextProvider } from "@/components/products/sitecraft-ai/TextContext";
import ProductMockup from "@/components/products/ProductMockup";
import { productsCollection } from "@/lib/products/sitecraft-ai/collections/products-def";
import type { StoredProduct } from "@/lib/products/shared";

/**
 * The interactive UI preview (the same `ProductMockup` the catalogue uses).
 * `mockupText` is the catalogue's own mockup wording (`catalog.productMockup.*`), which the preview's chrome reads.
 */
export default function ProductTour({ product, mockupText, selector = true, compact = false }: { product: StoredProduct; mockupText: Record<string, string>; selector?: boolean; compact?: boolean }) {
  const runtime = useMemo(() => productsCollection.toRuntime(product), [product]);
  if (!runtime.screens.length) return null;
  return (
    <TextProvider text={mockupText}>
      <ProductMockup product={runtime} showTabSelector={selector} compact={compact} />
    </TextProvider>
  );
}
