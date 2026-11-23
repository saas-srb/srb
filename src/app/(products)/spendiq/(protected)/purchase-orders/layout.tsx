import { prmsPage } from "@/lib/products/spendiq/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function PurchaseordersLayout({ children }: { children: React.ReactNode }) {
  const g = await prmsPage("purchaseorders.view", "Purchase orders");
  if (!g.user) return g.locked;
  return children;
}
