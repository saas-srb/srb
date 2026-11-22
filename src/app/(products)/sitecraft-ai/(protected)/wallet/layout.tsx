import ProductLocked from "@/components/products/common/ProductLocked";
import { requireGrowth } from "@/lib/products/sitecraft-ai/growth";

// Every page in this section is for people who hold the tool through SiteCraft or through DealFlow; anyone else gets the polite locked page.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireGrowth("wallet");
  if (!user) return <ProductLocked product="sitecraft-ai" feature="Wallets & rewards" />;
  return children;
}
