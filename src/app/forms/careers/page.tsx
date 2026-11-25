import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FormFrame from "../FormFrame";
import CareerForm from "./CareerForm";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getOpenJobPositions } from "@/lib/career-applications";

export const metadata: Metadata = { title: "Apply for a job" };

export default async function CareersFormPage({ searchParams }: { searchParams: Promise<{ position?: string }> }) {
  if (!(await currentCompanyIdOrNull())) notFound();
  const [positions, { position }] = await Promise.all([getOpenJobPositions(), searchParams]);
  return (
    <FormFrame title="Apply for a job" description="Send us your details and resume. We will get back to you.">
      <CareerForm positions={positions.map((p) => ({ slug: p.slug, title: p.title }))} initial={positions.some((p) => p.slug === position) ? position! : ""} />
    </FormFrame>
  );
}
