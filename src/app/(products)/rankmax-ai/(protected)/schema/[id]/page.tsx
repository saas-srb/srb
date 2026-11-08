import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/products/rankmax-ai/SeoUi";
import SchemaEditor from "@/components/products/rankmax-ai/SchemaEditor";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { schemasCol } from "@/lib/products/rankmax-ai/schema";
import { allPages } from "@/lib/products/rankmax-ai/pages";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import { getCompanyBrand } from "@/lib/platform/branding";
import { formatDateTime } from "@/lib/utils";

export default async function SchemaEditPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const { id } = await params;
  const isNew = id === "new";
  if (isNew && !can(viewer, "MANAGE_SCHEMA")) redirect("/rankmax-ai/schema");
  const schema = isNew ? null : await (await schemasCol()).findOne({ _id: id });
  if (!isNew && !schema) notFound();
  const [pages, siteUrl, brand] = await Promise.all([allPages(), companySiteUrl(), getCompanyBrand()]);
  // Template defaults: the company's own details (HRMS → Company) and site — never anyone else's.
  const details = await getCompanyDetails();
  const org = {
    name: details.legalName || details.name || brand.name,
    url: siteUrl,
    logo: brand.logoUrl ?? "",
    telephone: details.phone,
    email: details.email,
    address: { streetAddress: details.addressLine1, addressLocality: details.city, addressRegion: details.state, postalCode: details.postalCode, addressCountry: details.country },
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={schema ? schema.name : "New schema"}
        crumbs={[{ label: "Schema", href: "/rankmax-ai/schema" }, { label: schema ? schema.name : "New" }]}
        description={schema ? <><Badge className="mr-1">{schema.status}</Badge>{schema.publishedAt && `Published ${formatDateTime(schema.publishedAt)} · `}Updated {formatDateTime(schema.updatedAt)}</> : "Pick a type, insert its template, fill in the blanks, then save or publish."}
      />
      <SchemaEditor
        id={schema?._id ?? null}
        status={schema?.status ?? "draft"}
        canEdit={can(viewer, "MANAGE_SCHEMA")}
        org={org}
        pathOptions={pages.filter((p) => p.crawl?.indexable).map((p) => p.path)}
        initial={{ name: schema?.name ?? "", type: schema?.type ?? "WebPage", path: schema?.path ?? "", source: schema?.source ?? "" }}
      />
    </div>
  );
}
