/**
 * Shared vocabulary of the paid-ads platforms layer. Pure (no server-only imports): safe in client components.
 * Field specs and their sources: see SPEC.md in this folder.
 */

export const ADS_PLATFORMS = ["meta", "google", "linkedin", "x"] as const;
export type AdsPlatformKey = (typeof ADS_PLATFORMS)[number];
export const isAdsPlatform = (v: unknown): v is AdsPlatformKey => (ADS_PLATFORMS as readonly unknown[]).includes(v);

export interface PlatformCapability {
  platform: AdsPlatformKey;
  label: string;
  /** True = campaigns are really created, activated and synced through the platform's API. */
  realLaunch: boolean;
  /** True = the company needs an approval from the platform before this can work at all (see `approval`). */
  requiresApprovedAccess: boolean;
  /** Plain statement of what exists in the code today. */
  scope: string;
  /** What the company must obtain from the platform. */
  approval: string;
}

export const CAPABILITIES: Record<AdsPlatformKey, PlatformCapability> = {
  meta: {
    platform: "meta",
    label: "Meta (Facebook and Instagram)",
    realLaunch: true,
    requiresApprovedAccess: false,
    scope: "Create, approve, activate, pause, edit, archive and sync campaigns, ad sets and ads.",
    approval: "Your own ad accounts work with Standard access. Managing other businesses' ad accounts needs Advanced access (App Review and Business Verification) for ads_management.",
  },
  google: {
    platform: "google",
    label: "Google Ads",
    realLaunch: false,
    requiresApprovedAccess: true,
    scope: "Request shape and validation only. Nothing is sent to Google Ads.",
    approval: "A Google Cloud project with at least Explorer access to the Google Ads API (developer tokens were retired on 9 September 2026).",
  },
  linkedin: {
    platform: "linkedin",
    label: "LinkedIn Campaign Manager",
    realLaunch: false,
    requiresApprovedAccess: true,
    scope: "Request shape and validation only. Nothing is sent to LinkedIn.",
    approval: "The Advertising API product on your LinkedIn app, approved by LinkedIn (Development tier manages up to 5 ad accounts).",
  },
  x: {
    platform: "x",
    label: "X Ads",
    realLaunch: false,
    requiresApprovedAccess: true,
    scope: "Request shape and validation only. Nothing is sent to X.",
    approval: "Access to the X Ads API for your developer app, approved by X.",
  },
};

/** The ads platform an SMMS ad platform runs on. YouTube runs through Google Ads. */
export function adsPlatformFor(p: string): AdsPlatformKey | null {
  if (p === "facebook" || p === "instagram") return "meta";
  if (p === "google_ads" || p === "youtube") return "google";
  if (p === "linkedin") return "linkedin";
  return null;
}

/** One problem with the draft, addressed by a path the form can attach it to (e.g. `meta.adSets[0].budget.amountMinor`). */
export interface FieldError {
  path: string;
  code: string;
  message: string;
  severity: "error" | "warning";
}

export const err = (path: string, code: string, message: string): FieldError => ({ path, code, message, severity: "error" });
export const warn = (path: string, code: string, message: string): FieldError => ({ path, code, message, severity: "warning" });

export interface ValidationResult {
  ok: boolean;
  errors: FieldError[];
  warnings: FieldError[];
}

export function result(list: FieldError[]): ValidationResult {
  const errors = list.filter((e) => e.severity === "error");
  return { ok: errors.length === 0, errors, warnings: list.filter((e) => e.severity === "warning") };
}

export const AD_COLLECTIONS = {
  launches: "smms_ad_launches",
  syncRuns: "smms_ad_sync_runs",
  snapshots: "smms_metric_snapshots",
} as const;

/** ISO 4217 minor-unit digits. Meta amounts are integers in the currency's smallest unit. */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}
export const toMinor = (major: number, currency: string): number => Math.round(major * 10 ** currencyDigits(currency));
export const fromMinor = (minor: number, currency: string): number => minor / 10 ** currencyDigits(currency);
