import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import CandidateTests from "@/components/products/evaliq/CandidateTests";
import PortalTestsNav from "@/components/products/evaliq/PortalTestsNav";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { TEST_TAKER_ROLES } from "@/lib/portal-roles";
import { resolveTaker, basePath } from "@/lib/products/evaliq/taker";
import { candidateCards } from "@/lib/products/evaliq/candidate";
import { maybeSweep } from "@/lib/products/evaliq/sweep";
import { afterForCompany } from "@/lib/platform/tenancy/context";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Tests · {brand} {product:portal}");

export default async function PortalTestsPage() {
  const user = await guardPortalPage(...TEST_TAKER_ROLES);
  await afterForCompany(() => maybeSweep());
  const taker = await resolveTaker("portal");
  const cards = taker ? await candidateCards(taker) : [];
  return (
    <div className="space-y-5">
      <PortalPageHeader title={user.role === "job_applicant" ? "Assessments" : "Tests & Exams"} subtitle={user.role === "job_applicant" ? "Screening and technical tests for your application." : "Course, chapter, practice, mock and final exams."} />
      <PanelListFilters>
<PortalTestsNav active="tests" />
      <CandidateTests cards={cards} channel="portal" paths={basePath("portal")} emptyHint={user.role === "job_applicant" ? "If the hiring team asks you to take a test, it will appear here." : "Tests from your program will appear here."} />
</PanelListFilters>
    </div>
  );
}
