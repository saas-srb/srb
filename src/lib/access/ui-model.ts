import "server-only";
import { PERMISSION_GROUPS } from "@/lib/products/commandos/permission-catalog";
import { CATALOGUE, PRODUCTS, productName, isAccessGate } from "./catalogue";
import { areaOf } from "./areas";
import { accessToLegacy, baselineFeatures, completeAccess } from "./adapter";
import { legacyAnswers } from "./legacy";
import { FILE_ROLES } from "./catalogue";
import type { Level } from "./types";
import { isFinished, microOf } from "./micro";
import { baselineMicros } from "./micro/derive";

/** What the People & Access screen needs about the catalogue, as plain JSON (the legacy role files stay on the server). */
export interface UiFeature { key: string; label: string; description: string; needs: Level; area: string; /** micro level: what kind of thing it guards, and the scope variant (all = everyone's) */ kind?: string; scope?: "all" | "team" }
export interface UiProduct { key: string; name: string; features: UiFeature[]; baseline: string[] }
/** What the quick buttons of a product pick. `read` is every view feature; for a product whose lowest role carries more, it is the next level up (`extras`). */
export interface UiPreset { read: string[]; readLabel: string; readExtras: string[]; readCarried: string[]; write: string[] }
export interface AccessUiModel { products: UiProduct[]; baselineByProduct: Record<string, string[]>; workspaceProduct: string; presets: Record<string, UiPreset> }

const text = new Map<string, { label: string; description: string }>();
for (const g of PERMISSION_GROUPS) for (const p of g.permissions) text.set(p.key, { label: p.label, description: p.description });

const humanize = (s: string) => s.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/^./, (c) => c.toUpperCase());

let cached: AccessUiModel | null = null;

const exact = (product: string, picks: string[], carried: string[]) => {
  const map: Record<string, Record<string, "read" | "write">> = { [product]: {} };
  for (const k of picks) { const e = CATALOGUE.find((x) => x.key === k)!; map[product][k] = e.level; }
  for (const k of carried) map[product][k] = "read";
  const d = accessToLegacy(completeAccess(map));
  return d.widened.length === 0 && d.withheld.length === 0;
};

function presetFor(product: string): UiPreset {
  if (isFinished(product)) {
    const m = microOf(product);
    return { read: m.filter((x) => x.level === "read" && !x.scope).map((x) => x.key), readLabel: "Read only", readExtras: [], readCarried: [], write: m.map((x) => x.key) };
  }
  const entries = CATALOGUE.filter((e) => e.product === product && e.kind !== "tier");
  const write = entries.map((e) => e.key);
  const read = entries.filter((e) => e.level === "read").map((e) => e.key);
  if (exact(product, read, [])) return { read, readLabel: "Read only", readExtras: [], readCarried: [], write };
  // The lowest role that bundles more than the view features: the next level up (owner decision for AgentOS and EvalIQ).
  const roles = [...new Set(CATALOGUE.filter((e) => e.product === product).flatMap((e) => FILE_ROLES[e.source] ?? []))].filter((r) => r !== "super_admin");
  const ranked = roles
    .map((r) => { const a = legacyAnswers({ roles: [r], permissionOverrides: null }); return { r, keys: CATALOGUE.filter((e) => e.product === product && a[e.key]) }; })
    .sort((x, y) => x.keys.length - y.keys.length);
  for (const { keys } of ranked) {
    const picks = keys.filter((e) => e.kind !== "tier").map((e) => e.key);
    const carried = keys.filter((e) => e.kind === "tier" && !isAccessGate(e.fn)).map((e) => e.key);
    if (read.every((k) => picks.includes(k)) && exact(product, picks, carried)) {
      return { read: picks, readLabel: "Read only (view and reports)", readExtras: picks.filter((k) => !read.includes(k)).map((k) => CATALOGUE.find((e) => e.key === k)!.label), readCarried: carried, write };
    }
  }
  return { read, readLabel: "Read only", readExtras: [], readCarried: [], write };
}

/** Every product with its grantable features (entry gates are derived, never picked), grouped by area. */
export function buildAccessUi(): AccessUiModel {
  if (cached) return cached;
  const baselineByProduct: Record<string, string[]> = {};
  const products: UiProduct[] = PRODUCTS.filter((p) => p !== "commandos").concat(["commandos"]).map((key) => {
    if (isFinished(key)) {
      const micro = microOf(key);
      baselineByProduct[key] = baselineMicros(key).map((m) => m.key);
      const mf = micro.map((m) => ({ key: m.key, label: m.label, description: m.description, needs: m.level, area: m.module, kind: m.kind, ...(m.scope ? { scope: m.scope } : {}) }));
      return { key, name: productName(key), features: mf, baseline: baselineByProduct[key] };
    }
    baselineByProduct[key] = baselineFeatures(key);
    const features = CATALOGUE.filter((e) => e.product === key && e.kind !== "tier").map((e) => {
      const t = e.overrideKey ? text.get(e.overrideKey) : undefined;
      return { key: e.key, label: t?.label ?? e.label ?? humanize(e.perm ?? e.fn), description: t?.description ?? e.description ?? "", needs: e.level, area: areaOf(e) };
    });
    features.sort((a, b) => a.area.localeCompare(b.area) || a.label.localeCompare(b.label));
    return { key, name: productName(key), features, baseline: baselineByProduct[key] };
  });
  const presets: Record<string, UiPreset> = {};
  for (const p of products) presets[p.key] = presetFor(p.key);
  cached = { products, baselineByProduct, workspaceProduct: "commandos", presets };
  return cached;
}
