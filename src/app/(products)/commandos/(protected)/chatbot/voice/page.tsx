import VoiceDashboardPage from "@/components/products/sitecraft-ai/chatbot/VoiceDashboardPage";
import { requireChatbotViewAccess } from "../access";

export default async function Page(props: Parameters<typeof VoiceDashboardPage>[0]) {
  await requireChatbotViewAccess();
  return <VoiceDashboardPage {...props} />;
}
