import { tmsPage } from "@/lib/products/cohort-ai/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function PaymentsLayout({ children }: { children: React.ReactNode }) {
  const g = await tmsPage("payments.view", "Payments");
  if (!g.user) return g.locked;
  return children;
}
