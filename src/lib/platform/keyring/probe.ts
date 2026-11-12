import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { keyId, type Probe } from "@/lib/platform/keyring/core";

/** Pure: turns ciphertext found in the database into a `Probe` the keyring decision can use. */

export interface Sealed {
  c: string;
  iv: string;
  t: string;
  k?: string;
}

export interface CipherSample {
  enc: Sealed;
  /** The context the value was sealed with (additional authenticated data). Always present for a testable sample. */
  aad: string;
  /** Where it was found (for the Console: "admin_users.twoFactor.secret"). */
  where: string;
  /** The platform helper that wrote it: sealed directly with the root key. */
}

/** Ciphertext of unknown context (found by shape only). It can only ever show that a key DOES open something, never that none does. */
export interface ShapeSample {
  enc: Sealed;
  where: string;
}

export const PRODUCT_PURPOSES = ["hrms", "fms", "dlms", "smms"] as const;

function open(key: Buffer, enc: Sealed, aad: string | null): boolean {
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(enc.iv, "base64"));
    if (aad !== null) d.setAAD(Buffer.from(aad));
    d.setAuthTag(Buffer.from(enc.t, "base64"));
    d.update(Buffer.from(enc.c, "base64"));
    d.final();
    return true;
  } catch {
    return false;
  }
}

/** Does this root key open the sample? */
export function opensSample(root: Buffer, s: CipherSample): boolean {
  if (s.enc.k && s.enc.k !== keyId(root)) return false;
  return open(root, s.enc, s.aad);
}

/** Does this root key (or a product key derived from it) open a shape-only sample? Tries no-context and the product derivations. */
export function opensShape(root: Buffer, s: ShapeSample): boolean {
  if (open(root, s.enc, null)) return true;
  return PRODUCT_PURPOSES.some((p) => open(Buffer.from(hkdfSync("sha256", root, Buffer.alloc(0), `selfrun:${p}`, 32)), s.enc, null));
}

export function makeProbe(samples: CipherSample[], shapes: ShapeSample[] = []): Probe {
  return {
    testable: samples.length,
    opens(key, excludeSelf = false) {
      const self = excludeSelf ? keyId(key) : "\0";
      let n = 0;
      for (const s of samples) if (s.enc.k !== self && opensSample(key, s)) n++;
      // Shape-only evidence (unknown context) can only count FOR a key.
      for (const s of shapes) if (s.enc.k !== self && opensShape(key, s)) n++;
      return n;
    },
    unopenable(keys) {
      return samples.filter((s) => !keys.some((k) => opensSample(k, s))).length;
    },
  };
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** The `{c, iv, t}` shape every sealed value in the database has. */
export function isSealedShape(v: unknown): v is Sealed {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o === "object" && typeof o.c === "string" && typeof o.iv === "string" && typeof o.t === "string" && o.iv.length === 16 && o.t.length === 24 && B64.test(o.iv) && B64.test(o.t) && B64.test(o.c);
}

/** Finds sealed values anywhere inside a document (depth-limited). */
export function findSealed(doc: unknown, path = "", depth = 0, out: { path: string; enc: Sealed }[] = []): { path: string; enc: Sealed }[] {
  if (depth > 6 || doc === null || typeof doc !== "object" || doc instanceof Date) return out;
  if (isSealedShape(doc)) {
    out.push({ path, enc: doc });
    return out;
  }
  for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
    if (k === "_id") continue;
    findSealed(v, path ? `${path}.${k}` : k, depth + 1, out);
    if (out.length > 5000) break;
  }
  return out;
}

/** Opens a sample with whichever key opens it and seals it again with `active` (same context). Null when no key opens it or it already uses `active`. */
export function resealSample(s: CipherSample, keys: Buffer[], active: Buffer): Sealed | null {
  const activeId = keyId(active);
  if (s.enc.k === activeId) return null;
  for (const key of keys) {
    if (s.enc.k && s.enc.k !== keyId(key)) continue;
    try {
      const d = createDecipheriv("aes-256-gcm", key, Buffer.from(s.enc.iv, "base64"));
      d.setAAD(Buffer.from(s.aad));
      d.setAuthTag(Buffer.from(s.enc.t, "base64"));
      const plain = Buffer.concat([d.update(Buffer.from(s.enc.c, "base64")), d.final()]);
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", active, iv);
      c.setAAD(Buffer.from(s.aad));
      const ct = Buffer.concat([c.update(plain), c.final()]);
      return { c: ct.toString("base64"), iv: iv.toString("base64"), t: c.getAuthTag().toString("base64"), k: activeId };
    } catch {
      /* try the next key */
    }
  }
  return null;
}
