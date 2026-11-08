import { notFound, redirect } from "next/navigation";
import { PageHeader, SectionCard } from "@/components/products/evaliq/OtsUi";
import CategoriesManager from "@/components/products/evaliq/CategoriesManager";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { listCategoriesWithUsage } from "@/lib/products/evaliq/categories";

export default async function CategoriesPage({ params }: { params: Promise<{ kind: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "MANAGE_SETTINGS")) redirect("/evaliq");
  const { kind: raw } = await params;
  if (raw !== "questions" && raw !== "tests") notFound();
  const kind = raw === "tests" ? "test" : "question";
  const rows = await listCategoriesWithUsage(kind);
  const title = kind === "test" ? "Test Categories" : "Question Categories";
  return (
    <div className="space-y-4">
      <PageHeader title={title} crumbs={[{ label: title }]} description={kind === "test" ? "Group tests (e.g. Technical, HR, Compliance, Course Exams) for filters, reports and candidates' test cards." : "Group questions (e.g. JavaScript, Aptitude, Communication) for search and automatic selection rules."} />
      <SectionCard title={title}>
        <CategoriesManager kind={kind} rows={rows.map((r) => ({ id: r._id, name: r.name, description: r.description, usage: r.usage }))} />
      </SectionCard>
    </div>
  );
}
