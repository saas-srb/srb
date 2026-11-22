import { hrPage } from "@/lib/products/talentos/page-guard";

// One Requests section for everyone. The menu hides it from people without it; a typed address shows the polite locked page.
export default async function RequestsLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage("requests.view", "Requests");
  if (g.locked) return g.locked;
  return children;
}
