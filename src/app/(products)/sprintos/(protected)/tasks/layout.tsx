import { pmsPage } from "@/lib/products/sprintos/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const g = await pmsPage("projects.view", "My tasks");
  if (!g.user) return g.locked;
  return children;
}
