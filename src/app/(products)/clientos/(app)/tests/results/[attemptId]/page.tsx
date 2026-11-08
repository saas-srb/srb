import { notFound } from "next/navigation";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import ResultReport from "@/components/products/evaliq/ResultReport";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { TEST_TAKER_ROLES } from "@/lib/portal-roles";
import { resolveTaker } from "@/lib/products/evaliq/taker";
import { candidateResult } from "@/lib/products/evaliq/attempts";

export const dynamic = "force-dynamic";

export default async function PortalResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  await guardPortalPage(...TEST_TAKER_ROLES);
  const taker = await resolveTaker("portal");
  if (!taker) notFound();
  const { attemptId } = await params;
  const view = await candidateResult(taker, attemptId).catch(() => null);
  if (!view) notFound();
  return (
    <div className="space-y-5">
      <PortalPageHeader title={view.testName} subtitle={`Attempt ${view.attemptNo}`} />
      <ResultReport view={view} />
    </div>
  );
}
