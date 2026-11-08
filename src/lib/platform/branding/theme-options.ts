import "server-only";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { pickStarterPack } from "@/lib/platform/website/starter-packs";
import { getActiveThemeKey, installThemePreset, listThemes, setActiveTheme } from "@/lib/products/sitecraft-ai/theme";
import { THEME_PRESETS, getThemePreset } from "@/lib/products/sitecraft-ai/theme-presets";
import type { ThemeTokens } from "@/lib/products/sitecraft-ai/theme-shared";
import type { ThemeComponentSelections } from "@/lib/products/sitecraft-ai/component-variants";

/** One selectable theme in the workspace theme picker (setup wizard and Settings → Branding). */
export interface ThemeOption {
  key: string;
  name: string;
  category: string;
  tokens: ThemeTokens;
  components: ThemeComponentSelections;
}

/** Every theme the company can use: the ones already installed, then the rest of the built-in library. */
/** `activeKey` = the theme shown as selected; `appliedKey` = the one actually saved as live ("" when the company is still on the owner-only default and is being shown a library theme instead). */
export async function listThemeOptions(): Promise<{ options: ThemeOption[]; activeKey: string; appliedKey: string }> {
  const [installed, persistedKey] = await Promise.all([listThemes(), getActiveThemeKey()]);
  const appliedKey = persistedKey;
  const activeKey = persistedKey;
  const options: ThemeOption[] = installed
    .filter((t) => t.publishedAt)
    .map((t) => ({ key: t._id, name: t.name, category: t.presetId ? (getThemePreset(t.presetId)?.category ?? "Custom") : t.builtIn ? "Original" : "Custom", tokens: t.tokens, components: t.components ?? {} }));
  const have = new Set(options.map((o) => o.key));
  for (const p of THEME_PRESETS) if (!have.has(p.id)) options.push({ key: p.id, name: p.name, category: p.category, tokens: p.tokens, components: p.components });
  return { options, activeKey, appliedKey };
}

/** Makes `key` the company's live theme — website and every product — installing it from the library first if needed. */
export async function applyTheme(key: string, actorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (getThemePreset(key)) {
    const installed = await installThemePreset(key, actorId);
    if (!installed.ok && installed.error !== "This theme is already installed.") return installed;
  }
  return setActiveTheme(key, actorId);
}
