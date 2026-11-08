import { timingSafeEqual } from "node:crypto";

/** True when the request carries `Authorization: Bearer <secret>` — compared in constant time. A missing/empty secret never matches. */
export function hasBearer(req: Request, secret: string | undefined | null): boolean {
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
