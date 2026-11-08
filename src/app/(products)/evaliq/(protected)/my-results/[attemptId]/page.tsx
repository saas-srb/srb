import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/products/evaliq/OtsUi";
import ResultReport from "@/components/products/evaliq/ResultReport";
import { can, getViewer } from "@/lib/products/evaliq/viewer";
import { resolveTaker } from "@/lib/products/evaliq/taker";
import { candidateResult } from "@/lib/products/evaliq/attempts";

export default async function MyResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  // Seeing your own results is its own permission (ots.canViewOwnResults), on top of being able to take tests.
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "VIEW_RESULTS")) redirect("/evaliq");
  const taker = await resolveTaker("staff");
  if (!taker) redirect("/evaliq");
  const { attemptId } = await params;
  const view = await candidateResult(taker, attemptId).catch(() => null);
  if (!view) notFound();
  return (
    <div className="space-y-4">
      <PageHeader title={view.testName} crumbs={[{ label: "My Results", href: "/evaliq/my-results" }, { label: `Attempt ${view.attemptNo}` }]} description={`Attempt ${view.attemptNo}`} />
      <ResultReport view={view} />
    </div>
  );
}
