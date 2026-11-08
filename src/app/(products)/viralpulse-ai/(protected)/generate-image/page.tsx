import { redirect } from "next/navigation";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import ImageWizard from "@/components/products/viralpulse-ai/studio/ImageWizard";
import ConnectionGate from "@/components/products/viralpulse-ai/shared/ConnectionGate";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { getProject } from "@/lib/products/viralpulse-ai/images/store";
import { toProjectView } from "@/lib/products/viralpulse-ai/images/view";
import { canGenerateImages, loadStudioConfig } from "../studio-context";

export const maxDuration = 300;
export const metadata = { title: "Generate Image" };

/** Quick generate: the Image Studio wizard in three steps. Drafts are saved as projects, so a refresh or a later visit picks up where it stopped. */
export default async function GenerateImagePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!canGenerateImages(viewer)) redirect("/viralpulse-ai");
  const sp = await searchParams;
  const config = await loadStudioConfig(viewer);
  const doc = sp.project ? await getProject(sp.project) : null;
  if (doc?.status === "generating" || doc?.status === "finished") redirect(`/viralpulse-ai/image-studio/${doc._id}`);
  return (
    <div className="space-y-4">
      <PageHeader title="Generate Image" crumbs={[{ label: "Generate Image" }]} description="Describe a picture, choose how many options, check the cost and generate. Three short steps; your work is saved as a draft as you go." />
      <ConnectionGate requires={[{ name: "OpenAI or Gemini", connected: config.providers.openai || config.providers.gemini, why: "to generate images" }]} canManage={can(viewer, "MANAGE_INTEGRATIONS")}>
        <ImageWizard key={doc?._id ?? "new"} mode="quick" config={config} initialProject={doc ? toProjectView(doc) : null} canGenerate />
      </ConnectionGate>
    </div>
  );
}
