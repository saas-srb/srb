import { SAAS_BRAND } from "@/lib/platform/saas/brand";
import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { RESERVED_SLUGS } from "@/lib/platform/tenancy/slug";

/**
 * Platform-wide settings (not per company), stored in `platform_settings`
 * and edited in Platform Console → Platform settings (platform owner's Super
 * Admins only). Every save is audited.
 *
 *  - `_id: "signup"`  — who can create a company (sign-up mode)
 *  - `_id: "general"` — platform name + support contact (SaaS emails and
 *    pages), defaults for new companies, the maintenance banner shown on
 *    company products, and extra reserved subdomains
 *
 * Provider credentials live separately in `integrations/`.
 */

const COLLECTION = "platform_settings";

// ── Sign-up mode ─────────────────────────────────────────────────────────────

export type SignupMode = "open" | "approval" | "closed";
export const SIGNUP_MODES: readonly SignupMode[] = ["open", "approval", "closed"];

interface SignupSettingsDoc {
  _id: "signup";
  mode: SignupMode;
  updatedAt: Date;
  updatedBy: string | null;
}

export async function getSignupMode(): Promise<SignupMode> {
  const db = await getPlatformDb();
  const doc = await db.collection<SignupSettingsDoc>(COLLECTION).findOne({ _id: "signup" });
  return doc?.mode ?? "open";
}

export async function setSignupMode(mode: SignupMode, actorId: string): Promise<void> {
  if (!SIGNUP_MODES.includes(mode)) throw new Error(`Unknown sign-up mode "${mode}"`);
  const db = await getPlatformDb();
  const before = await db.collection<SignupSettingsDoc>(COLLECTION).findOneAndUpdate(
    { _id: "signup" },
    { $set: { mode, updatedAt: new Date(), updatedBy: actorId } },
    { upsert: true, returnDocument: "before", projection: { mode: 1 } },
  );
  const from = before?.mode ?? "open";
  if (from !== mode) await recordPlatformAudit({ actorId, action: "settings.signup_mode.update", target: { type: "platform_settings", id: "signup" }, details: { from, to: mode } });
}

// ── General platform settings ────────────────────────────────────────────────

export interface PlatformGeneralSettings {
  /** Shown as the sender brand in SaaS emails and on platform pages. */
  platformName: string;
  supportEmail: string;
  supportUrl: string;
  /** BCP 47 locale for new companies, e.g. "en-IN". */
  defaultLocale: string;
  /** IANA time zone for new companies, e.g. "Asia/Kolkata". */
  defaultTimezone: string;
  /** Shown on every company's products while set; empty = no banner. */
  maintenanceBanner: string;
  /** Subdomains no new company may take, on top of the built-in list. */
  reservedSubdomains: string[];
  updatedAt: Date | null;
  updatedBy: string | null;
}

export type PlatformGeneralInput = Omit<PlatformGeneralSettings, "updatedAt" | "updatedBy">;

export const PLATFORM_SETTINGS_DEFAULTS: PlatformGeneralInput = {
  platformName: SAAS_BRAND.name,
  supportEmail: "",
  supportUrl: "",
  defaultLocale: "en-IN",
  defaultTimezone: "Asia/Kolkata",
  maintenanceBanner: "",
  reservedSubdomains: [],
};

type GeneralDoc = Partial<PlatformGeneralSettings> & { _id: "general" };

// Read on every company product render (maintenance banner), so cached briefly;
// on globalThis so every bundle in the process shares it. A save busts it here;
// other instances follow within the TTL.
const TTL_MS = 30_000;
const g = globalThis as unknown as { __platformGeneralSettings?: { value: PlatformGeneralSettings | null; at: number } };
const memo = (g.__platformGeneralSettings ??= { value: null, at: 0 });

export function forgetPlatformSettings(): void {
  memo.at = 0;
  memo.value = null;
}

