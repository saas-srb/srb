import "server-only";
import { cache } from "react";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { unavailablePanelKeys } from "@/lib/platform/panels/store";

/**
 * The products the current company can't use (not bought, not in its plan, or switched off): screens leave them out
 * altogether — no name, no link. Once per request. Fails open (nothing hidden).
 */
export const hiddenProducts = cache(async (): Promise<Set<string>> => {
  try {
    return await unavailablePanelKeys(await currentCompanyId());
  } catch (err) {
    console.error("[products] visibility lookup failed", err);
    return new Set();
  }
});
