import { cmsEvents } from "@/lib/notify/triggers/cms";
import "server-only";
import { companyCache } from "@/lib/platform/tenancy/cache";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, CMS_SITE_TAG, expireSiteCache, createStamp, updateStamp } from "@/lib/products/sitecraft-ai/db";
import { normalizeSelections, type ThemeComponentSelections } from "@/lib/products/sitecraft-ai/component-variants";
import { FALLBACK_THEME, sanitizeTokens, type ThemeTokens } from "@/lib/products/sitecraft-ai/theme-shared";
import { getThemePreset } from "@/lib/products/sitecraft-ai/theme-presets";
import { unstable_rethrow } from "next/navigation";

export {
  FALLBACK_THEME, themeCssBlock, themeCssVars, sanitizeTokens,
  type ThemeTokens, type ThemeColorTokens, type ThemeTypography, type ThemeBrand,
} from "@/lib/products/sitecraft-ai/theme-shared";

/**
 * The theme engine: CMS-editable design tokens replacing the hardcoded
 * values in `globals.css`'s `:root`/`.dark` blocks. Server-rendered inline
 * `<style>` override (see `(site)/layout.tsx`) rather than build-time
 * regeneration — consistent with this codebase's runtime-DB-read +
 * `unstable_cache`/`revalidateTag` architecture everywhere else.
 *
 * Phase 2: multiple themes can exist; exactly one is "active" at a time
 * (`cms_settings.activeThemeKey`, a single global pointer — deliberately its
 * own minimal doc/field, not folded into `CmsSettings` in settings.ts, so
 * activation is one atomic field update independent of the settings form).
 * The seeded `"default"` theme (`builtIn: true`) IS "Current Website /
 * Default Theme" — its tokens are copied verbatim from today's `globals.css`
 * and it starts already active, so nothing visually changes until an admin
 * explicitly activates a different theme.
 */
export interface CmsThemeDoc {
  _id: string; // slug, e.g. "default", "ai-technology"
  name: string;
  description: string;
  builtIn: boolean;
  tokens: ThemeTokens;
  draftTokens: ThemeTokens;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  /** Published token snapshots, oldest first, capped at THEME_HISTORY_LIMIT — kept on the theme doc rather than a separate collection (Atlas's collection-count limit). */
  history?: ThemeHistoryEntry[];
  /**
   * Which header/footer/section component variant this theme uses (see
   * component-variants.ts). Applied as soon as it's saved, like the theme's
   * page arrangements — the theme being active or not is what gates the
   * public site.
   */
  components?: ThemeComponentSelections;
  /** Component choices saved from the customizer but not yet published (publishing copies them to `components`). */
  draftComponents?: ThemeComponentSelections;
  /** Set when the theme was installed from the built-in theme library (theme-presets.ts). */
  presetId?: string;
}

export interface ThemeHistoryEntry {
  version: number;
  tokens: ThemeTokens;
  publishedAt: Date;
  publishedBy: string | null;
  note: string;
}

const THEME_HISTORY_LIMIT = 20;

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const DEFAULT_THEME_KEY = "default";

async function col() {
  const db = await getDb();
  return db.collection<CmsThemeDoc>(COLLECTIONS.theme);
}

async function settingsCol() {
  const db = await getDb();
  return db.collection<{ _id: string; activeThemeKey?: string }>(COLLECTIONS.settings);
}

const DEFAULT_THEME_META = {
  name: "Current Website / Default",
  description: "The existing website's real, unchanged design — the baseline every other theme is optional on top of.",
};

/**
 * Phase 1 stored the (only) theme as a `_id:"default"` singleton without
 * `name`/`description`/`builtIn`. Backfill those on read rather than
 * requiring a re-seed, so an upgraded database still lists correctly.
 */
function normalize(doc: CmsThemeDoc): CmsThemeDoc {
  if (doc._id !== DEFAULT_THEME_KEY) return doc;
  return { ...doc, name: doc.name || DEFAULT_THEME_META.name, description: doc.description ?? DEFAULT_THEME_META.description, builtIn: true };
}

export async function listThemes(): Promise<CmsThemeDoc[]> {
  const c = await col();
  const all = await c.find({}, { sort: { createdAt: 1 } }).toArray();
  if (all.length > 0) {
    // Default first, regardless of creation order.
    return all.map(normalize).sort((a, b) => (a._id === DEFAULT_THEME_KEY ? -1 : b._id === DEFAULT_THEME_KEY ? 1 : 0));
  }
  // First-ever read: seed the default theme so the list is never empty.
  return [await getTheme(DEFAULT_THEME_KEY)];
}

