import { hrPage } from "@/lib/products/talentos/page-guard";

// The menu hides Departments from people without it; a typed address shows the polite locked page.
export default async function DepartmentsLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage("masters.view", "Departments");
  if (g.locked) return g.locked;
  return children;
}
