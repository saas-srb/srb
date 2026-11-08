import { createHmac, timingSafeEqual } from "node:crypto";

const DEV_SECRET = "selfrun-dev-transport-secret-not-for-production";

/** The server-only secret behind the encrypted transport, or null when none is configured in production. */
export function transportSecret(): Buffer | null {
  const raw = process.env.API_TRANSPORT_SECRET || process.env.PLATFORM_ENCRYPTION_KEY;
  if (!raw) return process.env.NODE_ENV === "production" ? null : Buffer.from(DEV_SECRET);
  return Buffer.from(raw, "utf8");
}

const sign = (secret: Buffer, ip: string, ts: string) => createHmac("sha256", secret).update(`transport-ip|${ip}|${ts}`).digest("base64url");

/**
 * When the server forwards a person's Server Action to its own page (see api/secure/action), the hosting platform sees the server as the
 * caller. This header carries the real address, signed so nobody else can set it, so rate limits and bans keep working per person.
 */
export function signedClientIp(ip: string): string | null {
  const secret = transportSecret();
  if (!secret) return null;
  const ts = String(Date.now());
  return `${ip}~${ts}~${sign(secret, ip, ts)}`;
}

export function verifiedClientIp(value: string | null): string | null {
  if (!value) return null;
  const [ip, ts, sig] = value.split("~");
  const secret = transportSecret();
  if (!secret || !ip || !ts || !sig || Math.abs(Date.now() - Number(ts)) > 60_000) return null;
  const want = Buffer.from(sign(secret, ip, ts));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? ip.slice(0, 64) : null;
}
