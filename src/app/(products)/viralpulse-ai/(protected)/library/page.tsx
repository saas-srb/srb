import { redirect } from "next/navigation";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import { Notice } from "@/components/products/viralpulse-ai/SmmsUi";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import MediaLibraryTab from "./MediaLibraryTab";

export const metadata = { title: "Media Library" };

/** Every reusable image and video: upload, search, folders, tags, bulk actions, "used in", and Use in post / ad. */
export default async function MediaLibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!(can(viewer, "MANAGE_MEDIA") || can(viewer, "MANAGE_POSTS") || can(viewer, "CREATE_ADS"))) redirect("/viralpulse-ai");
  const sp = await searchParams;
  return (
    <div className="space-y-4">
      <PageHeader title="Media Library" crumbs={[{ label: "Media Library" }]} description="Every image and video you can reuse in posts and ads. Files are private and served only to signed-in staff." />
      {!can(viewer, "MANAGE_MEDIA") && <Notice tone="info">You can browse and attach media. Uploading and deleting need permission to manage media.</Notice>}
      <MediaLibraryTab viewer={viewer} sp={sp} />
    </div>
  );
}
