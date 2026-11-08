import { redirect } from "next/navigation";
import { PageHeader } from "@/components/products/agentos/AibotsUi";
import AgentHubGallery from "@/components/products/agentos/AgentHubGallery";
import CreateAgentMenu from "@/components/products/agentos/CreateAgentMenu";
import { getViewer, can } from "@/lib/products/agentos/viewer";
import { listHubAgents } from "@/lib/products/agentos/hub";

/** Agent Hub: every text and voice agent this viewer may open, in one gallery. */
export default async function AgentHubPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  const agents = await listHubAgents(viewer);
  const canCreate = can(viewer, "CREATE_BOT");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Agent Hub"
        crumbs={[{ label: "Agent Hub" }]}
        description="Every agent you can use, text or voice, in one place."
        actions={canCreate ? <CreateAgentMenu /> : undefined}
      />
      <AgentHubGallery agents={agents} canCreate={canCreate} />
    </div>
  );
}
