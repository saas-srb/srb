import { pbPage } from "@/lib/products/playbook-ai/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function AssignedSOPsLayout({ children }: { children: React.ReactNode }) {
  const g = await pbPage("sops.view", "Assigned SOPs");
  if (!g.user) return g.locked;
  return children;
}
