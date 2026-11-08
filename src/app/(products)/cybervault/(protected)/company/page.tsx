import { redirect } from "next/navigation";
import OwnerVault, { type OwnerInfo } from "@/components/products/cybervault/OwnerVault";
import { EmptyState } from "@/components/products/cybervault/DlmsUi";
import { getViewer, canReadScope } from "@/lib/products/cybervault/viewer";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import type { SearchParams } from "@/lib/products/cybervault/page";

export default async function CompanyVaultPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/cybervault/login");
  if (!canReadScope(viewer, "company", null)) {
    return <EmptyState title="No access to the company vault">Ask a CyberVault manager to grant you access to the Company Vault.</EmptyState>;
  }
  const sp = await searchParams;
  // Company identity is read from the HRMS company record (edited in HRMS → Settings); DLMS never keeps its own copy.
  const c = await getCompanyDetails();
  const info: OwnerInfo = {
    title: "Company Vault",
    subtitle: `${c.legalName || c.name} — company-level credentials, documents, URLs and notes.`,
    badge: "Company",
    crumbs: [{ label: "Company Vault" }],
    notice: "Company details come from the TalentOS company record.",
    lines: [
      ...(c.website ? [{ icon: "web" as const, text: c.website, href: /^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}` }] : []),
      ...(c.email ? [{ icon: "mail" as const, text: c.email }] : []),
      ...(c.phone ? [{ icon: "phone" as const, text: c.phone }] : []),
    ],
    details: [
      { label: "Legal name", value: c.legalName || c.name },
      ...(c.gstin ? [{ label: "GSTIN", value: c.gstin }] : []),
      ...(c.pan ? [{ label: "PAN", value: c.pan }] : []),
      ...(c.cin ? [{ label: "CIN", value: c.cin }] : []),
      ...(c.city ? [{ label: "Location", value: [c.city, c.state].filter(Boolean).join(", ") }] : []),
    ],
  };
  return <OwnerVault viewer={viewer} owner={{ scope: "company", clientId: null }} basePath="/cybervault/company" info={info} sp={sp} />;
}
