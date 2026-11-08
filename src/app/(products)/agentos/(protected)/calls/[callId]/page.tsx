import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/products/agentos/AibotsUi";
import CallDetail from "@/components/products/agentos/voice/CallDetail";
import EngineCallDetail from "@/components/products/agentos/calls/EngineCallDetail";
import { formatInZone } from "@/lib/products/agentos/calls/call-ui";
import { loadCallDetail } from "@/lib/products/agentos/calls/merged";
import { NotFoundError, can, getViewer } from "@/lib/products/agentos/viewer";
import { botsCollection, toSummary } from "@/lib/products/agentos/bots";
import { getVoiceCall } from "@/lib/products/agentos/voice/calls";
import { formatIst } from "@/lib/products/agentos/voice/call-format";

/**
 * One call. Phone and scheduled calls (the calling engine) show their purpose, target, collected answers and control history; a
 * browser call and every call made before the engine existed keep the recording-and-transcript page they always had.
 */
export default async function CallDetailPage({ params }: { params: Promise<{ callId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  const { callId } = await params;

  const engine = await loadCallDetail(viewer, callId).catch((e) => {
    if (e instanceof NotFoundError) return null;
    throw e;
  });
  if (engine) {
    // A browser call is mirrored into the engine; its recording and transcript live on the original page.
    if (engine.chatId) redirect(`/agentos/calls/${engine.chatId}`);
    const label = engine.call.target?.label || engine.caller || engine.call.phone || "Call";
    return (
      <div className="space-y-4">
        <PageHeader
          title={label}
          crumbs={[{ label: "Call History", href: "/agentos/calls" }, { label: formatInZone(engine.call.dialedAt ?? engine.call.scheduledFor ?? engine.call.createdAt, engine.timeZone) }]}
          description={engine.call.mine ? "Your call" : engine.call.direction === "inbound" ? "Incoming call" : engine.call.direction === "web_public" ? "Call from a website visitor" : `Call by ${engine.call.initiatedBy ?? "a team member"}`}
        />
        <EngineCallDetail data={engine} viewer={{ canCall: can(viewer, "VOICE_CALL"), isManager: can(viewer, "VOICE_CALL_MANAGE"), canWatchLive: can(viewer, "VOICE_CALL_TAKEOVER") }} />
      </div>
    );
  }

  const call = await getVoiceCall(viewer, callId).catch(() => null);
  if (!call) notFound();
  // Deleted agents still show their old calls, so read the row directly.
  const botRow = await (await botsCollection()).findOne({ _id: call.botId });
  const bot = botRow ? toSummary(botRow) : null;
  const mine = call.userEmail.toLowerCase() === viewer.email.toLowerCase();
  return (
    <div className="space-y-4">
      <PageHeader title={bot?.name ?? "Voice call"} crumbs={[{ label: "Call History", href: "/agentos/calls" }, { label: formatIst(call.startedAt) }]} description={mine ? "Your call" : `Call by ${call.userEmail}`} />
      <CallDetail call={call} bot={bot} mine={mine} audioUrl={`/api/agentos/calls/${call.chatId}/audio`} />
    </div>
  );
}
