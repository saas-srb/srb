import { redirectLegacyChatbotRoute } from "@/lib/products/sitecraft-ai/chatbot/routes";

export default async function LegacyChatbotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectLegacyChatbotRoute("/commandos/chatbot", await searchParams);
}
