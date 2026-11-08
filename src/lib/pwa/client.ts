"use client";

/** Browser-side helpers shared by the install prompt and the notification settings. */

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type Platform = "ios" | "android" | "mac" | "windows" | "linux" | "other";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac with touch.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "windows";
  if (/Linux|CrOS/.test(ua)) return "linux";
  return "other";
}

export type BrowserKind = "safari" | "chromium" | "firefox" | "other";

export function detectBrowser(): BrowserKind {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Firefox|FxiOS/.test(ua)) return "firefox";
  if (/Chrome|Chromium|CriOS|Edg\/|OPR\/|SamsungBrowser/.test(ua)) return "chromium";
  if (/Safari/.test(ua)) return "safari";
  return "other";
}

/** Running inside the SelfRun desktop app (Electron, Windows/macOS/Linux): it adds `WorkspaceDesktop/<version>` to the browser identity. */
export function isDesktopApp(): boolean {
  return typeof navigator !== "undefined" && /WorkspaceDesktop\//.test(navigator.userAgent);
}

/** Running as an installed app (standalone window / home-screen icon / desktop app). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (isDesktopApp()) return true;
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: minimal-ui)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Whether this browser can do Web Push at all (on iOS/iPadOS only from the installed home-screen app, 16.4+). */
export function pushSupported(): boolean {
  // The desktop app shows notifications natively (it has no Web Push service).
  if (isDesktopApp()) return false;
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** The install prompt Chromium browsers (Android, Windows, macOS, Linux, ChromeOS) offer; captured once for the whole page. */
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function initInstallCapture(): void {
  if (typeof window === "undefined" || (window as unknown as { __installCapture?: boolean }).__installCapture) return;
  (window as unknown as { __installCapture?: boolean }).__installCapture = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const getDeferredInstall = () => deferred;
export function onInstallChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function clearDeferredInstall(): void {
  deferred = null;
  listeners.forEach((l) => l());
}
