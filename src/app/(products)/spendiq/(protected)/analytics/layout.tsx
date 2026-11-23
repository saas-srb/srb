import { prmsPage } from "@/lib/products/spendiq/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const g = await prmsPage("analytics.view", "Analytics");
  if (!g.user) return g.locked;
  return children;
}
