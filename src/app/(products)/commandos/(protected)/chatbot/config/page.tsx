import { redirect } from "next/navigation";
import { movedTarget } from "@/lib/products/commandos/moved-urls";

/** This address moved (see lib/products/commandos/moved-urls.ts): it keeps working and opens the new place. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(movedTarget("/commandos/chatbot/config", await searchParams) ?? "/commandos");
}
