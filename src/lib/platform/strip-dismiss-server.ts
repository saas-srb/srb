import "server-only";
import { cookies } from "next/headers";
import { STRIP_DISMISS_COOKIE_PREFIX } from "./strip-dismiss-shared";

/**
 * Checks server-side whether an action strip / banner has been dismissed by the user.
 * Reads the matching cookie set by client-side dismiss actions.
 */
export async function isStripDismissedServer(stripId: string): Promise<boolean> {
  const store = await cookies();
  return store.has(`${STRIP_DISMISS_COOKIE_PREFIX}${stripId}`);
}
