/**
 * Phone numbers: E.164 validation, the calling-code allow list and the masked forms we show. Pure (client-safe).
 * No country database is baked in: a company lists the calling codes it may call (for example "+91"), see settings.ts.
 */

export const E164 = /^\+[1-9]\d{6,14}$/;

/** "+91 98765-43210" / "0091 98765 43210" -> "+919876543210", or null when it can't be a full international number. */
export function normalizeE164(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim();
  if (!s || s.length > 40) return null;
  if (/[^\d+\s().-]/.test(s)) return null;
  s = s.replace(/[\s().-]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.indexOf("+") > 0 || (s.match(/\+/g)?.length ?? 0) > 1) return null;
  return E164.test(s) ? s : null;
}

/** "+91" style codes: 1-4 digits after the plus. */
export const CALLING_CODE = /^\+[1-9]\d{0,3}$/;

export function normalizeCallingCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const s = item.trim().replace(/\s+/g, "");
    const code = s.startsWith("00") ? `+${s.slice(2)}` : s.startsWith("+") ? s : `+${s}`;
    if (CALLING_CODE.test(code)) out.add(code);
  }
  return [...out].slice(0, 30);
}

/** True when the number starts with one of the allowed calling codes. */
export function inAllowedCodes(e164: string, codes: readonly string[]): boolean {
  return codes.some((c) => e164.startsWith(c));
}

export const last4Of = (e164: string) => e164.slice(-4);

/** "+91••••••3210": for lists and logs. */
export function maskPhone(e164: string): string {
  return e164.length <= 6 ? "••••" : `${e164.slice(0, 3)}${"•".repeat(Math.max(e164.length - 7, 2))}${e164.slice(-4)}`;
}

/**
 * Masks every phone-number-looking run of digits in free text (a provider's error message, a log line): "+919876543210" and
 * "98765 43210" become "+91••••3210"-style. Used before provider text is stored or logged. Pure.
 */
export function maskPhonesInText(text: string): string {
  return text.replace(/\+?\d[\d\s().-]{5,}\d/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 7) return m;
    return `${m.startsWith("+") ? "+" : ""}${digits.slice(0, m.startsWith("+") ? 2 : 0)}••••${digits.slice(-4)}`;
  });
}

/** A URL with the secret `t` / `token` query values replaced, for logs. */
export function redactUrlSecrets(url: string): string {
  return url.replace(/([?&](?:t|token|joinToken|s|e)=)[^&#\s]+/gi, "$1[redacted]");
}

/** An error (or anything) as one safe log line: phone numbers masked and URL secrets (`?t=` tokens) redacted. */
export function logText(e: unknown): string {
  return redactUrlSecrets(maskPhonesInText(e instanceof Error ? e.message : String(e)));
}
