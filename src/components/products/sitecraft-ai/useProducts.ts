"use client";

import { productsCollection } from "@/lib/products/sitecraft-ai/collections/products-def";
import type { ProductItem } from "@/types/content";
import { useRuntime } from "@/components/products/sitecraft-ai/CollectionsContext";

/** Products — its own module so only the product page pulls the catalogue into its bundle. */
export const useProducts = () => useRuntime<ProductItem>("products", productsCollection);
