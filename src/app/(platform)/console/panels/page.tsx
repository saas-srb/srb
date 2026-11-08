import { redirect } from "next/navigation";

/** Keep old bookmarks working after the Product Registry moved to /console/products. */
export default function LegacyProductsRoute() {
  redirect("/console/products");
}
