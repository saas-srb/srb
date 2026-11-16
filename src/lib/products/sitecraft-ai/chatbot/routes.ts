import { redirect } from "next/navigation";
import { movedTarget } from "@/lib/products/commandos/moved-urls";

/**
 * SiteCraft no longer has a chatbot of its own: the AI Chatbot lives in CommandOS (Integrations, AI Chatbot panel). Every old SiteCraft chatbot
 * address keeps working and goes straight to the new place (one redirect, query string kept).
 */
export async function redirectLegacyChatbotRoute(
  destination: string,
  searchParams: Record<string, string | string[] | undefined>
): Promise<never> {
  redirect(movedTarget(destination, searchParams) ?? withQuery(destination, searchParams));
}

function withQuery(destination: string, searchParams: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `${destination}?${suffix}` : destination;
}
