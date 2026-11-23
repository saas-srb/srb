import { tmsPage } from "@/lib/products/cohort-ai/page-guard";

// Detail pages are the staff tier's: a student's own records are on the main page, so a typed address for a detail page needs the everyone's scope.
export default async function ProjectsDetailLayout({ children }: { children: React.ReactNode }) {
  const g = await tmsPage("projects.all", "Projects");
  if (!g.user) return g.locked;
  return children;
}
