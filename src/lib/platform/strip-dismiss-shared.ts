export const STRIP_DISMISS_COOKIE_PREFIX = "workspace_strip_dismiss_";
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const STRIP_DISMISS_KEY_PREFIX = "workspace_strip_dismiss:";
export const ALL_STRIP_IDS = ["billing-notice", "setup", "upgrade", "verify-email"] as const;
export type StripId = (typeof ALL_STRIP_IDS)[number];
