import type { Metadata } from "next";
import LegalPage from "@/components/platform/saas/LegalPage";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import { cookiesDoc } from "@/lib/platform/saas/legal-india";
import { loadLegalContext } from "@/lib/platform/saas/legal-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/cookies", title: "Cookie Policy", description: "The cookies and similar browser storage SelfRun AI uses, why, how long they last and how to control them." });

export default async function Page() {
  return <LegalPage doc={cookiesDoc(await loadLegalContext())} />;
}
