import { prmsPage } from "@/lib/products/spendiq/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function AssetsLayout({ children }: { children: React.ReactNode }) {
  const g = await prmsPage("assets.view", "Assets");
  if (!g.user) return g.locked;
  return children;
}
