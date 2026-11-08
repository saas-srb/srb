import VoiceConversationDetailPage from "@/components/products/sitecraft-ai/chatbot/VoiceConversationDetailPage";
import { requireChatbotViewAccess } from "../../access";

export default async function Page(props: Parameters<typeof VoiceConversationDetailPage>[0]) {
  await requireChatbotViewAccess();
  return <VoiceConversationDetailPage {...props} />;
}
