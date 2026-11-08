import { withTransport } from "@/lib/security/transport";
import { cookies, draftMode } from "next/headers";
import { THEME_PREVIEW_COOKIE } from "@/lib/products/sitecraft-ai/theme-preview";

/** Ends a theme live preview: this browser goes back to the cached site with the active theme. */
async function handlePOST() {
  (await draftMode()).disable();
  (await cookies()).delete(THEME_PREVIEW_COOKIE);
  return new Response(null, { status: 204 });
}

export const POST = withTransport(handlePOST);
