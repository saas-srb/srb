"use client";

import type { RequestContext } from "@/lib/support/types";

const KEY = "support:last-context";

function parseUa(ua: string): { browser: string | null; browserVersion: string | null; os: string | null; device: string } {
  const pick = (re: RegExp) => ua.match(re)?.[1] ?? null;
  let browser: string | null = null;
  let browserVersion: string | null = null;
  const rules: [string, RegExp][] = [
    ["Edge", /Edg\/([\d.]+)/],
    ["Opera", /OPR\/([\d.]+)/],
    ["Chrome", /Chrome\/([\d.]+)/],
    ["Firefox", /Firefox\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of rules) {
    const v = pick(re);
    if (v) {
      browser = name;
      browserVersion = v;
      break;
    }
  }
  const os = /Windows NT/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  const device = /iPad|Tablet/.test(ua) ? "Tablet" : /Mobi|iPhone|Android/.test(ua) ? "Mobile" : "Desktop";
  return { browser, browserVersion, os, device };
}

/** Where the user is right now, read from the browser and the URL — nothing is mapped by hand, so new products just work. */
export function captureContext(): RequestContext {
  const path = window.location.pathname;
  const segments = path.split("/").filter(Boolean);
  const title = document.title.replace(/\s*[|·–-]\s*[^|·–-]*$/, "").trim() || document.title;
  const ua = navigator.userAgent;
  return {
    panel: segments[0] ?? null,
    page: title || null,
    route: path + window.location.search.slice(0, 120),
    feature: segments.slice(1).filter((s) => !/^[0-9a-f]{12,}$/i.test(s)).join(" / ") || null,
    ...parseUa(ua),
    userAgent: ua,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timestamp: new Date().toISOString(),
    errorInfo: null,
  };
}

/** Remembers the last place outside the Help Center, so the Help Center chat knows where the user came from. */
export function rememberContext(c: RequestContext) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

export function currentContext(): RequestContext {
  const now = captureContext();
  if (now.panel !== "support") return now;
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) return { ...now, ...(JSON.parse(saved) as Partial<RequestContext>), timestamp: now.timestamp };
  } catch {
    /* ignore */
  }
  return now;
}
