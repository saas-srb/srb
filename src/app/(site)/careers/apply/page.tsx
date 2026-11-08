import CmsPageView from "@/components/products/sitecraft-ai/CmsPageView";
import { cmsPageMetadata, requirePublicPage } from "@/lib/products/sitecraft-ai/page-route";
import { getOpenJobPositions } from "@/lib/career-applications";

export const generateMetadata = () => cmsPageMetadata("/careers/apply");

export default async function CareerApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ position?: string }>;
}) {
  const { position } = await searchParams;
  const positions = await getOpenJobPositions();
  const initialPositionSlug = position && positions.some((p) => p.slug === position) ? position : undefined;
  return <CmsPageView page={await requirePublicPage("/careers/apply")} runtimeProps={{ "career-apply": { positions, initialPositionSlug } }} />;
}
