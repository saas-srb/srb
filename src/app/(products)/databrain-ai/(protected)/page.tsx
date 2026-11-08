import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import ChatWorkspace from "@/components/products/databrain-ai/ChatWorkspace";
import { getCurrentIntelligenceUser } from "@/lib/intelligence-auth";
import { isOpenAIConfigured } from "@/lib/openai";

/** A new conversation. (An existing one is `/databrain-ai/c/<id>`.) */
export default async function IntelligenceHomePage() {
  const user = await getCurrentIntelligenceUser();
  if (!user) redirect("/databrain-ai/login");
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PanelPageHeader title={<>Ask your business data</>} description={<>Ask a question in plain language and get an answer built from your company's real records.</>} />
<div className="min-h-0 flex-1">
        <ChatWorkspace conversationId={null} title={null} initialMessages={[]} ownerEmail={user.email} openAIReady={(await isOpenAIConfigured())} />
      </div>
    </div>
  );
}
