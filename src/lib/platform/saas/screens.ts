import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Real, full-resolution captures of the product's screens (2560×1600 WebP), taken in a demo workspace and stored in
 * /public/selfrun/screens/<key>.webp. A key without a capture falls back to the drawn illustration.
 */
const DIR = path.join(process.cwd(), "public", "selfrun", "screens");
/** Products that share a screen with another one. */
const ALIAS: Record<string, string> = { website: "cms" };

function available(): Set<string> {
  try {
    return new Set(fs.readdirSync(DIR).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)));
  } catch {
    return new Set();
  }
}

export function screenFor(key: string): string | null {
  const have = available();
  const k = have.has(key) ? key : ALIAS[key];
  return k && have.has(k) ? `/selfrun/screens/${k}.webp` : null;
}

/** The same screen composited onto a laptop in a photograph: /public/selfrun/marketing/<key>.webp */
export function marketingFor(key: string): string | null {
  try {
    const dir = path.join(process.cwd(), "public", "selfrun", "marketing");
    const have = new Set(fs.readdirSync(dir).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)));
    const k = have.has(key) ? key : ALIAS[key];
    return k && have.has(k) ? `/selfrun/marketing/${k}.webp` : null;
  } catch {
    return null;
  }
}

/** The page's own hero artwork (generated from the real product screens by scripts/hero-art.mjs): /public/selfrun/hero/<id>.webp */
export function heroFor(id: string): string | null {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", "selfrun", "hero", `${id}.webp`)) ? `/selfrun/hero/${id}.webp` : null;
  } catch {
    return null;
  }
}
