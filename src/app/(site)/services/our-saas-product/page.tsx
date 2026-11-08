import CmsPageView from "@/components/products/sitecraft-ai/CmsPageView";
import { CollectionsProvider } from "@/components/products/sitecraft-ai/CollectionsContext";
import { cmsPageMetadata, requirePublicPage } from "@/lib/products/sitecraft-ai/page-route";
import { getRecords } from "@/lib/products/sitecraft-ai/collections/store";

const path = "/services/our-saas-product";

export const generateMetadata = () => cmsPageMetadata(path);

/** The product catalogue page: provides the products collection (only this page needs it) around the CMS sections. */
export default async function OurSaasProductPage() {
  const [page, productRecords] = await Promise.all([requirePublicPage(path), getRecords("products")]);
  return <CmsPageView page={page} wrapSections={(node) => <CollectionsProvider snapshot={{ products: productRecords }}>{node}</CollectionsProvider>} />;
}
