import { hrPage } from "@/lib/products/talentos/page-guard";

// Everybody given TalentOS has a profile. The menu hides it from people without it; a typed address shows the polite locked page.
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage("profile.view", "My profile");
  if (g.locked) return g.locked;
  return children;
}
