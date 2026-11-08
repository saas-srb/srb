import ChatbotConfigPage from "@/components/products/sitecraft-ai/chatbot/ChatbotConfigPage";
import { requireChatbotViewAccess } from "../access";

export default async function Page() {
  await requireChatbotViewAccess();
  return <ChatbotConfigPage />;
}
