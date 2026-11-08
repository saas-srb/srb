import { redirect } from "next/navigation";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import { PageHeader } from "@/components/products/evaliq/OtsUi";
import CandidateHistory from "@/components/products/evaliq/CandidateHistory";
import { can, getViewer } from "@/lib/products/evaliq/viewer";
import { resolveTaker, basePath } from "@/lib/products/evaliq/taker";
import { candidateHistory } from "@/lib/products/evaliq/candidate";
import { listCategories } from "@/lib/products/evaliq/categories";

export default async function MyResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  // Seeing your own results is its own permission (ots.canViewOwnResults), on top of being able to take tests.
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "VIEW_RESULTS")) redirect("/evaliq");
  const taker = await resolveTaker("staff");
  if (!taker) redirect("/evaliq");
  const sp = await searchParams;
  const [rows, cats] = await Promise.all([candidateHistory(taker, sp), listCategories("test")]);
  return (
    <div className="space-y-4">
      <PageHeader title="My Results" crumbs={[{ label: "My Results" }]} description="Your complete test history — every attempt." />
      <SmmsFilterBar
        values={{ q: sp.q ?? "", status: sp.status ?? "", categoryId: sp.categoryId ?? "", from: sp.from ?? "", to: sp.to ?? "" }}
        fields={[
          { key: "q", label: "Search", type: "search", placeholder: "Test name" },
          { key: "status", label: "Result", type: "select", options: [{ value: "passed", label: "Passed" }, { value: "failed", label: "Failed" }, { value: "pending", label: "Pending / not released" }] },
          { key: "categoryId", label: "Category", type: "select", options: cats.map((c) => ({ value: c._id, label: c.name })) },
          { key: "from", label: "From", type: "date" },
          { key: "to", label: "To", type: "date" },
        ]}
      />
      <CandidateHistory rows={rows} paths={basePath("staff")} />
    </div>
  );
}
