import { hrPage } from "@/lib/products/talentos/page-guard";

// Candidates and offers carry personal and salary details: the menu hides Recruitment from people without it; a typed address shows the polite locked page.
export default async function RecruitmentLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage("recruitment.view", "Recruitment");
  if (g.locked) return g.locked;
  return children;
}
