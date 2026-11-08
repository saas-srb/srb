import type { Metadata } from "next";
import LegalPage from "@/components/platform/saas/LegalPage";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import { subprocessorsDoc } from "@/lib/platform/saas/legal-india";
import { loadLegalContext } from "@/lib/platform/saas/legal-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/subprocessors", title: "Sub-processors and International Transfers", description: "The providers SelfRun AI uses to run the service, what each one receives, and how personal data is protected when it leaves India." });

export default async function Page() {
  return <LegalPage doc={subprocessorsDoc(await loadLegalContext())} />;
}
