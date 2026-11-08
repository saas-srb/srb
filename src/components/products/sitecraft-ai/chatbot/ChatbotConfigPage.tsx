import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import ChatbotConfigForm from "@/components/products/dealflow-ai/ChatbotConfigForm";
import { getChatbotConfig, serializeChatbotConfig } from "@/lib/chatbot-config";
import { isOpenAIConfigured } from "@/lib/openai";

export default async function ChatbotConfigPage() {
  const config = serializeChatbotConfig(await getChatbotConfig());

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Workspace", href: "/commandos" },
          { label: "AI Chatbot", href: "/commandos/chatbot" },
          { label: "AI Config" },
        ]}
        title={<>AI Configuration</>}
        description={<>Model, generation, retrieval, rate limiting, and the welcome experience. Manage the OpenAI connection in CommandOS → Settings → Integrations.</>}
      />

      <ChatbotConfigForm config={config} openAiConfigured={(await isOpenAIConfigured())} />
    </div>
  );
}
