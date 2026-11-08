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
  if (!can(viewer, "GENERATE_AI_CONTENT")) redirect("/viralpulse-ai");
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
        canGenerate={can(viewer, "GENERATE_AI_CONTENT")}
        canApprove={can(viewer, "PUBLISH_CONTENT")}
        canIntegrations={can(viewer, "MANAGE_INTEGRATIONS")}
        canPost={can(viewer, "MANAGE_POSTS")}
        canAds={can(viewer, "CREATE_ADS") && can(viewer, "CREATE_CAMPAIGNS")}
      />
    </div>
  );
}
