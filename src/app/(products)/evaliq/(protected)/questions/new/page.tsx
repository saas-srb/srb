import { redirect } from "next/navigation";
import { PageHeader } from "@/components/products/evaliq/OtsUi";
import QuestionEditor from "@/components/products/evaliq/QuestionEditor";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { listCategories } from "@/lib/products/evaliq/categories";
import { questionFacets } from "@/lib/products/evaliq/questions";
import { EMPTY_DRAFT } from "@/lib/products/evaliq/question-draft";

export default async function NewQuestionPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "CREATE_QUESTION")) redirect("/evaliq/questions");
  const [cats, facets] = await Promise.all([listCategories("question"), questionFacets()]);
  return (
    <div className="space-y-4">
      <PageHeader title="New Question" crumbs={[{ label: "Question Bank", href: "/evaliq/questions" }, { label: "New" }]} description="Written once, reusable in any number of tests." />
      <QuestionEditor id={null} initial={EMPTY_DRAFT} categories={cats.map((c) => ({ value: c._id, label: c.name }))} subjects={facets.subjects} canUpload />
    </div>
  );
}
