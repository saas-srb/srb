import { redirect } from "next/navigation";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import StudioKit from "@/components/products/viralpulse-ai/studio/StudioKit";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { getMedia, toMediaCard } from "@/lib/products/viralpulse-ai/media";
import { getBrandKit, getImageSettings } from "@/lib/products/viralpulse-ai/images/store";
import { isGeminiImageConfigured } from "@/lib/products/viralpulse-ai/images/deps-default";

export const metadata = { title: "Brand Kit" };

/** Logo, colours, rules and limits the Image Studio applies to every picture. */
export default async function BrandKitPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  const canLibrary = can(viewer, "MANAGE_MEDIA") || can(viewer, "MANAGE_POSTS") || can(viewer, "CREATE_ADS");
  if (!canLibrary && !can(viewer, "GENERATE_AI_CONTENT")) redirect("/viralpulse-ai");
  const [gemini, settings, kit] = await Promise.all([isGeminiImageConfigured(), getImageSettings(), getBrandKit()]);
  const logo = kit.logoMediaId ? await getMedia(kit.logoMediaId) : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Brand Kit" crumbs={[{ label: "Brand Kit" }]} description="Your logo, colours and rules. The AI Image Studio applies them to every picture it makes." />
      <StudioKit kit={kit} logo={logo ? toMediaCard(logo) : null} settings={settings} canEdit={can(viewer, "MANAGE_INTEGRATIONS")} geminiConnected={gemini} />
    </div>
  );
}
