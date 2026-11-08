import { notFound, redirect } from "next/navigation";
import { PageHeader, Notice } from "@/components/products/evaliq/OtsUi";
import QuestionEditor from "@/components/products/evaliq/QuestionEditor";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { listCategories } from "@/lib/products/evaliq/categories";
import { getQuestion, questionFacets, questionUsage } from "@/lib/products/evaliq/questions";
import { questionToDraft } from "@/lib/products/evaliq/question-draft";

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "EDIT_QUESTION")) redirect("/evaliq/questions");
  const { id } = await params;
  const q = await getQuestion(id);
  if (!q) notFound();
  const [cats, facets, usage] = await Promise.all([listCategories("question"), questionFacets(), questionUsage([id])]);
  const u = usage.get(id);
  return (
    <div className="space-y-4">
      <PageHeader title={`Edit ${q.code}`} crumbs={[{ label: "Question Bank", href: "/evaliq/questions" }, { label: q.code, href: `/evaliq/questions/${id}` }, { label: "Edit" }]} />
      {u && (u.tests.length > 0 || u.attempts > 0) && (
        <Notice tone="warn">{`Used in ${u.tests.length} test${u.tests.length === 1 ? "" : "s"} and answered ${u.attempts} time${u.attempts === 1 ? "" : "s"}. Changes apply to future attempts only — results already taken keep the version that was shown.`}</Notice>
      )}
      <QuestionEditor id={id} initial={questionToDraft(q)} categories={cats.map((c) => ({ value: c._id, label: c.name }))} subjects={facets.subjects} canUpload />
    </div>
  );
}
