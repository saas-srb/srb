import type { Metadata } from "next";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { siteUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { hiddenProducts } from "@/lib/platform/products/visible";
import { hrefAvailable } from "@/lib/platform/products/routes";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { listOpenings } from "@/lib/products/talentos/openings";
import { SITES_MODULE } from "@/lib/platform/products/selection";
import { CopyRow, Openings, WebsiteChoice } from "./WebsiteControls";

export const metadata: Metadata = { title: "Website & public forms", robots: { index: false, follow: false } };

export default async function WebsiteSettingsPage() {
  await requireWorkspaceAccess("company.website");
  const companyId = await currentCompanyId();
  const [company, hidden, entitlements, base] = await Promise.all([getCompany(companyId), hiddenProducts(), getEntitlements(), siteUrlForCompany(companyId)]);
  const canHost = !hidden.has("cms");
  const hosted = entitlements.sites;
  // SiteCraft bought on its own is the website itself: there is nothing to choose.
  const forced = company?.products?.mode === "selected" && company.products.keys.includes(SITES_MODULE);
  const mode = hosted ? "platform" : company?.website?.mode === "external" ? "external" : "none";
  const forms = [
    { path: "/forms/enquiry", label: "Enquiry form" },
    { path: "/forms/careers", label: "Careers form" },
  ].filter((f) => hrefAvailable(f.path, hidden));
  const openings = !hosted && hrefAvailable("/forms/careers", hidden) ? await listOpenings() : null;
  const own = company?.website?.externalUrl ?? "";

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Website & public forms" }]}
        title={<>Website &amp; public forms</>}
        description={<>Whether your website runs here, and the public forms your customers and candidates use.</>}
      />
      {!company?.isPlatformOwner && !forced && (
        <Card>
          <CardHeader>
            <CardTitle>Your website</CardTitle>
            <CardDescription>{canHost ? "Payment links, certificate checks and signing links work whatever you choose. With a website here, your team signs in at a separate app address; without one, everything is on one address. Changing this moves the sign-in page, and everyone signs in again there." : "A website run here comes with SiteCraft AI & Sites. You can link your own website."}</CardDescription>
          </CardHeader>
          <CardContent>
            <WebsiteChoice mode={mode} externalUrl={own} canHost={canHost} />
          </CardContent>
        </Card>
      )}
      {forms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Forms to share or embed</CardTitle>
            <CardDescription>Share a link, or paste the code into a page of your own website. Embedding works on the website address saved above.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {forms.map((f) => (
              <div key={f.path} className="space-y-2">
                <CopyRow label={`${f.label}: link`} value={`${base}${f.path}`} />
                {own && <CopyRow label={`${f.label}: embed code`} value={`<iframe src="${base}${f.path}" title="${f.label}" style="width:100%;height:760px;border:0"></iframe>`} />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {openings && (
        <Card>
          <CardHeader>
            <CardTitle>Job openings</CardTitle>
            <CardDescription>The roles the careers form offers.</CardDescription>
          </CardHeader>
          <CardContent>
            <Openings rows={openings} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
