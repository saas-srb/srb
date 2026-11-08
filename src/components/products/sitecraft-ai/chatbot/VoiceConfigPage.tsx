import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import VoiceConfigForm from "@/components/products/dealflow-ai/VoiceConfigForm";
import { getChatbotConfig } from "@/lib/chatbot-config";
import { isElevenLabsConfigured } from "@/lib/elevenlabs";
import { getCompanyBrand } from "@/lib/platform/branding";

export default async function VoiceConfigPage() {
  const brand = await getCompanyBrand();
  const config = await getChatbotConfig();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Workspace", href: "/commandos" },
          { label: "AI Chatbot", href: "/commandos/chatbot" },
          { label: "Conversation AI", href: "/commandos/chatbot/voice" },
          { label: "ElevenLabs Config" },
        ]}
        title={<>ElevenLabs Configuration</>}
        description={<>Voice, model and delivery settings for voice mode on the Ask {brand.name} page. Manage the ElevenLabs connection in CommandOS → Settings → Integrations.</>}
      />

      <VoiceConfigForm voice={config.voice} elevenLabsConfigured={(await isElevenLabsConfigured())} />
    </div>
  );
}
