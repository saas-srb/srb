"use server";

import { requireViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { recordAudit } from "@/lib/products/sitecraft-ai/audit";
import {
  listThemes, getTheme, createTheme, saveDraftThemeTokens, publishTheme, deleteTheme,
  setActiveTheme, getActiveThemeKey, restoreThemeVersionToDraft, saveThemeComponents, installThemePreset, saveThemeDraft, publishThemeDraft, type ThemeTokens, type CmsThemeDoc, type Result as ThemeResult,
} from "@/lib/products/sitecraft-ai/theme";
import type { ThemeComponentSelections } from "@/lib/products/sitecraft-ai/component-variants";

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
const SESSION_EXPIRED = "Your session has expired — please sign in again.";
const NO_PERMISSION = "You don't have permission to do that.";

export async function listThemesAction(): Promise<{ themes: CmsThemeDoc[]; activeKey: string }> {
  const v = await requireViewer().catch(() => null);
  if (!v || !can(v, "VIEW")) return { themes: [], activeKey: "default" };
  const [themes, activeKey] = await Promise.all([listThemes(), getActiveThemeKey()]);
  return { themes, activeKey };
}

export async function getThemeAction(key: string): Promise<CmsThemeDoc | null> {
  const v = await requireViewer().catch(() => null);
  if (!v || !can(v, "VIEW")) return null;
  return getTheme(key).catch(() => null);
}

export async function createThemeAction(input: { key: string; name: string; description: string; cloneFromKey?: string }): Promise<Result<{ key: string }>> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "THEME_UPDATE")) return { ok: false, error: NO_PERMISSION };
  const res = await createTheme(input, v.userId);
  if (res.ok) await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "theme", entityId: res.key, entityLabel: input.name });
  return res;
}

export async function saveDraftThemeAction(key: string, tokens: ThemeTokens): Promise<Result> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "THEME_UPDATE")) return { ok: false, error: NO_PERMISSION };
  await saveDraftThemeTokens(key, tokens, v.userId);
  return { ok: true };
}

export async function publishThemeAction(key: string): Promise<Result> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "THEME_PUBLISH")) return { ok: false, error: NO_PERMISSION };
  await publishTheme(key, v.userId);
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "publish", entity: "theme", entityId: key, entityLabel: key, summary: "Published theme tokens" });
  return { ok: true };
}

export async function activateThemeAction(key: string): Promise<ThemeResult> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "THEME_PUBLISH")) return { ok: false, error: NO_PERMISSION };
  const res = await setActiveTheme(key, v.userId);
  if (res.ok) await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "publish", entity: "theme", entityId: key, entityLabel: key, summary: "Activated theme site-wide" });
  return res;
}

export async function deleteThemeAction(key: string): Promise<ThemeResult> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "THEME_PUBLISH")) return { ok: false, error: NO_PERMISSION };
  const res = await deleteTheme(key);
  if (res.ok) await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "theme", entityId: key, entityLabel: key });
  return res;
}

export async function restoreThemeVersionAction(key: string, version: number): Promise<ThemeResult<{ tokens: ThemeTokens }>> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "THEME_UPDATE")) return { ok: false, error: NO_PERMISSION };
  const res = await restoreThemeVersionToDraft(key, version, v.userId);
  if (res.ok) await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "restore", entity: "theme", entityId: key, entityLabel: key, summary: `Restored version ${version} to draft` });
  return res;
}

export async function saveThemeComponentsAction(key: string, selections: ThemeComponentSelections): Promise<ThemeResult> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "THEME_PUBLISH")) return { ok: false, error: NO_PERMISSION };
  const res = await saveThemeComponents(key, selections, v.userId);
  if (res.ok) await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "theme", entityId: key, entityLabel: key, summary: "Changed component variants" });
  return res;
}

// ── Theme library + customizer ───────────────────────────────────────────

/** Installs a library theme (optionally with the customizer's tweaks) and, if asked, activates it. */
export async function installThemePresetAction(
  presetId: string,
  opts: { tokens?: ThemeTokens; components?: ThemeComponentSelections; activate?: boolean } = {}
): Promise<ThemeResult<{ key: string }>> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "THEME_UPDATE") || (opts.activate && !can(v, "THEME_PUBLISH"))) return { ok: false, error: NO_PERMISSION };
  const res = await installThemePreset(presetId, v.userId, { tokens: opts.tokens, components: opts.components });
  if (!res.ok) return res;
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "theme", entityId: res.key, entityLabel: res.key, summary: "Installed from the theme library" });
  if (opts.activate) {
    const act = await setActiveTheme(res.key, v.userId);
    if (!act.ok) return act;
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "publish", entity: "theme", entityId: res.key, entityLabel: res.key, summary: "Activated theme site-wide" });
  }
  return res;
}

export async function saveThemeDraftAction(key: string, tokens: ThemeTokens, components: ThemeComponentSelections): Promise<ThemeResult> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "THEME_UPDATE")) return { ok: false, error: NO_PERMISSION };
  return saveThemeDraft(key, tokens, components, v.userId);
}

/** Customizer publish: saves + publishes tokens and component choices; `activate` also makes it the site's theme. */
export async function publishThemeDraftAction(key: string, tokens: ThemeTokens, components: ThemeComponentSelections, activate: boolean): Promise<ThemeResult> {
  const v = await requireViewer().catch(() => null);
  if (!v) return { ok: false, error: SESSION_EXPIRED };
  if (!can(v, "THEME_PUBLISH")) return { ok: false, error: NO_PERMISSION };
  const res = await publishThemeDraft(key, tokens, components, v.userId);
  if (!res.ok) return res;
  await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "publish", entity: "theme", entityId: key, entityLabel: key, summary: "Published from the theme customizer" });
  if (activate) {
    const act = await setActiveTheme(key, v.userId);
    if (!act.ok) return act;
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "publish", entity: "theme", entityId: key, entityLabel: key, summary: "Activated theme site-wide" });
  }
  return { ok: true };
}
