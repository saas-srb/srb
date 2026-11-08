/**
 * Hand-rolled parse helpers shared by every section-type definition
 * (`section-registry.ts`, `section-registry-home.ts`). Mirrors the style used
 * across the codebase — this project never uses zod.
 */

export const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const strOpt = (v: unknown, max = 2000): string | undefined => {
  const s = str(v, max);
  return s ? s : undefined;
};
export const bool = (v: unknown): boolean => v === true;
export const tone = (v: unknown): "default" | "muted" => (v === "muted" ? "muted" : "default");
export const strArr = (v: unknown, max = 12, itemMax = 200): string[] => (Array.isArray(v) ? v.map((x) => str(x, itemMax)).filter(Boolean).slice(0, max) : []);
export const numOr = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function objArr<T>(v: unknown, parseItem: (raw: unknown) => T | null, max = 24): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const item of v.slice(0, max)) {
    const parsed = parseItem(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
