import { prmsPage } from "@/lib/products/spendiq/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function InfrastructureLayout({ children }: { children: React.ReactNode }) {
  const g = await prmsPage("infrastructure.view", "Infrastructure");
  if (!g.user) return g.locked;
  return children;
}
