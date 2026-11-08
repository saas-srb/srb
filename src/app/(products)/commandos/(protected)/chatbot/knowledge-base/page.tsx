import KnowledgeBasePage from "@/components/products/sitecraft-ai/chatbot/KnowledgeBasePage";
import { requireChatbotViewAccess } from "../access";

export default async function Page() {
  await requireChatbotViewAccess();
  return <KnowledgeBasePage />;
}
