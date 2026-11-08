import { redirectLegacyChatbotRoute } from "@/lib/products/sitecraft-ai/chatbot/routes";

export default async function LegacyVoiceConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectLegacyChatbotRoute("/commandos/chatbot/voice-conversations", await searchParams);
}
