import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import SaasAskContent from "./SaasAskContent";

export const metadata: Metadata = pageMeta({ path: "/ask", title: "Ask AI About SelfRun", description: "Ask the SelfRun AI assistant about products, plans, setup and security. Answers come from the platform's own documentation.", keywords: ["ask AI about business software", "SelfRun AI assistant", "business software chatbot"], tag: "Ask AI" });

export default function SaasAskPage() {
  return (
    <>
      <h1 className="sr-only">Ask the SelfRun AI assistant</h1>
      <SaasAskContent />
    </>
  );
}
