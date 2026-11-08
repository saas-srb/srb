import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/products/rankmax-ai/SeoUi";
import AuditRunSummary from "@/components/products/rankmax-ai/AuditRunSummary";
import { getViewer } from "@/lib/products/rankmax-ai/viewer";
import { getRun } from "@/lib/products/rankmax-ai/crawler";
import { formatDateTime } from "@/lib/utils";

export default async function AuditRunPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();
  return (
    <div className="space-y-4">
      <PageHeader title={`Audit · ${formatDateTime(run.startedAt)}`} crumbs={[{ label: "Website Audit", href: "/rankmax-ai/audit" }, { label: "Run" }]} description="Counts are this run's findings; the issue list always shows the current state (issues fixed since then are resolved)." />
      <AuditRunSummary run={run} />
    </div>
  );
}
