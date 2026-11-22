import { notFound, redirect } from "next/navigation";
import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import { PageHeader } from "@/components/products/evaliq/OtsUi";
import CandidateTests from "@/components/products/evaliq/CandidateTests";
import CandidateAssignment from "@/components/products/evaliq/CandidateAssignment";
import CandidateHistory from "@/components/products/evaliq/CandidateHistory";
import ResultReport from "@/components/products/evaliq/ResultReport";
import { lockedUnless } from "@/lib/products/evaliq/gate";
import { can, type OtsViewer } from "@/lib/products/evaliq/viewer";
import { resolveTaker, basePath } from "@/lib/products/evaliq/taker";
import { candidateAssignment, candidateCards, candidateHistory } from "@/lib/products/evaliq/candidate";
import { candidateResult } from "@/lib/products/evaliq/attempts";
import { listCategories } from "@/lib/products/evaliq/categories";

/**
 * The person's OWN tests and results, shown on the same pages the people with everyone's scope use (Assigned tests, Results): the page picks the
 * view by scope, the data loaders only ever return the person's own records. (These replace the old separate "My Tests" and "My Results" pages.)
 */

export async function OwnAssignments({ viewer }: { viewer: OtsViewer }) {
  const locked = lockedUnless(viewer, "assignments.own", "Assigned tests");
  if (locked) return locked;
  const taker = await resolveTaker("staff");
  if (!taker) redirect("/evaliq");
  const cards = await candidateCards(taker);
  return (
    <div className="space-y-4">
      <PageHeader title="Assigned Tests" crumbs={[{ label: "Assigned Tests" }]} description="Tests assigned to you — pending, in progress, completed and expired." />
      <PanelListFilters>
        <CandidateTests cards={cards} channel="staff" paths={basePath("staff")} />
      </PanelListFilters>
    </div>
  );
}

export async function OwnAssignment({ viewer, assignmentId }: { viewer: OtsViewer; assignmentId: string }) {
  const locked = lockedUnless(viewer, "assignments.own", "Assigned tests");
  if (locked) return locked;
  const taker = await resolveTaker("staff");
  if (!taker) redirect("/evaliq");
  const data = await candidateAssignment(taker, assignmentId).catch(() => null);
  if (!data) notFound();
  return (
    <div className="space-y-4">
      <PageHeader title={data.card.testName} crumbs={[{ label: "Assigned Tests", href: "/evaliq/assignments" }, { label: data.card.testName }]} description={[data.card.testType, data.card.category].filter(Boolean).join(" · ")} />
      <CandidateAssignment data={data} channel="staff" paths={basePath("staff")} />
    </div>
  );
}

export async function OwnResults({ viewer, sp }: { viewer: OtsViewer; sp: Record<string, string | undefined> }) {
  const locked = lockedUnless(viewer, "results.own", "Results");
  if (locked) return locked;
  const taker = await resolveTaker("staff");
  if (!taker) redirect("/evaliq");
  const [rows, cats] = await Promise.all([candidateHistory(taker, sp), listCategories("test")]);
  return (
    <div className="space-y-4">
      <PageHeader title="Results" crumbs={[{ label: "Results" }]} description="Your complete test history — every attempt." />
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

export async function OwnResult({ viewer, attemptId }: { viewer: OtsViewer; attemptId: string }) {
  const locked = lockedUnless(viewer, "results.own", "Results");
  if (locked) return locked;
  const taker = await resolveTaker("staff");
  if (!taker) redirect("/evaliq");
  const view = await candidateResult(taker, attemptId).catch(() => null);
  if (!view) notFound();
  return (
    <div className="space-y-4">
      <PageHeader title={view.testName} crumbs={[{ label: "Results", href: "/evaliq/results" }, { label: `Attempt ${view.attemptNo}` }]} description={`Attempt ${view.attemptNo}`} />
      <ResultReport view={view} />
    </div>
  );
}

/** Whether the person has the everyone's-scope view of a list (otherwise the own view is shown). */
export const seesEveryones = (viewer: OtsViewer, kind: "assignments" | "results") => (kind === "assignments" ? can(viewer, "assignments.all") : can(viewer, "results.all") || can(viewer, "answers.evaluate"));
