import ChatbotDashboardPage from "@/components/products/sitecraft-ai/chatbot/ChatbotDashboardPage";
import { requireChatbotViewAccess } from "./access";

export default async function Page(props: Parameters<typeof ChatbotDashboardPage>[0]) {
  await requireChatbotViewAccess();
  return <ChatbotDashboardPage {...props} />;
}
