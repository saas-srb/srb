/**
 * Top-up packs: extra AI tokens, emails, voice minutes and custom domains, bought once, any time, on top of the plan (pure: shared by the
 * server, the Usage page and the tests). Prices are per pack, in paise, BEFORE GST. A pack is prepaid: it is used only after the plan's own
 * monthly allowance for that service is used up, does not reset with the month, and lapses 12 months after it was bought. Domain packs are
 * extra slots for the same 12 months.
 */

export type TopupService = "ai_tokens" | "emails" | "voice_minutes" | "domains";

export interface TopupServiceDef {
  key: TopupService;
  label: string;
  /** What the buyer is getting, e.g. "AI tokens". */
  noun: string;
  /** The plan limit it adds to (`PlanLimits` key) and the usage meter it is counted against. */
  limitKey: "aiTokensPerMonth" | "emailsPerMonth" | "voiceMinutesPerMonth" | "customDomains";
  metric: "ai_tokens" | "emails" | "voice_seconds" | null;
  /** Meter units per credit unit (voice is metered in seconds, bought in minutes). */
  perUnit: number;
  /** A consumable is spent after the plan allowance; slots are simply added to the limit. */
  consumable: boolean;
  note: string;
}

export const TOPUP_SERVICES: TopupServiceDef[] = [
  { key: "ai_tokens", label: "AI tokens", noun: "AI tokens", limitKey: "aiTokensPerMonth", metric: "ai_tokens", perUnit: 1, consumable: true, note: "Used after your monthly AI tokens run out." },
  { key: "emails", label: "Emails", noun: "emails", limitKey: "emailsPerMonth", metric: "emails", perUnit: 1, consumable: true, note: "Used after your monthly emails run out." },
  { key: "voice_minutes", label: "Voice minutes", noun: "voice minutes", limitKey: "voiceMinutesPerMonth", metric: "voice_seconds", perUnit: 60, consumable: true, note: "Used after your monthly voice minutes run out." },
  { key: "domains", label: "Custom domains", noun: "custom domains", limitKey: "customDomains", metric: null, perUnit: 1, consumable: false, note: "Extra domain slots for 12 months." },
];

export interface TopupPack {
  id: string;
  service: TopupService;
  /** Credit units (tokens, emails, minutes, domain slots). */
  units: number;
  /** Paise, before GST. */
  price: number;
  popular?: boolean;
}

export const TOPUP_VALID_MONTHS = 12;

export const TOPUP_PACKS: TopupPack[] = [
  { id: "ai_500k", service: "ai_tokens", units: 500_000, price: 29_900 },
  { id: "ai_2m", service: "ai_tokens", units: 2_000_000, price: 99_900, popular: true },
  { id: "ai_10m", service: "ai_tokens", units: 10_000_000, price: 449_900 },
  { id: "email_1k", service: "emails", units: 1_000, price: 14_900 },
  { id: "email_5k", service: "emails", units: 5_000, price: 59_900, popular: true },
  { id: "email_25k", service: "emails", units: 25_000, price: 249_900 },
  { id: "voice_30", service: "voice_minutes", units: 30, price: 24_900 },
  { id: "voice_100", service: "voice_minutes", units: 100, price: 69_900, popular: true },
  { id: "voice_300", service: "voice_minutes", units: 300, price: 179_900 },
  { id: "domain_1", service: "domains", units: 1, price: 49_900 },
  { id: "domain_3", service: "domains", units: 3, price: 129_900, popular: true },
  { id: "domain_5", service: "domains", units: 5, price: 199_900 },
];

export const serviceDef = (s: TopupService) => TOPUP_SERVICES.find((d) => d.key === s)!;
export const packById = (id: unknown): TopupPack | null => (typeof id === "string" ? TOPUP_PACKS.find((p) => p.id === id) ?? null : null);
export const packsFor = (s: TopupService) => TOPUP_PACKS.filter((p) => p.service === s);

const n = (v: number) => v.toLocaleString("en-IN");

/** "5,00,000 AI tokens", "100 voice minutes", "3 custom domains". */
export function formatUnits(service: TopupService, units: number): string {
  const d = serviceDef(service);
  if (service === "ai_tokens") return units >= 1_000_000 ? `${n(units / 1_000_000)}M AI tokens` : `${n(Math.round(units / 1000))}K AI tokens`;
  return `${n(units)} ${units === 1 && service === "domains" ? "custom domain" : d.noun}`;
}

/** When a pack bought at `at` lapses. */
export function packExpiry(at: Date): Date {
  const d = new Date(at);
  d.setUTCMonth(d.getUTCMonth() + TOPUP_VALID_MONTHS);
  return d;
}

/** The amount of THIS use that went beyond the plan's own allowance (what the credits have to cover). Usage is a running monthly total. */
export function overflowOf(before: number, after: number, planAllowance: number): number {
  if (after <= before) return 0;
  return Math.max(0, after - Math.max(before, planAllowance));
}

export interface BurnablePack {
  id: string;
  remaining: number;
  expiresAt: Date | null;
}

/** Which packs cover `amount` credit units: the ones lapsing soonest first, never an expired one. `short` is what no pack could cover. */
export function allocateBurn(packs: BurnablePack[], amount: number, now: Date): { takes: { id: string; take: number }[]; short: number } {
  let left = Math.max(0, Math.floor(amount));
  const takes: { id: string; take: number }[] = [];
  const usable = packs
    .filter((p) => p.remaining > 0 && (!p.expiresAt || p.expiresAt.getTime() > now.getTime()))
    .sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity));
  for (const p of usable) {
    if (left <= 0) break;
    const take = Math.min(p.remaining, left);
    takes.push({ id: p.id, take });
    left -= take;
  }
  return { takes, short: left };
}

/** What the Usage page shows and the buy dialog needs (serialisable). */
export interface TopupView {
  /** Why nothing can be bought right now (read-only, not billed …), or null. */
  blocked: string | null;
  gstRatePercent: number;
  services: {
    key: TopupService;
    label: string;
    noun: string;
    note: string;
    consumable: boolean;
    /** Credit units still to use (domains: slots held). */
    remaining: number;
    usedThisMonth: number;
    nextExpiry: string | null;
    packs: { id: string; units: number; label: string; net: number; gst: number; total: number; popular: boolean; currency: string }[];
  }[];
  /** Live packs, newest first. */
  active: { id: string; service: TopupService; label: string; remainingLabel: string; purchasedAt: string; expiresAt: string; invoiceId: string | null; invoiceNumber: string | null }[];
}
