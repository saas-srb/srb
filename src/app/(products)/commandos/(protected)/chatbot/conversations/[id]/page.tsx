import ConversationDetailPage from "@/components/products/sitecraft-ai/chatbot/ConversationDetailPage";
import { requireChatbotViewAccess } from "../../access";

export default async function Page(props: Parameters<typeof ConversationDetailPage>[0]) {
  await requireChatbotViewAccess();
  return <ConversationDetailPage {...props} />;
}
