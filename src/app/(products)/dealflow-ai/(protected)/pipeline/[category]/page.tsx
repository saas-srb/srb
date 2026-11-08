import { requireLmsPage } from "@/lib/lms-auth";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { loadPipelineContactsFromDb } from "@/lib/dealflow-ai/db-contacts";
import type { PipelineTab } from "@/lib/dealflow-ai/types";
import PipelineCategoryClient from "./PipelineCategoryClient";

export const dynamic = "force-dynamic";

const VALID_PIPELINES: Record<string, { label: string; desc: string; icon: string }> = {
  jobs: {
    label: "Job Applications",
    desc: "Candidates who applied for jobs through the website careers portal — resume screening, interview stages, and hiring decisions.",
    icon: "💼",
  },
  interns: {
    label: "Internship",
    desc: "Students and fresh graduates who applied for software & AI internship programs — assessments, college records, and stipend tracking.",
    icon: "🎓",
  },
  trainees: {
    label: "Industrial Training",
    desc: "College students enrolling in 6-Week & 6-Month industrial training programs for live project experience and college credit.",
    icon: "🛠️",
  },
  clients: {
    label: "Clients",
    desc: "Business leads captured across Facebook, Instagram, Meta Ads, Upwork, Google, LinkedIn, and Website inquiries with full campaign attribution.",
    icon: "🏢",
  },
};

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  await requireLmsPage("VIEW_LEADS");
  const { category } = await params;

  if (!VALID_PIPELINES[category]) {
    notFound();
  }

  const meta = VALID_PIPELINES[category];
  const contacts = await loadPipelineContactsFromDb(category as PipelineTab);

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-4">
      <PanelPageHeader
        title={<>{meta.icon} {meta.label}</>}
        description={<>{meta.desc}</>}
      />
      <PipelineCategoryClient
        category={category as PipelineTab}
        meta={meta}
        initialContacts={contacts}
      />
    </div>
  );
}
