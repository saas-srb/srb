import { redirect } from "next/navigation";
import { PageHeader } from "@/components/products/evaliq/OtsUi";
import BulkQuestions from "@/components/products/evaliq/BulkQuestions";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { listCategories } from "@/lib/products/evaliq/categories";

export default async function BulkQuestionsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "CREATE_QUESTION")) redirect("/evaliq/questions");
  const cats = await listCategories("question");
  return (
    <div className="space-y-4">
      <PageHeader title="Bulk Create Questions" crumbs={[{ label: "Question Bank", href: "/evaliq/questions" }, { label: "Bulk create" }]} description="Type or paste several objective questions at once." />
      <BulkQuestions categories={cats.map((c) => ({ value: c._id, label: c.name }))} />
    </div>
  );
}
