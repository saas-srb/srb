import { clientIpFrom } from "@/lib/security/ip";
/**
 * What can be told about whoever made a request: network address, browser / system / device from the User-Agent, and an approximate place
 * from the hosting platform's geo headers (Vercel sets them; nothing is looked up anywhere else, so no address leaves the server and nothing
 * is slowed down). Pure — takes the request headers.
 */

export type DeviceType = "desktop" | "mobile" | "tablet" | "app";

export interface DeviceInfo {
  browser: string;
  os: string;
  type: DeviceType;
  /** "Desktop app" when it is the installed desktop application. */
  app: string | null;
  /** "Chrome on macOS". */
  label: string;
}

export interface LocationInfo {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  /** "Mumbai, Maharashtra, India". */
  label: string;
}

export interface ClientInfo {
  ip: string | null;
  userAgent: string;
  device: DeviceInfo;
  location: LocationInfo | null;
}

export function parseUserAgent(ua: string): DeviceInfo {
  const app = /WorkspaceDesktop\/[\d.]+/.test(ua) ? "Desktop app" : null;
  let browser = "Browser";
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS/.test(ua)) browser = "Firefox";
  else if (/CriOS|Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let os = "Unknown system";
  if (/Windows NT/.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Linux|X11/.test(ua)) os = "Linux";
  let type: DeviceType = "desktop";
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) type = "tablet";
  else if (/Mobi|iPhone|Android/.test(ua)) type = "mobile";
  if (app) type = "app";
  const label = app ? `${app} on ${os}` : browser === "Browser" && os === "Unknown system" ? "Unknown device" : `${browser} on ${os}`;
  return { browser, os, type, app, label };
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

const decode = (v: string | null): string | null => {
  if (!v) return null;
  try {
    return decodeURIComponent(v).trim() || null;
  } catch {
    return v.trim() || null;
  }
};

export function isPrivateAddress(ip: string | null): boolean {
  if (!ip) return false;
  return ip === "::1" || ip === "127.0.0.1" || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fe80:|fc|fd)/i.test(ip);
}

/** "IN" → "India" (falls back to the code). */
export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return regionNames?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** "IN" → 🇮🇳. */
export function flagEmoji(code: string | null): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

export function readClient(h: Headers): ClientInfo {
  const userAgent = (h.get("user-agent") ?? "").slice(0, 400);
  const ipRaw = clientIpFrom(h);
  const ip = ipRaw === "unknown" ? null : ipRaw;
  const countryCode = (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "").toUpperCase() || null;
  const city = decode(h.get("x-vercel-ip-city") || h.get("cf-ipcity"));
  const region = decode(h.get("x-vercel-ip-country-region") || h.get("cf-region"));
  const country = countryName(countryCode && countryCode !== "XX" && countryCode !== "T1" ? countryCode : null);
  let location: LocationInfo | null = null;
  if (country || city) {
    location = { city, region, country, countryCode: countryCode && /^[A-Z]{2}$/.test(countryCode) ? countryCode : null, label: [city, region, country].filter(Boolean).join(", ") };
  }
  return { ip, userAgent, device: parseUserAgent(userAgent), location };
}
