import { lockedUnless } from "@/lib/products/viralpulse-ai/gate";
import { notFound, redirect } from "next/navigation";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { getBrochureProject } from "@/lib/products/viralpulse-ai/brochure/api";
import BrochureStudio from "@/components/products/viralpulse-ai/brochure/BrochureStudio";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Brochure Studio · ${id}` };
}

export default async function BrochureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  const locked = lockedUnless(viewer, "brochures.use", "Brochures");
  if (locked) return locked;
  if (!can(viewer, "posts.manage") && !can(viewer, "media.manage") && !can(viewer, "brochures.use")) {
    redirect("/viralpulse-ai");
  }

  const { id } = await params;
  const res = await getBrochureProject(id);
  if (!res.ok || !res.brochure) {
    notFound();
  }

  return <BrochureStudio initialBrochure={res.brochure} />;
}
