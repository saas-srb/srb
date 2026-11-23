import { prmsPage } from "@/lib/products/spendiq/page-guard";

// The Procurement Hub lists every requisition, purchase order and vendor: the menu hides it from people without it; a typed address shows the polite locked page.
export default async function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const g = await prmsPage("procurement.view", "Procurement");
  if (!g.user) return g.locked;
  return children;
}
