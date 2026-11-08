import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing: scrypt with a per-password random salt, at the cost OWASP recommends (N=2^15, r=8, p=3). The parameters are stored with
 * every hash, so the cost can be raised later without locking anyone out, and hashes made before this existed (`salt:hash`, N=2^14, p=1)
 * still verify. `passwordNeedsRehash` says when a correct password should be hashed again at today's cost (done at sign-in).
 */
const KEYLEN = 64;
const COST = { N: 32768, r: 8, p: 3 } as const;
const LEGACY = { N: 16384, r: 8, p: 1 } as const;
/** scrypt needs 128·N·r bytes; Node refuses above `maxmem`, so leave headroom. */
const maxmem = (c: { N: number; r: number }) => 128 * c.N * c.r * 2;

const derive = (password: string, salt: string, c: { N: number; r: number; p: number }) => scryptSync(password, salt, KEYLEN, { N: c.N, r: c.r, p: c.p, maxmem: maxmem(c) });

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt}$${derive(password, salt, COST).toString("hex")}`;
}

function parse(stored: string): { c: { N: number; r: number; p: number }; salt: string; hash: string } | null {
  if (stored.startsWith("scrypt$")) {
    const [, N, r, p, salt, hash] = stored.split("$");
    const c = { N: Number(N), r: Number(r), p: Number(p) };
    // Refuse parameters that are nonsense or would make verification a way to exhaust the server.
    if (!salt || !hash || !Number.isInteger(c.N) || c.N < 1024 || c.N > 1 << 20 || (c.N & (c.N - 1)) !== 0 || c.r < 1 || c.r > 16 || c.p < 1 || c.p > 16) return null;
    return { c, salt, hash };
  }
  const [salt, hash] = stored.split(":");
  return salt && hash ? { c: LEGACY, salt, hash } : null;
}

export function verifyPassword(password: string, stored: string): boolean {
  const s = parse(stored);
  if (!s) return false;
  const expected = Buffer.from(s.hash, "hex");
  const candidate = derive(password, s.salt, s.c);
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

/** True for a hash made at a lower cost than today's (or in the old format): hash the password again once it has been verified. */
export function passwordNeedsRehash(stored: string): boolean {
  const s = parse(stored);
  return !s || s.c.N < COST.N || s.c.r < COST.r || s.c.p < COST.p;
}

/** The shortest password accepted. Length matters more than symbols: a long passphrase beats a short complicated word. */
export const MIN_PASSWORD_LENGTH = 10;
/** The longest, so a huge "password" cannot be used to make the server do heavy hashing work. */
export const MAX_PASSWORD_LENGTH = 200;
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "1234567890", "12345678910", "qwertyuiop", "qwerty12345", "qwerty123456",
  "iloveyou123", "letmein123", "welcome123", "welcome1234", "admin12345", "administrator", "abc1234567", "1q2w3e4r5t", "0123456789", "9876543210",
  "changeme123", "changeme1234", "selfrun123", "selfrun1234", "p@ssw0rd123", "password!23", "1234567890a", "a1234567890", "000000000000", "111111111111",
]);

/**
 * The rules every new password must meet, everywhere one is chosen (sign-up, invitations, change password): 10 to 200 characters, not a
 * well-known password, not one letter or digit repeated, and not the person's own email. Returns the message to show, or null when fine.
 */
export function passwordPolicyError(password: string, context: { email?: string } = {}): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return "That password is too easy to guess. Choose a longer, less common one.";
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Your password must not contain your email address.";
  return null;
}
