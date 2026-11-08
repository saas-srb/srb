import { notFound, redirect } from "next/navigation";
import LiveConsole from "@/components/products/agentos/calls/LiveConsole";
import { PageHeader } from "@/components/products/agentos/AibotsUi";
import { botsCollection, toSummary } from "@/lib/products/agentos/bots";
import { getConferenceSetup } from "@/lib/products/agentos/calls/conference-setup";
import { toView } from "@/lib/products/agentos/calls/engine";
import { getLiveView, loadWatchable } from "@/lib/products/agentos/calls/live";
import { can, getViewer } from "@/lib/products/agentos/viewer";

/**
 * The live console for one call: header, who is speaking, Listen / Take over / Hand back / End, and the running transcript. Only the person
 * who placed the call, VOICE_CALL_MANAGE and VOICE_CALL_TAKEOVER can open it (anyone else gets a 404).
 */
export const dynamic = "force-dynamic";

export default async function LiveCallPage({ params }: { params: Promise<{ callId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  const { callId } = await params;
  const call = await loadWatchable(viewer, callId).catch(() => null);
  if (!call) notFound();
  const [initial, setup, botRow] = await Promise.all([getLiveView(viewer, call._id, 0), getConferenceSetup(viewer), (await botsCollection()).findOne({ _id: call.agentId })]);
  const bot = botRow ? toSummary(botRow) : null;
  const view = toView(call, viewer);
  const canControl = view.mine || can(viewer, "VOICE_CALL_TAKEOVER");
  return (
    <div className="space-y-4">
      <PageHeader title="Live call" crumbs={[{ label: "Calls", href: "/agentos/calls" }, { label: bot?.name ?? "Call" }]} description="Listen in, take over and hand back. Everything you do here is logged." />
      <LiveConsole
        callId={call._id}
        agent={{ name: bot?.name ?? "Voice agent", icon: bot?.icon ?? "phone", color: bot?.color ?? "indigo", avatarUrl: bot?.avatarUrl ?? null }}
        purpose={call.purpose}
        targetLabel={call.target?.label ?? null}
        phone={view.phone}
        initial={initial}
        canControl={canControl}
        setupBanner={setup.banner}
      />
    </div>
  );
}
