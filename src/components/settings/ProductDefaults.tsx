import ProductDefaultsList from "@/components/settings/ProductDefaultsList";
import { companySettingStates } from "@/lib/platform/defaults/product/company";

/** The "Defaults" block of a product's settings screen (the screen has already checked the person may manage it). */
export default async function ProductDefaults({ product }: { product: string }) {
  const states = await companySettingStates(product);
  return states.length ? <ProductDefaultsList product={product} states={states} /> : null;
}
