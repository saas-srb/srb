import "server-only";
import { cookies } from "next/headers";
import { loginSessions, LOGIN_COOKIE } from "@/lib/security/store";

/** "Last active" for the sign-in this browser holds: updated at most every 5 minutes per server instance, so it costs nothing on a busy page. */
const THROTTLE_MS = 5 * 60 * 1000;
const g = globalThis as unknown as { __loginTouch?: Map<string, number> };

export async function touchLoginSession(): Promise<void> {
  try {
    const id = (await cookies()).get(LOGIN_COOKIE)?.value;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return;
    const seen = (g.__loginTouch ??= new Map());
    const last = seen.get(id) ?? 0;
    if (Date.now() - last < THROTTLE_MS) return;
    if (seen.size > 5000) seen.clear();
    seen.set(id, Date.now());
    await (await loginSessions()).updateOne({ _id: id, revokedAt: null }, { $set: { lastSeenAt: new Date() } });
  } catch {
    // never fails a page over a timestamp
  }
}
