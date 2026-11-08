import CmsPageView from "@/components/products/sitecraft-ai/CmsPageView";
import { getLeadCategories } from "@/lib/lead-categories";
import { cmsPageMetadata, requirePublicPage } from "@/lib/products/sitecraft-ai/page-route";

/** The homepage — content, SEO and structured data from the CMS page "/". */
export const generateMetadata = () => cmsPageMetadata("/");

export default async function HomePage() {
  // A company's own enquiry categories reach the home page's quick-enquiry form (absent = the operator's built-in services).
  const set = await getLeadCategories();
  return <CmsPageView page={await requirePublicPage("/")} runtimeProps={{ "home-final-cta": { leadCategories: set.custom ? set.categories : undefined } }} />;
}
