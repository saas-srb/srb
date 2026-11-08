import ProductDetailPage, { generateProductMetadata } from "@/components/platform/saas/ProductDetailPage";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return generateProductMetadata("sprintos");
}

export default function ProductRoute() {
  return <ProductDetailPage productSlug="sprintos" />;
}