export async function getPlatformSettings(): Promise<PlatformGeneralSettings> {
  if (memo.value && Date.now() - memo.at < TTL_MS) return memo.value;
  const db = await getPlatformDb();
  const doc = await db.collection<GeneralDoc>(COLLECTION).findOne({ _id: "general" });
  const value: PlatformGeneralSettings = {
    ...PLATFORM_SETTINGS_DEFAULTS,
    ...Object.fromEntries(Object.entries(doc ?? {}).filter(([k, v]) => k !== "_id" && v !== undefined && v !== null)),
    reservedSubdomains: doc?.reservedSubdomains ?? [],
    updatedAt: doc?.updatedAt ?? null,
    updatedBy: doc?.updatedBy ?? null,
  };
  memo.value = value;
  memo.at = Date.now();
  return value;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const MAX_RESERVED_SUBDOMAINS = 500;
export const MAX_BANNER_LENGTH = 280;

function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function canonicalLocale(locale: string): string | null {
  try {
    const [canon] = Intl.getCanonicalLocales(locale);
    return canon ?? null;
  } catch {
    return null;
  }
}

/** "Demo, Test\nstaging" → ["demo", "staging", "test"]; entries already reserved by default are dropped. */
export function parseReservedList(raw: string | string[]): string[] {
  const items = (Array.isArray(raw) ? raw : raw.split(/[\s,]+/)).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  return [...new Set(items)].filter((s) => !RESERVED_SLUGS.has(s)).sort();
}

export type PlatformSettingsResult = { ok: true } | { ok: false; errors: Record<string, string> };

export async function savePlatformSettings(input: PlatformGeneralInput, actorId: string): Promise<PlatformSettingsResult> {
  const errors: Record<string, string> = {};
  const platformName = String(input.platformName ?? "").trim();
  const supportEmail = String(input.supportEmail ?? "").trim();
  const supportUrl = String(input.supportUrl ?? "").trim();
  const localeRaw = String(input.defaultLocale ?? "").trim();
  const defaultTimezone = String(input.defaultTimezone ?? "").trim();
  const maintenanceBanner = String(input.maintenanceBanner ?? "").trim().replace(/\s+/g, " ");
  const reservedSubdomains = parseReservedList(Array.isArray(input.reservedSubdomains) ? input.reservedSubdomains : []);

  if (platformName.length < 2 || platformName.length > 60) errors.platformName = "Use 2–60 characters.";
  if (supportEmail && !EMAIL_RE.test(supportEmail)) errors.supportEmail = "Enter a valid email.";
  if (supportUrl && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(supportUrl)) errors.supportUrl = "Enter a full URL, e.g. https://help.example.com";
  const defaultLocale = canonicalLocale(localeRaw);
  if (!defaultLocale) errors.defaultLocale = "Enter a locale code, e.g. en-IN.";
  if (!isValidTimezone(defaultTimezone)) errors.defaultTimezone = "Choose a time zone.";
  if (maintenanceBanner.length > MAX_BANNER_LENGTH) errors.maintenanceBanner = `Keep it under ${MAX_BANNER_LENGTH} characters.`;
  const badLabels = reservedSubdomains.filter((s) => !LABEL_RE.test(s));
  if (badLabels.length) errors.reservedSubdomains = `Not valid subdomains: ${badLabels.slice(0, 5).join(", ")}${badLabels.length > 5 ? "…" : ""}`;
  else if (reservedSubdomains.length > MAX_RESERVED_SUBDOMAINS) errors.reservedSubdomains = `Up to ${MAX_RESERVED_SUBDOMAINS} entries.`;
  if (Object.keys(errors).length) return { ok: false, errors };

  const next: PlatformGeneralInput = { platformName, supportEmail, supportUrl, defaultLocale: defaultLocale!, defaultTimezone, maintenanceBanner, reservedSubdomains };
  const before = await getPlatformSettings().catch(() => null);
  const db = await getPlatformDb();
  await db.collection<GeneralDoc>(COLLECTION).updateOne({ _id: "general" }, { $set: { ...next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true });
  forgetPlatformSettings();

  const changed = (Object.keys(next) as (keyof PlatformGeneralInput)[]).filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(next[k]));
  if (changed.length) {
    await recordPlatformAudit({
      actorId,
      action: "settings.platform.update",
      target: { type: "platform_settings", id: "general" },
      details: {
        changed,
        ...(changed.includes("maintenanceBanner") ? { maintenanceBanner: maintenanceBanner ? "set" : "cleared" } : {}),
        ...(changed.includes("reservedSubdomains") ? { reservedSubdomains: reservedSubdomains.length } : {}),
      },
    });
  }
  return { ok: true };
}

// ── Helpers used elsewhere ───────────────────────────────────────────────────

/** Built-in reserved subdomains plus the ones added in the Platform Console. */
export async function reservedSubdomains(): Promise<Set<string>> {
  const { reservedSubdomains: extra } = await getPlatformSettings();
  return new Set([...RESERVED_SLUGS, ...extra]);
}

/**
 * Whether a new workspace address is reserved by the platform (the
 * format-level check, including the built-in list, is `slugFormatError`).
 * Only new companies are affected: routing never blocks an existing company's
 * slug because it was reserved later.
 */
export async function reservedSlugError(slug: string): Promise<string | null> {
  return (await reservedSubdomains()).has(slug) ? "That address is reserved." : null;
}

/** Brand + support line for platform (not company) emails. */
export async function platformEmailIdentity(): Promise<{ name: string; supportLine: string | null }> {
  const s = await getPlatformSettings().catch(() => ({ ...PLATFORM_SETTINGS_DEFAULTS }));
  const contact = [s.supportEmail, s.supportUrl].filter(Boolean).join(" or ");
  return { name: s.platformName, supportLine: contact ? `Need help? Contact ${contact}.` : null };
}
