import { redirect } from "next/navigation";
import { PageHeader } from "@/components/products/viralpulse-ai/SmmsUi";
import PostWizard from "@/components/products/viralpulse-ai/post-wizard/PostWizard";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { loadWizardInit, parseHandoff } from "@/lib/products/viralpulse-ai/post-wizard/server";

export const maxDuration = 300;

export default async function NewPostPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "MANAGE_POSTS")) redirect("/viralpulse-ai/posts");
  const sp = await searchParams;
  const campaign = typeof sp.campaign === "string" ? sp.campaign : undefined;
  const init = await loadWizardInit(null, parseHandoff(sp), viewer, { campaignId: campaign });
  if (!init) redirect("/viralpulse-ai/posts");
  return (
    <div className="space-y-4">
      <PageHeader title="New post" crumbs={[{ label: "Social Media Reels/Posts", href: "/viralpulse-ai/posts" }, { label: "New" }]} description="Step by step: goal and platforms, brief, content, media, options, schedule and review." />
      <PostWizard init={init} />
    </div>
  );
}
