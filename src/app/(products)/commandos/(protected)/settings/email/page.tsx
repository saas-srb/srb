import { redirect } from "next/navigation";
import { movedTarget } from "@/lib/products/commandos/moved-urls";

/** Sender email is now a section of Custom domains (see lib/products/commandos/moved-urls.ts). The address keeps working. */
export default function Page() {
  redirect(movedTarget("/commandos/settings/email") ?? "/commandos/settings/domains");
}
