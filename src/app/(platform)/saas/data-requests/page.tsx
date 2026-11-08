import type { Metadata } from "next";
import LegalPage from "@/components/platform/saas/LegalPage";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import { dataRequestsDoc } from "@/lib/platform/saas/legal-india";
import { loadLegalContext } from "@/lib/platform/saas/legal-context";
import InquiryForm from "@/components/platform/saas/InquiryForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/data-requests", title: "Your Data Rights and Requests", description: "How to use your rights under India's Digital Personal Data Protection Act, 2023 with SelfRun AI: a summary of your data, correction, erasure, grievance redressal and nomination." });

export default async function Page() {
  return <LegalPage doc={dataRequestsDoc(await loadLegalContext())} after={<InquiryForm kind="privacy" />} />;
}
