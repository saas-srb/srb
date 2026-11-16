import { redirectLegacyChatbotRoute } from "@/lib/products/sitecraft-ai/chatbot/routes";

/** SiteCraft's own chatbot pages are gone: this address keeps working and opens the CommandOS AI Chatbot panel. */
export default async function LegacyChatbotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await redirectLegacyChatbotRoute("/commandos/chatbot/config", await searchParams);
}
