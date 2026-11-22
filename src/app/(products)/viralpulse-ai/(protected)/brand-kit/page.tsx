import { lockedUnless } from "@/lib/products/viralpulse-ai/gate";
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
  const locked = lockedUnless(viewer, "brand.view", "Brand kit");
  if (locked) return locked;
  const canLibrary = can(viewer, "media.manage") || can(viewer, "posts.manage") || can(viewer, "ads.create");
  if (!canLibrary && !can(viewer, "posts.generate")) redirect("/viralpulse-ai");
  const [gemini, settings, kit] = await Promise.all([isGeminiImageConfigured(), getImageSettings(), getBrandKit()]);
  const logo = kit.logoMediaId ? await getMedia(kit.logoMediaId) : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Brand Kit" crumbs={[{ label: "Brand Kit" }]} description="Your logo, colours and rules. The AI Image Studio applies them to every picture it makes." />
      <StudioKit kit={kit} logo={logo ? toMediaCard(logo) : null} settings={settings} canEdit={can(viewer, "integrations.manage")} geminiConnected={gemini} />
    </div>
  );
}
