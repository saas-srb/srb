import { notFound } from "next/navigation";

/** Any address under this product that no page claims: shown as the product's own 404 (inside its sidebar and top bar). */
export default function UnknownPage() {
  notFound();
}
