import { productOgSize, renderProductOgImage } from "@/lib/products/og";

export const dynamic = "force-dynamic";
export const size = productOgSize;
export const contentType = "image/png";
export const alt = "Products";

export default async function Image() {
  return renderProductOgImage();
}
