import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/products/evaliq/OtsUi";
import CandidateTests from "@/components/products/evaliq/CandidateTests";
import { resolveTaker, basePath } from "@/lib/products/evaliq/taker";
import { candidateCards } from "@/lib/products/evaliq/candidate";

export default async function MyTestsPage() {
  const taker = await resolveTaker("staff");
  if (!taker) redirect("/evaliq");
  const cards = await candidateCards(taker);
  return (
    <div className="space-y-4">
      <PageHeader title="My Tests" crumbs={[{ label: "My Tests" }]} description="Tests assigned to you — pending, in progress, completed and expired." />
      <PanelListFilters>
<CandidateTests cards={cards} channel="staff" paths={basePath("staff")} />
</PanelListFilters>
    </div>
  );
}
