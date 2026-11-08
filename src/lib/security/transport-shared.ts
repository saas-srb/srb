/** Constants and encoders shared by the browser and the server halves of the encrypted API transport (see transport.ts). */
export const ENVELOPE_VERSION = "v1";
export const MAX_SKEW_MS = 5 * 60_000;

export const TRANSPORT_HEADERS = {
  /** Browser's throw-away public key (base64url, 65 bytes). */
  key: "x-ek",
  /** Milliseconds since epoch when the request was sealed. */
  time: "x-et",
  /** "1" when the body is sealed. */
  body: "x-eb",
  /** The body's real content type. */
  contentType: "x-ect",
  /** Random value for requests that have no sealed body. */
  nonce: "x-en",
  /** "1" on a sealed reply. */
  reply: "x-enc",
} as const;

export function b64uEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
