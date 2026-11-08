import { redirectLegacyChatbotRoute } from "@/lib/products/sitecraft-ai/chatbot/routes";

export default async function LegacyConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectLegacyChatbotRoute("/commandos/chatbot/conversations", await searchParams);
}
