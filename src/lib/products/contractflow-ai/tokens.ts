import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Signer link tokens. 32 random bytes (256 bits) from the system's CSPRNG, shown to the signer once in their link and stored only as a
 * SHA-256 hash. The token is high-entropy random, so a plain hash is the right tool (nothing to brute-force); it cannot be guessed, listed or
 * recovered from the database.
 */
export const TOKEN_BYTES = 32;
/** base64url of 32 bytes is exactly 43 characters. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export const isWellFormedToken = (token: unknown): token is string => typeof token === "string" && TOKEN_PATTERN.test(token);
