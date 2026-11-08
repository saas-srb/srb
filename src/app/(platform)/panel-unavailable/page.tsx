import { redirect } from "next/navigation";

/** Legacy address; unavailable products now use the product naming in their route. */
export default function LegacyUnavailableProductRoute() {
  redirect("/product-unavailable");
}
