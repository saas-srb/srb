import { hrPage } from "@/lib/products/talentos/page-guard";

// HR analytics for the people the person's scope covers. The menu hides it from people without it; a typed address shows the polite locked page.
export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage("analytics.view", "Analytics");
  if (g.locked) return g.locked;
  return children;
}
