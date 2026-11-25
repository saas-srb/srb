import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FormFrame from "../FormFrame";
import EnquiryForm from "./EnquiryForm";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getLeadCategories } from "@/lib/lead-categories";

export const metadata: Metadata = { title: "Send an enquiry" };

export default async function EnquiryFormPage() {
  if (!(await currentCompanyIdOrNull())) notFound();
  const { categories } = await getLeadCategories();
  return (
    <FormFrame title="Send an enquiry" description="Tell us what you need. We will get back to you.">
      <EnquiryForm categories={categories} />
    </FormFrame>
  );
}
