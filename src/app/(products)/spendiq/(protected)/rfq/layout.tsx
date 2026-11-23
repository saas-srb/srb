import { prmsPage } from "@/lib/products/spendiq/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function RfqLayout({ children }: { children: React.ReactNode }) {
  const g = await prmsPage("rfq.view", "Rfq");
  if (!g.user) return g.locked;
  return children;
}
