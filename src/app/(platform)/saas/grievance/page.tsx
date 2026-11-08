import type { Metadata } from "next";
import LegalPage from "@/components/platform/saas/LegalPage";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import { grievanceDoc } from "@/lib/platform/saas/legal-india";
import { loadLegalContext } from "@/lib/platform/saas/legal-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/grievance", title: "Grievance Redressal", description: "The Grievance Officer of SelfRun AI: how to file a complaint, how fast it is answered, and where to go if you are not satisfied." });

export default async function Page() {
  return <LegalPage doc={grievanceDoc(await loadLegalContext())} />;
}
