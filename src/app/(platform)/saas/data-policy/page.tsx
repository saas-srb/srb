import type { Metadata } from "next";
import LegalPage from "@/components/platform/saas/LegalPage";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import { dataPolicyDoc } from "@/lib/platform/saas/legal-india";
import { loadLegalContext } from "@/lib/platform/saas/legal-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/data-policy", title: "Data Policy", description: "How SelfRun AI treats the data stored in a workspace: ownership, isolation, AI processing, security safeguards, export and deletion under Indian law." });

export default async function Page() {
  return <LegalPage doc={dataPolicyDoc(await loadLegalContext())} />;
}
