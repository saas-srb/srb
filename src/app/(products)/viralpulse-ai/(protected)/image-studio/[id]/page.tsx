import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import ImageProjectDetail from "@/components/products/viralpulse-ai/studio/ImageProjectDetail";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { createEngine } from "@/lib/products/viralpulse-ai/images/engine";
import { defaultImageDeps } from "@/lib/products/viralpulse-ai/images/deps-default";
import { toProjectView } from "@/lib/products/viralpulse-ai/images/view";
import { NotFoundError } from "@/lib/products/viralpulse-ai/viewer";
import { canGenerateImages, loadStudioConfig } from "../../studio-context";

export const maxDuration = 300;
export const metadata = { title: "Image project" };

export default async function ImageProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "MANAGE_MEDIA")) redirect("/viralpulse-ai/image-studio");
  const { id } = await params;
  let project;
  try {
    project = toProjectView(await createEngine(defaultImageDeps()).reconcile(id));
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const config = await loadStudioConfig(viewer);
  const canGenerate = canGenerateImages(viewer);
  return (
    <div className="space-y-4">
      <PageHeader
        title={project.brief.name || "Image project"}
        crumbs={[{ label: "AI Image Studio", href: "/viralpulse-ai/image-studio" }, { label: "Projects", href: "/viralpulse-ai/image-studio?tab=projects" }, { label: project.brief.name || "Project" }]}
        description="Watch the pictures arrive, compare them, change one, then save the sizes you need to the Media Library."
        actions={canGenerate && project.status !== "generating" ? <Button variant="outline" nativeButton={false} render={<Link href={`/viralpulse-ai/image-studio?tab=create&project=${project.id}`} />}><Pencil className="size-4" /> Edit brief</Button> : undefined}
      />
      <ImageProjectDetail key={project.id} initial={project} config={config} canGenerate={canGenerate} />
    </div>
  );
}
