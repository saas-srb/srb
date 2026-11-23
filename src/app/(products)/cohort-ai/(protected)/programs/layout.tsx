import { tmsPage } from "@/lib/products/cohort-ai/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function ProgramsLayout({ children }: { children: React.ReactNode }) {
  const g = await tmsPage("programs.view", "Programs");
  if (!g.user) return g.locked;
  return children;
}