export async function getTheme(key: string): Promise<CmsThemeDoc> {
  const c = await col();
  const doc = await c.findOne({ _id: key });
  if (doc) return normalize(doc);
  if (key !== DEFAULT_THEME_KEY) throw new Error("Theme not found.");
  const fresh: CmsThemeDoc = {
    _id: DEFAULT_THEME_KEY,
    ...DEFAULT_THEME_META,
    builtIn: true,
    tokens: FALLBACK_THEME,
    draftTokens: FALLBACK_THEME,
    publishedAt: new Date(),
    ...createStamp(null),
  };
  await c.insertOne(fresh);
  return fresh;
}

export async function createTheme(
  input: { key: string; name: string; description: string; cloneFromKey?: string },
  actorId: string
): Promise<Result<{ key: string }>> {
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!key) return { ok: false, error: "Choose a valid theme key." };
  const c = await col();
  const existing = await c.findOne({ _id: key });
  if (existing) return { ok: false, error: "A theme with this key already exists." };

  const source = input.cloneFromKey ? await getTheme(input.cloneFromKey) : null;
  const tokens = source?.tokens ?? FALLBACK_THEME;
  const doc: CmsThemeDoc = {
    _id: key,
    name: input.name.trim() || key,
    description: input.description.trim(),
    builtIn: false,
    tokens,
    draftTokens: tokens,
    ...(source?.components ? { components: source.components, draftComponents: source.components } : {}),
    publishedAt: new Date(),
    ...createStamp(actorId),
  };
  await c.insertOne(doc);
  return { ok: true, key };
}

export async function saveDraftThemeTokens(key: string, tokens: ThemeTokens, actorId: string): Promise<void> {
  const c = await col();
  await c.updateOne({ _id: key }, { $set: { draftTokens: sanitizeTokens(tokens), ...updateStamp(actorId) } }, { upsert: true });
}

export async function publishTheme(key: string, actorId: string): Promise<ThemeTokens> {
  const doc = await getTheme(key);
  const c = await col();
  const now = new Date();
  const history = doc.history ?? [];
  const entries: ThemeHistoryEntry[] = [];
  // First recorded publish: snapshot what was live before it too, so the very first change is also restorable.
  if (history.length === 0) {
    entries.push({ version: 1, tokens: doc.tokens, publishedAt: doc.publishedAt ?? doc.createdAt, publishedBy: null, note: "Before first recorded publish" });
  }
  const lastVersion = entries.at(-1)?.version ?? history.at(-1)?.version ?? 0;
  entries.push({ version: lastVersion + 1, tokens: doc.draftTokens, publishedAt: now, publishedBy: actorId, note: "Published" });
  await c.updateOne(
    { _id: key },
    {
      $set: { tokens: doc.draftTokens, publishedAt: now, ...updateStamp(actorId) },
      $push: { history: { $each: entries, $slice: -THEME_HISTORY_LIMIT } },
    }
  );
  expireSiteCache();
  return doc.draftTokens;
}

/** Newest first. */
export async function listThemeHistory(key: string): Promise<ThemeHistoryEntry[]> {
  const doc = await getTheme(key);
  return [...(doc.history ?? [])].reverse();
}

/**
 * Loads a past published version into the theme's draft — like page
 * version restore, it never touches the live tokens; publishing the draft
 * is what makes it live again (and records that as a new version).
 */
export async function restoreThemeVersionToDraft(key: string, version: number, actorId: string): Promise<Result<{ tokens: ThemeTokens }>> {
  const doc = await getTheme(key).catch(() => null);
  if (!doc) return { ok: false, error: "Theme not found." };
  const entry = doc.history?.find((h) => h.version === version);
  if (!entry) return { ok: false, error: "That version no longer exists." };
  const c = await col();
  await c.updateOne({ _id: key }, { $set: { draftTokens: entry.tokens, ...updateStamp(actorId) } });
  return { ok: true, tokens: entry.tokens };
}

export async function deleteTheme(key: string): Promise<Result> {
  if (key === DEFAULT_THEME_KEY) return { ok: false, error: "The default theme can't be deleted." };
  const theme = await getTheme(key).catch(() => null);
  if (theme?.builtIn) return { ok: false, error: "Built-in themes can't be deleted." };
  const activeKey = await getActiveThemeKey();
  if (activeKey === key) return { ok: false, error: "Can't delete the currently active theme — activate another theme first." };
  const c = await col();
  await c.deleteOne({ _id: key });
  return { ok: true };
}

// ── Active theme ─────────────────────────────────────────────────────────

async function loadActiveThemeKey(): Promise<string> {
  const c = await settingsCol();
  const doc = await c.findOne({ _id: "default" }, { projection: { activeThemeKey: 1 } });
  return doc?.activeThemeKey || DEFAULT_THEME_KEY;
}

const cachedActiveThemeKey = companyCache(loadActiveThemeKey, ["cms-active-theme-key-v1"], { tags: [CMS_SITE_TAG], revalidate: 3600 });

