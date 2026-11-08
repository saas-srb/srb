import type { Metadata } from "next";
import LegalPage from "@/components/platform/saas/LegalPage";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import { privacyDoc } from "@/lib/platform/saas/legal-india";
import { loadLegalContext } from "@/lib/platform/saas/legal-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/privacy", title: "Privacy Policy", description: "How SelfRun AI collects, uses and protects personal data in India under the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000: purposes, consent, your rights, retention and how to complain." });

export default async function Page() {
  return <LegalPage doc={privacyDoc(await loadLegalContext())} />;
}
