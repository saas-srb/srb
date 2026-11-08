/**
 * LinkedIn API versions (the `Linkedin-Version: YYYYMM` header).
 *
 * Source: Microsoft Learn, "LMS API Documentation Versioning" (learn.microsoft.com/en-us/linkedin/marketing/versioning, checked 2026-11-01):
 *  - a new version is published every month and is "supported and stable for a minimum of one year before sunset";
 *  - the latest version is 202610 (October 2026); the documented range starts at 202511;
 *  - an explicit notice: version 202511 sunsets on 2026-11-16;
 *  - a missing or sunset version header returns an error, and the latest version is never applied by default.
 * So, apart from versions with an announced date (SUNSET_ANNOUNCED), a version is treated as supported until 12 months after its month
 * begins, which is the earliest LinkedIn may retire it. Bump `LINKEDIN_LATEST_VERIFIED` when the page lists a newer version.
 */

export const LINKEDIN_LATEST_VERIFIED = "202610";
/** Default header: the latest verified version, which has the longest runway. */
export const LINKEDIN_DEFAULT_VERSION = LINKEDIN_LATEST_VERIFIED;
/** Announced sunset dates (UTC). */
export const SUNSET_ANNOUNCED: Record<string, string> = { "202511": "2026-11-16" };
/** Warn when the sunset is this close. */
export const LINKEDIN_WARN_DAYS = 60;

export type LinkedinVersionState = "ok" | "expiring" | "sunset" | "invalid";

export interface LinkedinVersionCheck {
  version: string;
  state: LinkedinVersionState;
  /** ISO date; announced when known, else the earliest possible (12 months after the version's month starts). */
  sunsetAt: string | null;
  announced: boolean;
  daysLeft: number | null;
  message: string;
}

const VERSION = /^(20\d{2})(0[1-9]|1[0-2])$/;

export function checkLinkedinVersion(version: string, now: Date = new Date()): LinkedinVersionCheck {
  const m = VERSION.exec(version);
  if (!m) return { version, state: "invalid", sunsetAt: null, announced: false, daysLeft: null, message: `"${version}" is not a LinkedIn version; use YYYYMM, e.g. ${LINKEDIN_DEFAULT_VERSION}.` };
  const announced = SUNSET_ANNOUNCED[version];
  const sunset = announced ? new Date(`${announced}T00:00:00Z`) : new Date(Date.UTC(Number(m[1]) + 1, Number(m[2]) - 1, 1));
  const sunsetAt = sunset.toISOString().slice(0, 10);
  const daysLeft = Math.ceil((sunset.getTime() - now.getTime()) / 86_400_000);
  const basis = announced ? "LinkedIn announced" : "the earliest LinkedIn may retire it";
  if (daysLeft <= 0) return { version, state: "sunset", sunsetAt, announced: Boolean(announced), daysLeft, message: `LinkedIn API version ${version} was sunset on ${sunsetAt} (${basis}); LinkedIn rejects it. Use ${LINKEDIN_LATEST_VERIFIED}.` };
  if (daysLeft <= LINKEDIN_WARN_DAYS) return { version, state: "expiring", sunsetAt, announced: Boolean(announced), daysLeft, message: `LinkedIn API version ${version} is retired on ${sunsetAt} (${basis}), in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Move to ${LINKEDIN_LATEST_VERIFIED} in Settings.` };
  return { version, state: "ok", sunsetAt, announced: Boolean(announced), daysLeft, message: `LinkedIn API version ${version} is supported until at least ${sunsetAt}.` };
}

/** The version to send: saved Settings value, else LINKEDIN_API_VERSION, else the verified default. */
export function effectiveLinkedinVersion(saved: string | undefined | null, env: string | undefined = process.env.LINKEDIN_API_VERSION): { version: string; source: "settings" | "env" | "default" } {
  if (saved && VERSION.test(saved)) return { version: saved, source: "settings" };
  if (env && VERSION.test(env.trim())) return { version: env.trim(), source: "env" };
  return { version: LINKEDIN_DEFAULT_VERSION, source: "default" };
}
