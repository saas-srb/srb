import { prmsPage } from "@/lib/products/spendiq/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function GrnLayout({ children }: { children: React.ReactNode }) {
  const g = await prmsPage("grn.view", "Grn");
  if (!g.user) return g.locked;
  return children;
}