export async function getActiveThemeKey(): Promise<string> {
  try {
    return await cachedActiveThemeKey();
  } catch (err) {
    unstable_rethrow(err);
    console.error("[cms] active theme key unavailable, using default", err);
    return DEFAULT_THEME_KEY;
  }
}

export async function setActiveTheme(key: string, actorId: string): Promise<Result> {
  const theme = await getTheme(key).catch(() => null);
  if (!theme) return { ok: false, error: "Theme not found." };
  if (!theme.publishedAt) return { ok: false, error: "Publish this theme's tokens before activating it." };
  const c = await settingsCol();
  await c.updateOne({ _id: "default" }, { $set: { activeThemeKey: key, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true });
  expireSiteCache();
  await cmsEvents.themeChanged("activated", theme.name ?? key, actorId);
  return { ok: true };
}

async function loadActiveTheme(): Promise<{ tokens: ThemeTokens; components: Required<ThemeComponentSelections> }> {
  const key = await loadActiveThemeKey();
  const doc = await getTheme(key).catch(() => null);
  return { tokens: doc?.tokens ?? FALLBACK_THEME, components: normalizeSelections(doc?.components) };
}

const cachedTheme = companyCache(loadActiveTheme, ["cms-theme-v2"], { tags: [CMS_SITE_TAG], revalidate: 3600 });

/** Tokens of the currently active theme (same external signature `(site)/layout.tsx` already calls). */
export async function getActiveTheme(): Promise<ThemeTokens> {
  return (await getActiveThemeState()).tokens;
}

/** Tokens + component-variant choices of the active theme; fails soft to the default site. */
export async function getActiveThemeState(): Promise<{ tokens: ThemeTokens; components: Required<ThemeComponentSelections> }> {
  try {
    return await cachedTheme();
  } catch (err) {
    unstable_rethrow(err);
    console.error("[cms] theme unavailable, using code-defined fallback", err);
    return { tokens: FALLBACK_THEME, components: normalizeSelections(null) };
  }
}

export async function saveThemeComponents(key: string, selections: ThemeComponentSelections, actorId: string): Promise<Result> {
  const theme = await getTheme(key).catch(() => null);
  if (!theme) return { ok: false, error: "Theme not found." };
  const c = await col();
  await c.updateOne({ _id: key }, { $set: { components: normalizeSelections(selections), draftComponents: normalizeSelections(selections), ...updateStamp(actorId) } });
  expireSiteCache();
  return { ok: true };
}

// ── Theme library + customizer ───────────────────────────────────────────

/**
 * Installs a theme from the built-in library as a normal, editable theme doc
 * (key = the preset's id). `tokens`/`components` let the customizer install
 * the preset with the tweaks the admin already made while previewing it.
 */
export async function installThemePreset(
  presetId: string,
  actorId: string,
  overrides?: { tokens?: ThemeTokens; components?: ThemeComponentSelections }
): Promise<Result<{ key: string }>> {
  const preset = getThemePreset(presetId);
  if (!preset) return { ok: false, error: "That theme isn't in the library." };
  const c = await col();
  if (await c.findOne({ _id: preset.id })) return { ok: false, error: "This theme is already installed." };
  const tokens = overrides?.tokens ? sanitizeTokens(overrides.tokens) : preset.tokens;
  const components = normalizeSelections(overrides?.components ?? preset.components);
  const now = new Date();
  await c.insertOne({
    _id: preset.id,
    name: preset.name,
    description: preset.description,
    builtIn: false,
    presetId: preset.id,
    tokens,
    draftTokens: tokens,
    components,
    draftComponents: components,
    publishedAt: now,
    history: [{ version: 1, tokens, publishedAt: now, publishedBy: actorId, note: "Installed from the theme library" }],
    ...createStamp(actorId),
  });
  return { ok: true, key: preset.id };
}

/** Customizer "Save draft": tokens and component choices, neither of them live yet. */
export async function saveThemeDraft(key: string, tokens: ThemeTokens, components: ThemeComponentSelections, actorId: string): Promise<Result> {
  const theme = await getTheme(key).catch(() => null);
  if (!theme) return { ok: false, error: "Theme not found." };
  const c = await col();
  await c.updateOne({ _id: key }, { $set: { draftTokens: sanitizeTokens(tokens), draftComponents: normalizeSelections(components), ...updateStamp(actorId) } });
  return { ok: true };
}

/** Customizer "Publish": saves the draft, then makes the tokens and component choices the theme's published version. */
export async function publishThemeDraft(key: string, tokens: ThemeTokens, components: ThemeComponentSelections, actorId: string): Promise<Result> {
  const saved = await saveThemeDraft(key, tokens, components, actorId);
  if (!saved.ok) return saved;
  await publishTheme(key, actorId);
  return saveThemeComponents(key, components, actorId);
}
