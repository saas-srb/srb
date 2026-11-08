import { PortalPageHeader } from "@/components/products/clientos/widgets";
import CandidateHistory from "@/components/products/evaliq/CandidateHistory";
import PortalTestsNav from "@/components/products/evaliq/PortalTestsNav";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { TEST_TAKER_ROLES } from "@/lib/portal-roles";
import { resolveTaker, basePath } from "@/lib/products/evaliq/taker";
import { candidateHistory } from "@/lib/products/evaliq/candidate";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Test Results · {brand} {product:portal}");

export default async function PortalResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await guardPortalPage(...TEST_TAKER_ROLES);
  const taker = await resolveTaker("portal");
  const sp = await searchParams;
  const rows = taker ? await candidateHistory(taker, sp) : [];
  return (
    <div className="space-y-5">
      <PortalPageHeader title="My Results" subtitle="Every attempt, with scores once they are released." />
      <PortalTestsNav active="results" />
      <SmmsFilterBar
        values={{ q: sp.q ?? "", status: sp.status ?? "", from: sp.from ?? "", to: sp.to ?? "" }}
        fields={[
          { key: "q", label: "Search", type: "search", placeholder: "Test name" },
          { key: "status", label: "Result", type: "select", options: [{ value: "passed", label: "Passed" }, { value: "failed", label: "Failed" }, { value: "pending", label: "Pending / not released" }] },
          { key: "from", label: "From", type: "date" },
          { key: "to", label: "To", type: "date" },
        ]}
      />
      <CandidateHistory rows={rows} paths={basePath("portal")} />
    </div>
  );
}
