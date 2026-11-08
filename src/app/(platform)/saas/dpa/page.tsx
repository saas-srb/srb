import type { Metadata } from "next";
import LegalPage from "@/components/platform/saas/LegalPage";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import { dpaDoc } from "@/lib/platform/saas/legal-india";
import { loadLegalContext } from "@/lib/platform/saas/legal-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/dpa", title: "Data Processing Addendum", description: "How SelfRun AI processes personal data on behalf of its customers under the Digital Personal Data Protection Act, 2023: roles, instructions, security, sub-processors, transfers, breach notice, and return or erasure." });

export default async function Page() {
  return <LegalPage doc={dpaDoc(await loadLegalContext())} />;
}
