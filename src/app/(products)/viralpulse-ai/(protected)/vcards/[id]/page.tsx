import { lockedUnless } from "@/lib/products/viralpulse-ai/gate";
import { redirect, notFound } from "next/navigation";
import { getViewer } from "@/lib/products/viralpulse-ai/viewer";
import { getVCardDetailApi } from "@/lib/products/viralpulse-ai/vcard/api";
import VCardStudio from "@/components/products/viralpulse-ai/vcard/VCardStudio";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VCardEditorPage({ params }: PageProps) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  const locked = lockedUnless(viewer, "vcards.use", "Digital cards");
  if (locked) return locked;

  let card;
  try {
    card = await getVCardDetailApi(id);
  } catch {
    notFound();
  }

  return <VCardStudio initialCard={card} />;
}
