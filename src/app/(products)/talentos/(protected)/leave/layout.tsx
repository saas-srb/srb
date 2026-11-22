import { hrPage } from "@/lib/products/talentos/page-guard";

// One Leave section for everyone. The menu hides it from people without it; a typed address shows the polite locked page.
export default async function LeaveLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage("leave.view", "Leave");
  if (g.locked) return g.locked;
  return children;
}
