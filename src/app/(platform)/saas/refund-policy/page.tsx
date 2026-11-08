import type { Metadata } from "next";
import LegalPage from "@/components/platform/saas/LegalPage";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import { refundDoc } from "@/lib/platform/saas/legal-india";
import { loadLegalContext } from "@/lib/platform/saas/legal-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/refund-policy", title: "Refund & Cancellation Policy", description: "How cancelling, refunds, failed payments and GST credit notes work for SelfRun AI customers in India, and how fast a billing complaint is answered." });

export default async function Page() {
  return <LegalPage doc={refundDoc(await loadLegalContext())} />;
}
