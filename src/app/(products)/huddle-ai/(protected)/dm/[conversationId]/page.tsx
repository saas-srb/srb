import { notFound } from "next/navigation";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { getConversation, isParticipant } from "@/lib/products/huddle-ai/conversations";
import { listMessages } from "@/lib/products/huddle-ai/messages";
import { getChatUsers, getChatUser } from "@/lib/products/huddle-ai/users";
import { getPresenceDetail } from "@/lib/products/huddle-ai/presence";
import { scopeKey } from "@/lib/products/huddle-ai/events";
import ChatView from "@/components/products/huddle-ai/ChatView";
import DmHeader from "@/components/products/huddle-ai/DmHeader";
import JoinMeetingBanner from "@/components/products/huddle-ai/call/JoinMeetingBanner";
import type { ClientMessage } from "@/components/products/huddle-ai/types";

export const dynamic = "force-dynamic";

export default async function DirectMessagePage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const user = await getCurrentChatUser();
  if (!user) return null;

  const conversation = await getConversation(conversationId);
  if (!conversation || !isParticipant(conversation, user.id)) notFound();

  const otherId = conversation.participantIds.find((p) => p !== user.id) ?? user.id;
  const [usersMap, me, messages, presence] = await Promise.all([
    getChatUsers([otherId]),
    getChatUser(user.id),
    listMessages({ scope: { type: "dm", id: conversation._id }, viewerId: user.id, limit: 40 }),
    getPresenceDetail([otherId]),
  ]);

  const other = usersMap[otherId] ?? null;
  const scope = { type: "dm" as const, id: conversation._id };
  const members = [
    { _id: user.id, displayName: me?.displayName ?? user.displayName },
    ...(other ? [{ _id: other._id, displayName: other.displayName }] : []),
  ];

  return (
    <>
      <DmHeader
        name={other?.displayName ?? "Unknown"}
        subtitle={other?.title ?? other?.email ?? null}
        presence={other ? presence[other._id]?.status ?? "offline" : "offline"}
        lastActiveAt={other ? presence[other._id]?.lastActiveAt ?? null : null}
        conversationId={conversation._id}
        peerUserId={otherId}
      />
      <JoinMeetingBanner scope={scope} />
      <ChatView
        scope={scope}
        scopeKey={scopeKey(scope)}
        currentUserId={user.id}
        canPost
        members={members}
        initialMessages={messages as unknown as ClientMessage[]}
        otherReadSeq={conversation.readSeqByUser[otherId] ?? 0}
        emptyState={`This is the start of your conversation with ${other?.displayName ?? "this person"}.`}
      />
    </>
  );
}
