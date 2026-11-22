import { lockedUnless } from "@/lib/products/viralpulse-ai/gate";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import UgcProjectDetail from "@/components/products/viralpulse-ai/ugc/UgcProjectDetail";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import * as api from "@/lib/products/viralpulse-ai/ugc/api";

export const metadata = { title: "AI video" };

export default async function UgcProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  const locked = lockedUnless(viewer, "ugc.use", "UGC videos");
  if (locked) return locked;
  if (!can(viewer, "ugc.use")) redirect("/viralpulse-ai");
  const [r, ov, conn] = await Promise.all([api.getProject(id), api.overview(), api.connections()]);
  if (!r.ok) notFound();
  if (!ov.ok || !conn.ok) redirect("/viralpulse-ai/ugc");
  const p = r.project;
  return (
    <div className="space-y-4">
      <PageHeader title={p.title} crumbs={[{ label: "AI UGC Studio", href: "/viralpulse-ai/ugc" }, { label: p.title }]} description={p.brief.description.length > 160 ? `${p.brief.description.slice(0, 157)}...` : p.brief.description} />
      <UgcProjectDetail
        initial={p}
        settings={ov.overview.settings}
        connections={conn.connections}
        canGenerate={can(viewer, "ugc.use")}
        canApprove={can(viewer, "posts.publish")}
        canIntegrations={can(viewer, "ugc.settings")}
        canPost={can(viewer, "posts.manage")}
        canAds={can(viewer, "ads.create") && can(viewer, "campaigns.create")}
      />
    </div>
  );
}
