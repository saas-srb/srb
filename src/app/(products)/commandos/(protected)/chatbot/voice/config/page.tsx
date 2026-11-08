import VoiceConfigPage from "@/components/products/sitecraft-ai/chatbot/VoiceConfigPage";
import { requireChatbotViewAccess } from "../../access";

export default async function Page() {
  await requireChatbotViewAccess();
  return <VoiceConfigPage />;
}
