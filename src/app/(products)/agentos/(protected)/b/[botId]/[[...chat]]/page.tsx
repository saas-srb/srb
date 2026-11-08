import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
import ChatWorkspace from "@/components/products/agentos/ChatWorkspace";
import { getViewer, can } from "@/lib/products/agentos/viewer";
import { getChatBot, toSummary, GENERAL_BOT_ID } from "@/lib/products/agentos/bots";
import { getChat, listMyChats } from "@/lib/products/agentos/chats";
import { workspaceMessages } from "@/lib/products/agentos/workspace";
import { countAssignedFiles } from "@/lib/products/agentos/engine";
import { isOpenAIConfigured } from "@/lib/openai";
import VoiceAgentPage from "@/components/products/agentos/voice/VoiceAgentPage";

/**
 * Any bot's workspace — or the general assistant ("Start New Chat"). One page
 * serves every bot (the bot is data), for both a fresh chat (`/agentos/b/<bot>`)
 * and an existing one (`/agentos/b/<bot>/<chat>`). Only the viewer's own chats
 * open here; others' are read-only at /agentos/chats/[id].
 */
export default async function BotWorkspacePage({ params }: { params: Promise<{ botId: string; chat?: string[] }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  const { botId, chat: segments = [] } = await params;
  if (segments.length > 1) notFound();
  const bot = await getChatBot(viewer, botId);
  if (!bot) notFound();
  // Voice agents have a call surface instead of a chat workspace (their calls are listed on it).
  if (bot.kind === "voice") {
    if (segments.length > 0) notFound();
    return <VoiceAgentPage viewer={viewer} bot={bot} />;
  }

  const chat = segments[0] ? await getChat(viewer, segments[0]).catch(() => null) : null;
  if (segments[0] && (!chat || chat.botId !== bot._id)) notFound();
  const [chats, transcript, knowledgeFiles] = await Promise.all([
    listMyChats(viewer, bot._id),
    chat ? workspaceMessages(chat) : Promise.resolve({ messages: [], error: null }),
    bot.vectorStoreId ? countAssignedFiles(bot._id) : Promise.resolve(0),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PanelPageHeader title={<>{bot.name}</>} description={<>{chat?.title ?? "Start a new conversation."}</>} />
      <div className="min-h-0 flex-1">
    <ChatWorkspace
      bot={toSummary(bot)}
      chats={chats}
      chatId={chat?._id ?? null}
      chatTitle={chat?.title ?? null}
      initialMessages={transcript.messages}
      ownerEmail={viewer.email}
      manageHref={bot._id === GENERAL_BOT_ID ? (can(viewer, "MANAGE_SETTINGS") ? "/agentos/settings" : null) : can(viewer, "EDIT_BOT") ? `/agentos/bots/${bot._id}` : null}
      openAIReady={(await isOpenAIConfigured())}
      historyError={transcript.error}
      knowledgeFiles={knowledgeFiles}
    />
      </div>
    </div>
  );

}
