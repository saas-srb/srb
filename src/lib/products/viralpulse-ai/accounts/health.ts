import type { HealthItem } from "@/lib/products/viralpulse-ai/health";
import { ACCOUNT_INFO, CONNECTION_INFO, type AccountView } from "./types";

const ymd = (iso: string) => iso.slice(0, 10);

/** One health item per enabled account that needs attention (healthy accounts add nothing: the provider line already says connected). */
export function accountHealthItems(views: AccountView[]): HealthItem[] {
  const out: HealthItem[] = [];
  for (const v of views) {
    if (!v.enabled) continue;
    const id = `account.${v.id}`;
    const label = `${ACCOUNT_INFO[v.provider].label}: ${v.name}`;
    const reconnect = `Press Reconnect on the ${CONNECTION_INFO[v.oauth].short} login in Settings > Connected accounts.`;
    const bad = (detail: string, fix: string) => out.push({ id, label, status: "attention", detail, fix, ...(v.lastError ? { lastError: v.lastError } : {}) });
    if (v.status === "revoked") bad("Access was revoked or this login was disconnected, so posts to it will fail.", reconnect);
    else if (v.status === "expired") bad(`The login expired${v.expiresAt ? ` on ${ymd(v.expiresAt)}` : ""}; posts to it will fail.`, reconnect);
    else if (v.status === "missing_scope") bad(`Missing permission: ${v.missingRequired.join(", ")}.`, 'Press "Fix permissions" on the account in Settings > Connected accounts.');
    else if (v.status === "expiring") bad(`The login expires in ${v.daysLeft ?? 0} day${v.daysLeft === 1 ? "" : "s"} (${v.expiresAt ? ymd(v.expiresAt) : "soon"}) and cannot renew itself.`, reconnect);
    else if (v.lastError) bad(`The last call failed: ${v.lastError}`, "Press Test connection on the account; if it fails, reconnect the login.");
  }
  return out;
}
