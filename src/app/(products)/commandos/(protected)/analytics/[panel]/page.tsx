import { notFound, redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { isPanelKey } from "@/lib/products/commandos/panel-analytics";
import { productKeyFromSlug, productSlugFor } from "@/lib/platform/saas/product-routes";
import { PanelAnalyticsBlock } from "./PanelAnalyticsBlock";

export default async function WorkspacePanelAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ panel: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");

  const { panel: segment } = await params;
  const sp = await searchParams;
  const panel = productKeyFromSlug(segment);
  if (!panel || !isPanelKey(panel)) notFound();
  if (segment !== productSlugFor(panel)) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
      else if (value !== undefined) query.set(key, value);
    }
    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : "";
    redirect(`/commandos/analytics/${productSlugFor(panel)}${suffix}`);
  }

  return (
    <div className="relative space-y-6">
      <PanelAnalyticsBlock panel={panel} user={user} sp={sp} />
    </div>
  );
}
