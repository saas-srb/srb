import { notFound, redirect } from "next/navigation";
import { PageHeader, SectionCard, Notice } from "@/components/products/evaliq/OtsUi";
import TestInfoForm from "@/components/products/evaliq/TestInfoForm";
import TestConfigForm from "@/components/products/evaliq/TestConfigForm";
import SectionsEditor from "@/components/products/evaliq/SectionsEditor";
import TestStepper from "@/components/products/evaliq/TestStepper";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { getTest, effectiveTestStatus } from "@/lib/products/evaliq/tests";
import { listCategories } from "@/lib/products/evaliq/categories";
import { getDirectory } from "@/lib/products/evaliq/people";
import { getQuestionsByIds, questionFacets } from "@/lib/products/evaliq/questions";
import { testConfigValues, testInfoValues, sectionDrafts } from "@/lib/products/evaliq/test-draft";
import { QUESTION_TYPES } from "@/lib/products/evaliq/question-types";

export default async function TestBuilderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "EDIT_TEST")) redirect("/evaliq/tests");
  const { id } = await params;
  const { step: rawStep } = await searchParams;
  const step = rawStep === "config" || rawStep === "sections" ? rawStep : "info";
  const t = await getTest(id);
  if (!t) notFound();
  if (t.status === "archived") redirect(`/evaliq/tests/${id}`);
  const status = effectiveTestStatus(t);

  let body: React.ReactNode;
  if (step === "info") {
    const [cats, dir] = await Promise.all([listCategories("test"), getDirectory()]);
    body = (
      <SectionCard title="Basic information">
        <TestInfoForm id={id} initial={testInfoValues(t)} categories={cats.map((c) => ({ value: c._id, label: c.name }))} departments={dir.departments} designations={dir.designations} next={`/evaliq/tests/${id}/edit?step=config`} />
      </SectionCard>
    );
  } else if (step === "config") {
    body = (
      <SectionCard title="Configuration" description="Every setting applies to this test only; assignments can override dates, attempts and result visibility.">
        <TestConfigForm id={id} initial={testConfigValues(t)} next={`/evaliq/tests/${id}/edit?step=sections`} />
      </SectionCard>
    );
  } else {
    const [cats, facets, known] = await Promise.all([listCategories("question"), questionFacets(), getQuestionsByIds(t.sections.flatMap((s) => s.questionIds))]);
    body = (
      <SectionsEditor
        testId={id}
        initial={sectionDrafts(t)}
        known={known.map((q) => ({ id: q._id, code: q.code, prompt: q.prompt.slice(0, 200), type: q.type, typeLabel: QUESTION_TYPES[q.type].label, difficulty: q.difficulty, marks: q.marks, subject: q.subject, status: q.status }))}
        categories={cats.map((c) => ({ value: c._id, label: c.name }))}
        subjects={facets.subjects}
        next={`/evaliq/tests/${id}/preview`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t.name} crumbs={[{ label: "Tests", href: "/evaliq/tests" }, { label: t.code, href: `/evaliq/tests/${id}` }, { label: "Builder" }]} description={`${t.code} · test builder`} />
      <TestStepper testId={id} current={step} published={status !== "draft"} />
      {status !== "draft" && <Notice tone="warn">This test is live. Changes apply to attempts started from now on — attempts already started keep the paper and rules they began with.</Notice>}
      {body}
    </div>
  );
}
