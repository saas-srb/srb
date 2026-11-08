import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import PostWizard from "@/components/products/viralpulse-ai/post-wizard/PostWizard";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { loadWizardInit, parseHandoff } from "@/lib/products/viralpulse-ai/post-wizard/server";

export const maxDuration = 300;

export default async function EditPostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  const { id } = await params;
  if (!can(viewer, "MANAGE_POSTS")) redirect(`/viralpulse-ai/posts/${id}`);
  const init = await loadWizardInit(id, parseHandoff(await searchParams), viewer);
  if (!init) notFound();
  return (
    <div className="space-y-4">
      <PageHeader title="Edit post" crumbs={[{ label: "Social Media Reels/Posts", href: "/viralpulse-ai/posts" }, { label: init.state.title || "Post", href: `/viralpulse-ai/posts/${id}` }, { label: "Edit" }]} description="Your changes are saved as you go. Every checkpoint is kept in the post's version history." />
      <PostWizard key={id} init={init} />
    </div>
  );
}
