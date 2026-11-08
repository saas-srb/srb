import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { getAiWebsiteState, listAiWebsiteVersions } from "@/lib/platform/website/ai/apply";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";
import AiWebsitePanel from "@/components/products/sitecraft-ai/AiWebsitePanel";

// The server action below runs on this page's route, so writing a whole website (about a minute) gets the longer time limit here.
export const maxDuration = 300;

export default async function AiWebsitePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");
  if (await isPlatformOwnerContext()) redirect("/sitecraft-ai");
  const [state, versions] = await Promise.all([getAiWebsiteState(), listAiWebsiteVersions()]);
  const plainVersions = JSON.parse(JSON.stringify(versions));
  const plain = state ? JSON.parse(JSON.stringify(state)) : null;

  return (
    <div className="space-y-4">
      <CmsPageHeader
        breadcrumbs={[{ label: "AI Website" }]}
        icon={Sparkles}
        title="AI Website"
        description={<>Your whole website, written from the business categories you chose: pages, menus, footer, colours, fonts, layout and photos. Everything stays editable in the CMS.</>}
      />
      <AiWebsitePanel key={`${state?.currentVersionId ?? "none"}-${state?.plan?.sitePrompt?.slice(0, 80) ?? ""}`} state={plain} versions={plainVersions} canGenerate={can(viewer, "THEME_PUBLISH")} />
    </div>
  );
}
