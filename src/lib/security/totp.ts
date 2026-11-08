import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Time-based one-time passwords (RFC 6238: HMAC-SHA1, 30 seconds, 6 digits) — what Google Authenticator, Microsoft Authenticator, Authy and 1Password read. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.toUpperCase().replace(/[\s=-]/g, "")) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Not a base32 secret.");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The code for one 30-second step (`step` = Unix seconds ÷ 30). */
export function totpAtStep(secret: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/**
 * The step a submitted code belongs to (this one, or one either side to allow for clock drift), or null. A step at or before `lastStep` is
 * refused, so one code cannot be used twice.
 */
export function verifyTotp(secret: string, code: string, lastStep = 0, now = Date.now()): number | null {
  const clean = String(code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = Math.floor(now / 1000 / TOTP_PERIOD);
  for (const step of [current, current - 1, current + 1]) {
    if (step <= lastStep) continue;
    const want = Buffer.from(totpAtStep(secret, step));
    const got = Buffer.from(clean);
    if (want.length === got.length && timingSafeEqual(want, got)) return step;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_PERIOD}`;
}
