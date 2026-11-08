import { notFound, redirect } from "next/navigation";
import ChatWorkspace from "@/components/products/agentos/ChatWorkspace";
import { PageHeader } from "@/components/products/agentos/AibotsUi";
import { getViewer, can } from "@/lib/products/agentos/viewer";
import { botsCollection, generalBot, toSummary, GENERAL_BOT_ID } from "@/lib/products/agentos/bots";
import { getChat } from "@/lib/products/agentos/chats";
import { workspaceMessages } from "@/lib/products/agentos/workspace";
import { countAssignedFiles } from "@/lib/products/agentos/engine";
import { recordAuditThrottled } from "@/lib/products/agentos/audit";

/** Read-only transcript of any user's chat (VIEW_CHATS). Viewing is logged. */
export default async function OversightChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  const { chatId } = await params;
  // A link to a chat (calls placed from a chat point here): people without oversight rights land in their own workspace for it.
  const own = can(viewer, "VIEW_CHATS") ? null : await getChat(viewer, chatId).catch(() => null);
  if (own && !own.voiceCall) redirect(`/agentos/b/${encodeURIComponent(own.botId)}/${encodeURIComponent(own._id)}`);
  if (!can(viewer, "VIEW_CHATS")) redirect("/agentos");
  const chat = await getChat(viewer, chatId, { allowOversight: true }).catch(() => null);
  if (!chat) notFound();
  // A voice call has no text transcript here: its recording and transcript live on the call page.
  if (chat.voiceCall) redirect(`/agentos/calls/${chat._id}`);
  // Deleted bots still render their old chats here, so read the row directly.
  const bot = chat.botId === GENERAL_BOT_ID ? await generalBot() : await (await botsCollection()).findOne({ _id: chat.botId });
  if (!bot) notFound();
  if (chat.userId !== viewer.userId) {
    await recordAuditThrottled({ actorId: viewer.userId, actorEmail: viewer.email, action: "view", entity: "chat", entityId: chat._id, entityLabel: chat.title, botId: chat.botId, summary: `Chat of ${chat.userEmail}` }, 30 * 60 * 1000);
  }
  const [{ messages, error }, knowledgeFiles] = await Promise.all([workspaceMessages(chat), bot.vectorStoreId ? countAssignedFiles(bot._id) : Promise.resolve(0)]);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader title={chat.title} crumbs={[{ label: "All Chats", href: "/agentos/chats" }, { label: chat.title }]} />
      <div className="min-h-0 flex-1">
        <ChatWorkspace bot={toSummary(bot)} chats={[]} chatId={chat._id} chatTitle={chat.title} initialMessages={messages} ownerEmail={chat.userEmail} readOnly openAIReady historyError={error} knowledgeFiles={knowledgeFiles} />
      </div>
    </div>
  );
}
