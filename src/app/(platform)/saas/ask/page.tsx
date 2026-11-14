import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import SaasAskContent from "./SaasAskContent";

export const metadata: Metadata = pageMeta({ path: "/ask", title: "Ask AI About SRB", description: "Ask the SRB AI assistant about products, plans, setup and security. Answers come from the platform's own documentation.", keywords: ["ask AI about business software", "SRB AI assistant", "business software chatbot"], tag: "Ask AI" });

export default function SaasAskPage() {
  return (
    <>
      <h1 className="sr-only">Ask the SRB AI assistant</h1>
      <SaasAskContent />
    </>
  );
}
