import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import LegalPage from "@/components/platform/saas/LegalPage";
import { LEGAL_EXTRA } from "@/lib/platform/saas/site";

const doc = LEGAL_EXTRA.sla;
export const metadata: Metadata = pageMeta({ path: "/sla", title: doc.title, description: "SelfRun AI's availability commitment: 99.9% monthly uptime on paid plans, how it is measured, what is excluded and the service credits if we miss it.", keywords: ["uptime SLA", "SaaS service level agreement", "software uptime commitment"], tag: "Legal" });
export default function SlaPage() {
  return <LegalPage doc={doc} />;
}
