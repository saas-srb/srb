import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import LegalPage from "@/components/platform/saas/LegalPage";
import { LEGAL_EXTRA } from "@/lib/platform/saas/site";
import { jsonForScript } from "@/lib/security/json-script";

const doc = LEGAL_EXTRA.security;
export const metadata: Metadata = pageMeta({ path: "/security", title: "Security & Trust: How Your Business Data Is Protected", description: "How SelfRun AI separates every company's data, controls access with roles and permissions, keeps AI and automation inside your permissions, and lets you export your data or leave.", keywords: ["SaaS security", "business software security", "data isolation multi-tenant", "role based access control software", "audit log software", "two factor authentication software", "data encryption business software"], tag: "Legal" });

/** The trust page, also published as FAQ data so a search engine or an AI assistant reading it gets each answer on its own. */
export default function SecurityPage() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: doc.sections.map((s) => ({ "@type": "Question", name: s.heading, acceptedAnswer: { "@type": "Answer", text: [...(s.body ?? []), ...(s.list ?? [])].join(" ") } })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(ld) }} />
      <LegalPage doc={doc} />
    </>
  );
}
