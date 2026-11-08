import "server-only";
import { NextResponse } from "next/server";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { onAppSurface } from "@/lib/platform/saas/request";
import type { PushActor } from "@/lib/push/store";

/**
 * Shared guard for /api/push/*. Push exists only in the app (app hosts), never on a website host, and only for a signed-in
 * person: a staff/employee account, else a portal account. Returns the person, or the response to send instead.
 */
export async function pushCaller(): Promise<{ actor: PushActor; userId: string; label: string } | NextResponse> {
  if (!(await onAppSurface())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const hub = await getCurrentHubUser();
  if (hub) return { actor: "staff", userId: hub.id, label: hub.email };
  const portal = await getCurrentPortalUser();
  if (portal) return { actor: "portal", userId: portal.id, label: portal.email };
  return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401 });
}

/** Push services a browser can legitimately hand us. The server POSTs to this URL, so anything else is refused (SSRF). */
const PUSH_HOSTS: RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Android), Brave, Opera, Samsung Internet
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /\.push\.services\.mozilla\.com$/,
  /\.push\.apple\.com$/, // Safari / iOS / iPadOS home-screen apps
  /\.notify\.windows\.com$/, // Edge (Windows)
  /\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** "Chrome on Android" from a User-Agent (best effort; only used as a label). */
export function describeDevice(ua: string): string {
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}
