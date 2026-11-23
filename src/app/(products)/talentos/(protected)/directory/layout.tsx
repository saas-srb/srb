import { hrPage } from "@/lib/products/talentos/page-guard";

// The colleague directory. The menu hides it from people without it; a typed address shows the polite locked page.
export default async function DirectoryLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage("directory.view", "Directory");
  if (g.locked) return g.locked;
  return children;
}
