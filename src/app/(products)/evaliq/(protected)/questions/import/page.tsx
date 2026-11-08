import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionCard } from "@/components/products/evaliq/OtsUi";
import ImportQuestions from "@/components/products/evaliq/ImportQuestions";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { IMPORT_HELP, IO_COLUMNS } from "@/lib/products/evaliq/questions";

export default async function ImportQuestionsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "IMPORT_QUESTIONS")) redirect("/evaliq/questions");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Import Questions"
        crumbs={[{ label: "Question Bank", href: "/evaliq/questions" }, { label: "Import" }]}
        description="Upload a CSV or Excel file. Every row is validated with the same rules as the editor; rows with errors are listed and skipped."
        actions={
          <>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download from a route handler, not a page */}
            <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/evaliq/export/question-template?format=csv" />}>
              <Download className="size-3.5" /> CSV template
            </Button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download from a route handler, not a page */}
            <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/evaliq/export/question-template?format=xlsx" />}>
              <Download className="size-3.5" /> Excel template
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <SectionCard title="Upload">
          <ImportQuestions />
        </SectionCard>
        <SectionCard title="File format" className="self-start">
          <p className="text-xs text-muted-foreground">{`Columns: ${IO_COLUMNS.map((c) => c.header).join(", ")}. Exports from the Question Bank use the same columns, so an export can be edited and re-imported.`}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {IMPORT_HELP.map((h) => <li key={h}>{h}</li>)}
            <li>Category must match an existing question category name (otherwise the question is uncategorised).</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
