import { productOgSize, renderProductOgImage } from "@/lib/products/og";

export const dynamic = "force-dynamic";
export const size = productOgSize;
export const contentType = "image/png";
export const alt = "Product";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  return renderProductOgImage((await params).slug);
}
