/** Client-safe types for the apps a company gets: the PWA (all devices), the mobile apps (Android, iOS) and the desktop apps (Windows, macOS, Linux). */

export const DESKTOP_PLATFORMS = ["win", "mac", "linux"] as const;
export const MOBILE_PLATFORMS = ["android", "ios"] as const;
export const APP_PLATFORMS = [...DESKTOP_PLATFORMS, ...MOBILE_PLATFORMS] as const;
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];
export type MobilePlatform = (typeof MOBILE_PLATFORMS)[number];
export type AppPlatform = (typeof APP_PLATFORMS)[number];

/**
 * What one press of a Generate button covers: a single platform. (`all`, `desktop` and `mobile` are kept for older records and
 * for the build service; the Apps page only ever asks for one platform.) The PWA needs no build, so it isn't a scope.
 */
export type GenerationScope = "all" | "desktop" | "mobile" | AppPlatform;
export const SCOPE_PLATFORMS: Record<GenerationScope, readonly AppPlatform[]> = {
  all: APP_PLATFORMS,
  desktop: DESKTOP_PLATFORMS,
  mobile: MOBILE_PLATFORMS,
  win: ["win"],
  mac: ["mac"],
  linux: ["linux"],
  android: ["android"],
  ios: ["ios"],
};
export const isAppPlatform = (v: unknown): v is AppPlatform => typeof v === "string" && (APP_PLATFORMS as readonly string[]).includes(v);

export const PLATFORM_META: Record<AppPlatform, { label: string; hint: string; /** The button's words. */ cta: string }> = {
  win: { label: "Windows", hint: "Windows 10 and 11: an installer (.exe)", cta: "Generate Windows App" },
  mac: { label: "macOS", hint: "macOS 11 or newer: a disk image (.dmg)", cta: "Generate macOS App" },
  linux: { label: "Linux", hint: "AppImage for any distribution, .deb for Debian and Ubuntu", cta: "Generate Linux App" },
  android: { label: "Android", hint: "Android 7 or newer: an installable APK and the Android Studio project", cta: "Generate Android App" },
  ios: { label: "iOS", hint: "iPhone and iPad: the Xcode project, ready to sign with your Apple Developer account", cta: "Generate iOS App" },
};

/** `skipped`: this build was started for other platforms only. */
export type PlatformStatus = "queued" | "building" | "ready" | "failed" | "skipped";

export interface BuildFile {
  name: string;
  url: string;
  size: number | null;
}

export interface PlatformState {
  status: PlatformStatus;
  files: BuildFile[];
  error: string | null;
  finishedAt: string | null;
}

export type BuildTrigger = "onboarding" | "manual" | "branding" | "retry" | "cron";

export interface BuildView {
  id: string;
  version: string;
  trigger: BuildTrigger;
  scope: GenerationScope;
  /** queued: waiting to be handed to the build service; building: handed over; ready; failed. */
  status: "queued" | "building" | "ready" | "failed";
  platforms: Record<AppPlatform, PlatformState>;
  requestedAt: string;
  finishedAt: string | null;
  runUrl: string | null;
  error: string | null;
  attempts: number;
}

/** Whether one platform's Generate button can be pressed, and if not, why. */
export type PlatformAction =
  /** Press it whenever you like. */
  | { kind: "ready" }
  /** A build of this platform is running. */
  | { kind: "running"; since: string }
  /** The build service is not connected on this platform, so nothing can be built yet. */
  | { kind: "unavailable"; reason: string };

/** What the Apps page shows. */
export interface AppsOverview {
  /** A build service is connected (builds can run). */
  configured: boolean;
  /** The company's name or icon changed since the installers were built. */
  outdated: boolean;
  active: BuildView | null;
  /** The newest build, whatever its state (to show per-platform failures). */
  latest: BuildView | null;
  downloads: Record<AppPlatform, { version: string; builtAt: string; files: BuildFile[] } | null>;
  /** One Generate button per platform. Nothing is ever built unless a person presses one. */
  actions: Record<AppPlatform, PlatformAction>;
  appAddress: string;
  lastError: string | null;
}
