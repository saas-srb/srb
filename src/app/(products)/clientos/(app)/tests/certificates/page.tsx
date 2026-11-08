import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import PortalTestsNav from "@/components/products/evaliq/PortalTestsNav";
import CertificateList from "@/components/products/evaliq/CertificateList";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { TEST_TAKER_ROLES } from "@/lib/portal-roles";
import { resolveTaker } from "@/lib/products/evaliq/taker";
import { candidateCertificates } from "@/lib/products/evaliq/candidate";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Test Certificates · {brand} {product:portal}");

export default async function PortalTestCertificatesPage() {
  await guardPortalPage(...TEST_TAKER_ROLES);
  const taker = await resolveTaker("portal");
  const certs = taker ? await candidateCertificates(taker) : [];
  return (
    <div className="space-y-5">
      <PortalPageHeader title="Test Certificates" subtitle="Certificates from certification tests you passed — each one verifiable online." />
      <PanelListFilters>
<PortalTestsNav active="certificates" />
      <CertificateList certs={certs} />
</PanelListFilters>
    </div>
  );
}
