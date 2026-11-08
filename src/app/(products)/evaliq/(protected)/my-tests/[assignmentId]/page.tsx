import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/products/evaliq/OtsUi";
import CandidateAssignment from "@/components/products/evaliq/CandidateAssignment";
import { resolveTaker, basePath } from "@/lib/products/evaliq/taker";
import { candidateAssignment } from "@/lib/products/evaliq/candidate";

export default async function MyTestPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const taker = await resolveTaker("staff");
  if (!taker) redirect("/evaliq");
  const { assignmentId } = await params;
  const data = await candidateAssignment(taker, assignmentId).catch(() => null);
  if (!data) notFound();
  return (
    <div className="space-y-4">
      <PageHeader title={data.card.testName} crumbs={[{ label: "My Tests", href: "/evaliq/my-tests" }, { label: data.card.testName }]} description={[data.card.testType, data.card.category].filter(Boolean).join(" · ")} />
      <CandidateAssignment data={data} channel="staff" paths={basePath("staff")} />
    </div>
  );
}
