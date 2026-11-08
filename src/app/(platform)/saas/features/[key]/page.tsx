import { permanentRedirect } from "next/navigation";
import { productPath } from "@/lib/platform/saas/product-routes";

export default async function FeatureDetailRedirect({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  permanentRedirect(productPath(key));
}
