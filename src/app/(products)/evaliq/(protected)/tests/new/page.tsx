import { redirect } from "next/navigation";
import { PageHeader, SectionCard } from "@/components/products/evaliq/OtsUi";
import TestInfoForm from "@/components/products/evaliq/TestInfoForm";
import TestStepper from "@/components/products/evaliq/TestStepper";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { listCategories } from "@/lib/products/evaliq/categories";
import { getDirectory } from "@/lib/products/evaliq/people";
import { testInfoValues } from "@/lib/products/evaliq/test-draft";

export default async function NewTestPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "CREATE_TEST")) redirect("/evaliq/tests");
  const [cats, dir] = await Promise.all([listCategories("test"), getDirectory()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Create Test" crumbs={[{ label: "Tests", href: "/evaliq/tests" }, { label: "New" }]} description="One engine for every kind of test — employee assessments, applicant screening, student exams and certifications." />
      <TestStepper testId={null} current="info" />
      <SectionCard title="Basic information">
        <TestInfoForm id={null} initial={testInfoValues(null)} categories={cats.map((c) => ({ value: c._id, label: c.name }))} departments={dir.departments} designations={dir.designations} />
      </SectionCard>
    </div>
  );
}
