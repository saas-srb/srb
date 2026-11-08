import CmsPageView from "@/components/products/sitecraft-ai/CmsPageView";
import { cmsPageMetadata, requirePublicPage } from "@/lib/products/sitecraft-ai/page-route";
import { getSubServices, isValidCategory, type CategorySlug } from "@/lib/categories";
import { getContactFormFields } from "@/lib/products/sitecraft-ai/forms";
import { getLeadCategories } from "@/lib/lead-categories";

export const generateMetadata = () => cmsPageMetadata("/contact");

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; subService?: string }>;
}) {
  const { category, subService } = await searchParams;
  const set = await getLeadCategories();
  // The operator's built-in services keep their own validation; any other company uses its own categories.
  const known = set.custom ? set.categories.find((c) => c.slug === category) : undefined;
  const initialCategory: string | undefined = set.custom ? known?.slug : category && isValidCategory(category) ? category : undefined;
  const subs = set.custom ? (known?.subServices ?? []) : initialCategory ? getSubServices(initialCategory as CategorySlug) : [];
  const initialSubService: string | undefined = initialCategory && subService && subs.some((s) => s.slug === subService) ? subService : undefined;
  const leadCategories = set.custom ? set.categories : undefined;
  const formFields = await getContactFormFields();
  return <CmsPageView page={await requirePublicPage("/contact")} runtimeProps={{ "contact-form": { initialCategory, initialSubService, formFields, leadCategories } }} />;
}
