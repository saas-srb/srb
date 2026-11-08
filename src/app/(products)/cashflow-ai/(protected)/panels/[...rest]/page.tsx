import { redirect } from "next/navigation";

/** Keep old CashFlow AI links working after the cross-product routes moved to /products. */
export default async function LegacyProductRoute({ params }: { params: Promise<{ rest: string[] }> }) {
  const { rest } = await params;
  redirect(`/cashflow-ai/products/${rest.map(encodeURIComponent).join("/")}`);
}
