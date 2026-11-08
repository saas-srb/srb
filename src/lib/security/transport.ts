import "server-only";
import { createECDH, createHash, hkdfSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { NextRequest } from "next/server";
import { transportSecret } from "@/lib/security/transport-ip";
import { b64uDecode, b64uEncode, ENVELOPE_VERSION, MAX_SKEW_MS, TRANSPORT_HEADERS as H } from "@/lib/security/transport-shared";

/**
 * Encrypted API transport (server half). The browser sends the request body inside an AES-256-GCM envelope and gets the JSON response back
 * the same way, so the Network tab, proxies and logs only ever see ciphertext. Keys are never sent anywhere:
 *
 *   - The server holds one static ECDH P-256 key, derived from a server-only secret (`API_TRANSPORT_SECRET`, else `PLATFORM_ENCRYPTION_KEY`).
 *     Only its PUBLIC half is given to pages.
 *   - Each page load, the browser makes its own throw-away ECDH key (non-extractable, in memory) and sends only its public half in a header.
 *   - Both sides derive the AES keys from the ECDH result with HKDF; nothing is stored on the server, so it works across serverless instances.
 *   - Every message has a fresh random IV and its method, path, time and (for responses) the request's IV bound in as authenticated data, so
 *     a captured message cannot be replayed later, on another route, or answered with another response.
 *
 * Honest limit: it hides the traffic from the network and from anyone reading logs or the Network tab. The signed-in person's own browser still
 * has to read the data to show it, and the query string of a GET stays in the URL.
 * Requests without the headers (webhooks, cron, OAuth returns, downloads, curl) are served as before, so third-party callers keep working.
 */

const rootSecret = transportSecret;

let cached: { ecdh: ReturnType<typeof createECDH>; pub: string } | null | undefined;
function serverKey() {
  if (cached !== undefined) return cached;
  const secret = rootSecret();
  if (!secret) return (cached = null);
  for (let i = 0; i < 8; i++) {
    const priv = Buffer.from(hkdfSync("sha256", secret, Buffer.from("selfrun-transport-ecdh"), Buffer.from(`static-key-${i}`), 32));
    const ecdh = createECDH("prime256v1");
    try {
      ecdh.setPrivateKey(priv);
      return (cached = { ecdh, pub: b64uEncode(ecdh.getPublicKey()) });
    } catch {
      /* the derived number was outside the curve's range: try the next one */
    }
  }
  return (cached = null);
}

/** The server's public key for pages, or null when transport encryption is not configured on this server. */
export function transportPublicKey(): string | null {
  return serverKey()?.pub ?? null;
}

function keysFor(clientPub: Buffer) {
  const sk = serverKey();
  if (!sk) return null;
  const shared = sk.ecdh.computeSecret(clientPub);
  const salt = Buffer.from(`selfrun-transport-${ENVELOPE_VERSION}`);
  const derive = (info: string) => Buffer.from(hkdfSync("sha256", shared, salt, Buffer.from(info), 32));
  return { c2s: derive("client-to-server"), s2c: derive("server-to-client") };
}

function seal(key: Buffer, plain: Uint8Array, aad: string, iv = randomBytes(12)) {
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  return { iv, blob: Buffer.concat([iv, ct]) };
}

function open(key: Buffer, blob: Buffer, aad: string): Buffer {
  if (blob.length < 12 + 16) throw new Error("short");
  const d = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(blob.subarray(blob.length - 16));
  return Buffer.concat([d.update(blob.subarray(12, blob.length - 16)), d.final()]);
}

// Replays are also stopped by the clock window; this makes a repeat inside it fail on this instance too.
const seen = new Map<string, number>();
function fresh(ivKey: string, now: number): boolean {
  if (seen.size > 5000) for (const [k, t] of seen) if (now - t > MAX_SKEW_MS * 2) seen.delete(k);
  if (seen.has(ivKey)) return false;
  seen.set(ivKey, now);
  return true;
}

const plainError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

type Handler = (req: NextRequest, ...rest: never[]) => unknown;

/** Wraps a route handler so requests that arrive in an envelope are opened, and its JSON reply is sealed. */
export function withTransport<F extends Handler>(handler: F): F {
  const wrapped = async (req: NextRequest, ...rest: never[]) => {
    const ek = req.headers.get(H.key);
    if (!ek) return handler(req, ...rest);

    let clientPub: Buffer;
    try {
      clientPub = Buffer.from(b64uDecode(ek));
      if (clientPub.length !== 65 || clientPub[0] !== 4) throw new Error("bad key");
    } catch {
      return plainError(400, "Bad request");
    }
    let keys: ReturnType<typeof keysFor>;
    try {
      keys = keysFor(clientPub);
    } catch {
      return plainError(400, "Bad request");
    }
    if (!keys) return handler(req, ...rest); // not configured on this server: carry on in the clear

    const now = Date.now();
    const ts = Number(req.headers.get(H.time));
    if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) return plainError(400, "Request expired. Reload the page and try again.");

    const path = new URL(req.url).pathname;
    let ivB64 = "";
    let nextReq = req;
    if (req.headers.get(H.body) === "1") {
      try {
        const env = (await req.json()) as { e?: string };
        const blob = Buffer.from(b64uDecode(String(env.e ?? "")));
        ivB64 = b64uEncode(blob.subarray(0, 12));
        if (!fresh(`${ek.slice(0, 22)}:${ivB64}`, now)) return plainError(400, "Bad request");
        const plain = open(keys.c2s, blob, `${req.method}\n${path}\n${ts}`);
        const headers = new Headers(req.headers);
        headers.delete("content-length");
        const original = req.headers.get(H.contentType);
        if (original) headers.set("content-type", original);
        else headers.delete("content-type");
        nextReq = new NextRequest(req.url, { method: req.method, headers, body: new Uint8Array(plain) });
      } catch {
        return plainError(400, "Bad request");
      }
    } else {
      ivB64 = req.headers.get(H.nonce) ?? "";
      if (!ivB64 && req.method !== "GET" && req.method !== "HEAD") return plainError(400, "Bad request");
      if (ivB64 && !fresh(`${ek.slice(0, 22)}:${ivB64}`, now)) return plainError(400, "Bad request");
    }

    const res = (await handler(nextReq, ...rest)) as Response;
    const type = res.headers.get("content-type") ?? "";
    if (!(res instanceof Response) || !/json/i.test(type)) return res; // files, streams, CSV, HTML … go out as they are
    const body = new Uint8Array(await res.arrayBuffer());
    const sealed = seal(keys.s2c, body, `${res.status}\n${ivB64}`);
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json");
    headers.set("cache-control", "no-store");
    headers.set(H.reply, "1");
    return new Response(JSON.stringify({ e: b64uEncode(sealed.blob) }), { status: res.status, statusText: res.statusText, headers });
  };
  return wrapped as unknown as F;
}

/** Stable fingerprint for diagnostics (never the key itself). */
export function transportFingerprint(): string | null {
  const k = serverKey();
  return k ? createHash("sha256").update(k.pub).digest("hex").slice(0, 8) : null;
}
