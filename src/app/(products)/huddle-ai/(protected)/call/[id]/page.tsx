import { notFound, redirect } from "next/navigation";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { getCall, isParticipant, serializeCall, getIceServers } from "@/lib/products/huddle-ai/calls";
import CallStage from "@/components/products/huddle-ai/call/CallStage";
import type { MessageScope } from "@/components/products/huddle-ai/types";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentChatUser();
  if (!user) return null;

  const call = await getCall(id);
  if (!call) notFound();
  if (!(await isParticipant(id, user.id))) notFound();
  if (call.status === "ended") {
    redirect(call.scope.type === "dm" ? `/huddle-ai/dm/${call.scope.id}` : "/huddle-ai/channels");
  }

  const serialized = await serializeCall(call, user.id);
  const conversationScope: MessageScope = { type: call.scope.type, id: call.scope.id };

  return (
    <div className="h-full overflow-hidden rounded-2xl border border-border/40">
      <CallStage
        call={serialized}
        iceServers={(await getIceServers()) as RTCIceServer[]}
        currentUserId={user.id}
        currentUserName={user.displayName}
        conversationScope={conversationScope}
      />
    </div>
  );
}
