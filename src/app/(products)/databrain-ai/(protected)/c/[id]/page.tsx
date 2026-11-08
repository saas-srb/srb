import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
import ChatWorkspace from "@/components/products/databrain-ai/ChatWorkspace";
import { getCurrentIntelligenceUser } from "@/lib/intelligence-auth";
import { getConversation, listMessages } from "@/lib/products/databrain-ai/conversations";
import { isOpenAIConfigured } from "@/lib/openai";

/** One of the signed-in user's own conversations, re-rendered from its stored answers (no query is re-run). */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentIntelligenceUser();
  if (!user) redirect("/databrain-ai/login");
  const { id } = await params;
  const conversation = await getConversation(user.id, id);
  if (!conversation) notFound();
  const messages = await listMessages(user.id, conversation._id);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PanelPageHeader title={<>{conversation.title}</>} description={<>A saved conversation. Answers are shown as they were produced; nothing is re-run.</>} />
      <div className="min-h-0 flex-1">
        <ChatWorkspace conversationId={conversation._id} title={conversation.title} initialMessages={messages} ownerEmail={user.email} openAIReady={(await isOpenAIConfigured())} />
      </div>
    </div>
  );
}
