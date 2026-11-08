"use client";

import { b64uDecode, b64uEncode, ENVELOPE_VERSION, TRANSPORT_HEADERS as H } from "@/lib/security/transport-shared";

/**
 * Browser half of the encrypted API transport (see lib/security/transport.ts). It wraps `fetch` for this site's own `/api/` calls: the
 * body is sealed before it leaves the page and the JSON reply is opened again, so the code that called `fetch` sees no difference.
 * The key pair is made per page load, non-extractable and kept in memory only; the server's public key arrives as a prop.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const API = /^\/api\//;

interface Session { priv: CryptoKey; pub: string; c2s: CryptoKey; s2c: CryptoKey }
let session: Promise<Session | null> | null = null;

function start(serverPub: string): Promise<Session | null> {
  return (session ??= (async () => {
    try {
      const subtle = crypto.subtle;
      const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
      const pub = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
      const theirs = await subtle.importKey("raw", b64uDecode(serverPub) as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
      const bits = await subtle.deriveBits({ name: "ECDH", public: theirs }, pair.privateKey, 256);
      const base = await subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
      const derive = (info: string) =>
        subtle.deriveKey(
          { name: "HKDF", hash: "SHA-256", salt: enc.encode(`selfrun-transport-${ENVELOPE_VERSION}`), info: enc.encode(info) },
          base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
        );
      return { priv: pair.privateKey, pub: b64uEncode(pub), c2s: await derive("client-to-server"), s2c: await derive("server-to-client") };
    } catch {
      return null;
    }
  })());
}

async function seal(key: CryptoKey, plain: Uint8Array, aad: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, plain as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return { iv: b64uEncode(iv), blob: b64uEncode(out) };
}

const ACTION_LIMIT = 3 * 1024 * 1024;

/** A Server Action call (Next's own protocol, posted to the page): sealed and relayed through /api/secure/action, then opened again. */
async function sealAction(s: Session, url: URL, headers: Headers, body: BodyInit | null | undefined, base: Request | null, original: typeof fetch): Promise<Response | null> {
  let bytes: Uint8Array;
  const h: Record<string, string> = {};
  headers.forEach((v, k) => { h[k] = v; });
  try {
    if (body === undefined && base) body = await base.clone().blob();
    if (typeof body === "string") bytes = enc.encode(body);
    else if (body) {
      const r = new Request(url.toString(), { method: "POST", body });
      const ct = r.headers.get("content-type");
      if (ct) h["content-type"] = ct;
      bytes = new Uint8Array(await r.arrayBuffer());
    } else bytes = new Uint8Array();
  } catch {
    return null;
  }
  if (bytes.length > ACTION_LIMIT) return null;

  const ts = Date.now();
  const path = "/api/secure/action";
  const sealed = await seal(s.c2s, enc.encode(JSON.stringify({ u: url.pathname + url.search, h, b: b64uEncode(bytes) })), `POST\n${path}\n${ts}`);
  const res = await original(path, {
    method: "POST",
    headers: { "content-type": "application/json", [H.key]: s.pub, [H.time]: String(ts), [H.body]: "1", [H.contentType]: "application/json" },
    body: JSON.stringify({ e: sealed.blob }),
    credentials: "same-origin",
  });
  // From here on the action may already have run: never send it again, hand back whatever came.
  if (res.headers.get(H.reply) !== "1") return res;
  try {
    const env = (await res.clone().json()) as { e: string };
    const blob = b64uDecode(env.e);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: blob.subarray(0, 12) as BufferSource, additionalData: enc.encode(`${res.status}\n${sealed.iv}`) },
      s.s2c, blob.subarray(12) as BufferSource,
    );
    const m = JSON.parse(dec.decode(plain)) as { s: number; h: Record<string, string>; b: string };
    const out = new Headers(m.h);
    const payload = b64uDecode(m.b);
    return new Response(payload.length ? (payload as BufferSource) : null, { status: m.s, headers: out });
  } catch {
    return res;
  }
}

function install(serverPub: string) {
  const w = window as typeof window & { __transport?: boolean };
  if (w.__transport) return;
  w.__transport = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL;
    try {
      url = new URL(input instanceof Request ? input.url : String(input), location.href);
    } catch {
      return original(input, init);
    }
    const isAction = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).has("next-action");
    if (url.origin !== location.origin || (!API.test(url.pathname) && !isAction)) return original(input, init);
    const s = await start(serverPub);
    if (!s) return original(input, init);

    const base = input instanceof Request ? input : null;
    const probe = new Headers(init?.headers ?? base?.headers);
    if (probe.has("next-action") && (init?.method ?? base?.method ?? "GET").toUpperCase() === "POST") {
      const sealedAction = await sealAction(s, url, probe, init?.body, base, original);
      if (sealedAction) return sealedAction;
    }

    const method = (init?.method ?? base?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? base?.headers);
    let body: BodyInit | null | undefined = init?.body;
    if (body === undefined && base && !["GET", "HEAD"].includes(method)) {
      const type = base.headers.get("content-type") ?? "";
      body = /multipart|octet|image|audio|video/i.test(type) ? await base.clone().blob() : await base.clone().text();
    }

    const ts = Date.now();
    headers.set(H.key, s.pub);
    headers.set(H.time, String(ts));

    let ivForReply = "";
    const sealable = typeof body === "string" || body instanceof URLSearchParams;
    if (body != null && sealable) {
      const text = typeof body === "string" ? body : body.toString();
      const type = headers.get("content-type") ?? (typeof body === "string" ? "text/plain;charset=UTF-8" : "application/x-www-form-urlencoded;charset=UTF-8");
      const sealed = await seal(s.c2s, enc.encode(text), `${method}\n${url.pathname}\n${ts}`);
      ivForReply = sealed.iv;
      headers.set(H.body, "1");
      headers.set(H.contentType, type);
      headers.set("content-type", "application/json");
      body = JSON.stringify({ e: sealed.blob });
    } else {
      // GET, or a file upload (multipart bodies are sent as-is over HTTPS): only the reply is sealed.
      ivForReply = b64uEncode(crypto.getRandomValues(new Uint8Array(12)));
      headers.set(H.nonce, ivForReply);
    }

    const res = await original(url.toString(), {
      ...init, method, headers, body: body ?? undefined,
      ...(base && !init ? { signal: base.signal, credentials: base.credentials } : {}),
    });
    if (res.headers.get(H.reply) !== "1") return res;
    try {
      const env = (await res.clone().json()) as { e: string };
      const blob = b64uDecode(env.e);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: blob.subarray(0, 12) as BufferSource, additionalData: enc.encode(`${res.status}\n${ivForReply}`) },
        s.s2c, blob.subarray(12) as BufferSource,
      );
      const out = new Headers(res.headers);
      out.delete(H.reply);
      out.set("content-type", "application/json");
      return new Response(dec.decode(plain), { status: res.status, statusText: res.statusText, headers: out });
    } catch {
      return res;
    }
  };
}

export default function TransportBoot({ serverKey }: { serverKey: string | null }) {
  // Installed while rendering (idempotent) so it is in place before any child effect makes its first request.
  if (serverKey && typeof window !== "undefined" && typeof crypto !== "undefined" && crypto.subtle) install(serverKey);
  return null;
}
