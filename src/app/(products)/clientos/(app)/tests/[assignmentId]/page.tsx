import { notFound } from "next/navigation";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import CandidateAssignment from "@/components/products/evaliq/CandidateAssignment";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { TEST_TAKER_ROLES } from "@/lib/portal-roles";
import { resolveTaker, basePath } from "@/lib/products/evaliq/taker";
import { candidateAssignment } from "@/lib/products/evaliq/candidate";

export const dynamic = "force-dynamic";

export default async function PortalTestPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  await guardPortalPage(...TEST_TAKER_ROLES);
  const taker = await resolveTaker("portal");
  if (!taker) notFound();
  const { assignmentId } = await params;
  const data = await candidateAssignment(taker, assignmentId).catch(() => null);
  if (!data) notFound();
  return (
    <div className="space-y-5">
      <PortalPageHeader title={data.card.testName} subtitle={[data.card.testType, data.card.category].filter(Boolean).join(" · ")} />
      <CandidateAssignment data={data} channel="portal" paths={basePath("portal")} />
    </div>
  );
}
