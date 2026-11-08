import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { redirect } from "next/navigation";
import { PageHeader, Notice } from "@/components/products/viralpulse-ai/SmmsUi";
import AiWorkspace from "@/components/products/viralpulse-ai/AiWorkspace";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { listWorkspaceRuns } from "@/lib/products/viralpulse-ai/generations";
import { listLiveOffers, listClientChoices } from "@/lib/products/viralpulse-ai/brand";
import { normalizeWorkspace } from "@/lib/products/viralpulse-ai/content";
import { isOpenAIConfigured } from "@/lib/openai";

export const maxDuration = 300;

export default async function AiGeneratorPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "GENERATE_AI_CONTENT")) redirect("/viralpulse-ai");
  const [runs, offers, clients] = await Promise.all([listWorkspaceRuns(viewer.userId, 20), listLiveOffers(30), listClientChoices()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Copy generator" crumbs={[{ label: "Social Media Reels/Posts", href: "/viralpulse-ai/posts" }, { label: "Copy generator" }]} description="Campaign ideas, ad copy, posts, captions, scripts, headlines, CTAs, hashtags and creative concepts — written by OpenAI from your brand context." />
      <PanelListFilters>
{!(await isOpenAIConfigured()) && <Notice tone="warn">OpenAI isn&apos;t connected for this workspace (Settings → Integrations), so generation will fail.</Notice>}
      <AiWorkspace
        canCreatePost={can(viewer, "MANAGE_POSTS")}
        offers={offers.map((o) => ({ _id: o._id, title: o.title, badge: o.badge }))}
        clients={clients}
        history={runs.map((r) => {
          const snap = (r.snapshot ?? {}) as { output?: unknown };
          return { id: r.targetId, kind: r.kind, label: r.label, platform: r.platform, createdAt: r.createdAt.toISOString(), output: normalizeWorkspace(snap.output) };
        })}
      />
</PanelListFilters>
    </div>
  );
}
