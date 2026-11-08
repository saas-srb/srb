import "server-only";
import { getAccountFor, markAccountError, withAccountToken } from "@/lib/products/viralpulse-ai/accounts/service";
import { GRAPH, linkedinVersion } from "@/lib/products/viralpulse-ai/accounts/versions";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import type { Credentials, PlatformKey } from "./types";

/**
 * The ONLY place the publishers get tokens from: WP2's connected accounts (`smms_accounts`). Tokens are read through
 * `withAccountToken` (renews when about to expire) and are never stored on an attempt or logged.
 */
const kindOf = (platform: PlatformKey): string => (platform === "x" ? "x_account" : platform);

export async function resolveCredentials(platform: PlatformKey, accountId?: string | null): Promise<Credentials> {
  const acct = await getAccountFor(kindOf(platform), accountId);
  if (!acct) throw new SmmsInputError(accountId ? "The chosen account isn't connected any more. Pick another or reconnect it in Settings → Connected accounts." : `No ${platform === "x" ? "X" : platform.replace("_", " ")} account is connected. Connect one in Settings → Connected accounts.`);
  if (!acct.enabled) throw new SmmsInputError(`${acct.name} is switched off in Settings → Connected accounts.`);
  const token = await withAccountToken(acct.id, async (t) => t);
  const refresh = async (): Promise<string | null> => {
    // withAccountToken renews on a 401 from its callback and calls it again; use that to force one renewal.
    let first = true;
    try {
      return await withAccountToken(acct.id, async (t) => {
        if (first) {
          first = false;
          throw Object.assign(new Error("renew"), { status: 401 });
        }
        return t;
      });
    } catch {
      return null;
    }
  };
  const extra: Record<string, string> = { ...acct.meta, graph: GRAPH };
  if (platform === "linkedin") extra.version = await linkedinVersion();
  return { accountId: acct.id, token, targetId: acct.externalId, extra, refresh };
}

export async function isConnected(platform: PlatformKey, accountId?: string | null): Promise<boolean> {
  const a = await getAccountFor(kindOf(platform), accountId).catch(() => null);
  return Boolean(a && a.enabled && a.status !== "expired" && a.status !== "revoked");
}

/** Records a provider/auth failure on the account so Settings can show it. */
export async function reportAccountError(_platform: PlatformKey, message: string, accountId?: string | null): Promise<void> {
  if (!accountId) return;
  await markAccountError(accountId, message, { auth: true });
}
