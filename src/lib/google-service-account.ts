import "server-only";
import crypto from "crypto";

/**
 * OAuth2 access tokens for a Google service account (JWT bearer grant). Shared
 * by the Indexing API notifier and the SEO product's Search Console / Analytics
 * adapters — one implementation of the signing flow for every Google API.
 */

function base64urlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export interface ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getServiceAccountToken(creds: ServiceAccountCredentials, scopes: string[]): Promise<string> {
  const cacheKey = `${creds.clientEmail}|${scopes.join(" ")}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: creds.clientEmail,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken = `${base64urlEncode(JSON.stringify(header))}.${base64urlEncode(JSON.stringify(claimSet))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  // Env-var private keys usually carry literal "\n" sequences.
  const signature = signer.sign(creds.privateKey.replace(/\\n/g, "\n"));
  const jwt = `${unsignedToken}.${base64urlEncode(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to obtain Google OAuth2 token: ${res.status} ${errText}`);
  }
  const tokenData = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache.set(cacheKey, { token: tokenData.access_token, expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000 });
  return tokenData.access_token;
}
