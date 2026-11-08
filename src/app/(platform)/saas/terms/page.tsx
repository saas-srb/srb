import type { Metadata } from "next";
import LegalPage from "@/components/platform/saas/LegalPage";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import { termsDoc } from "@/lib/platform/saas/legal-india";
import { loadLegalContext } from "@/lib/platform/saas/legal-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/terms", title: "Terms of Service", description: "The terms that apply when you use the SelfRun AI website and service in India: accounts, plans and GST, your data, acceptable use, liability, governing law and arbitration." });

export default async function Page() {
  return <LegalPage doc={termsDoc(await loadLegalContext())} />;
}
