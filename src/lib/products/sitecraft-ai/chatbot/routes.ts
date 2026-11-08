import { redirect } from "next/navigation";

export async function redirectLegacyChatbotRoute(
  destination: string,
  searchParams: Record<string, string | string[] | undefined>
): Promise<never> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value) query.set(key, value);
  }
  const suffix = query.toString();
  redirect(suffix ? `${destination}?${suffix}` : destination);
}
