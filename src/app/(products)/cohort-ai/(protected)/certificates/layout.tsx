import { tmsPage } from "@/lib/products/cohort-ai/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function CertificatesLayout({ children }: { children: React.ReactNode }) {
  const g = await tmsPage("certificates.view", "Certificates");
  if (!g.user) return g.locked;
  return children;
}
