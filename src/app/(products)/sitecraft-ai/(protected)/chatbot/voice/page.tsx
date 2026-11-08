import { redirectLegacyChatbotRoute } from "@/lib/products/sitecraft-ai/chatbot/routes";

export default async function LegacyVoiceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectLegacyChatbotRoute("/commandos/chatbot/voice", await searchParams);
}
