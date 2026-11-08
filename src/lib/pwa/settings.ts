/** A company's choices for its apps (the installable web/mobile app and the desktop apps). Client-safe: types, defaults and validation. Empty/auto values fall back to the brand and theme. */

export interface ColorChoice {
  /** `theme`: follow the company's active theme. `custom`: use `value`. */
  mode: "theme" | "custom";
  value: string;
}

export interface AppSettings {
  /** Full app name (install dialog, app switcher). Empty = the company name. */
  name: string;
  /** Name under the icon (keep it short: phones show ~12 characters). Empty = the company name. */
  shortName: string;
  /** Empty = a sentence built from the company name. */
  description: string;
  /** Status bar / window title bar colour. */
  themeColor: ColorChoice;
  /** Splash screen / app window background. */
  backgroundColor: ColorChoice;
  icon: {
    /** `logo`: the Branding logo (initials if there is none). `custom`: an image uploaded here. `initials`: the company's initials. */
    source: "logo" | "custom" | "initials";
    customUrl: string | null;
    /** Background behind the icon on phones that crop it into a circle or rounded square (adaptive icons). */
    background: ColorChoice | { mode: "white"; value: string };
  };
  /** Product key the app opens on (`workspace`, `hrms`, `messenger`, …). */
  startPage: string;
  /** Up to 4 long-press shortcuts: product keys, or `notifications`. */
  shortcuts: string[];
  display: "standalone" | "minimal-ui";
  orientation: "any" | "portrait" | "landscape";
  /** iPhone/iPad status bar over the app. */
  statusBar: "default" | "black-translucent" | "black";
  /** Show the "Install the app" banner on product pages. */
  installPrompt: boolean;
  /** The desktop apps (Windows, macOS, Linux). */
  desktop: {
    /** Defaults for each person on first start; they can change them in the tray menu. */
    closeToTray: boolean;
    launchAtLogin: boolean;
  };
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  name: "",
  shortName: "",
  description: "",
  themeColor: { mode: "theme", value: "#4338ca" },
  backgroundColor: { mode: "theme", value: "#ffffff" },
  icon: { source: "logo", customUrl: null, background: { mode: "theme", value: "#4338ca" } },
  startPage: "workspace",
  shortcuts: ["workspace", "messenger", "notifications"],
  display: "standalone",
  orientation: "any",
  statusBar: "default",
  installPrompt: true,
  desktop: { closeToTray: true, launchAtLogin: false },
};

export const MAX_SHORTCUTS = 4;
export const HEX_RE = /^#[0-9a-f]{6}$/i;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : d);

function color(v: unknown, d: ColorChoice): ColorChoice {
  const r = (v && typeof v === "object" ? v : {}) as Partial<ColorChoice>;
  return { mode: r.mode === "custom" ? "custom" : "theme", value: hex(r.value, d.value) };
}

/**
 * Validates untrusted input into a complete settings object. `panelKeys` (when given) are the products this company can
 * actually open: a start page or shortcut outside them is dropped.
 */
export function normalizeAppSettings(input: unknown, panelKeys?: readonly string[]): AppSettings {
  const d = DEFAULT_APP_SETTINGS;
  const r = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const ri = (r.icon && typeof r.icon === "object" ? r.icon : {}) as Record<string, unknown>;
  const rb = (ri.background && typeof ri.background === "object" ? ri.background : {}) as { mode?: unknown; value?: unknown };
  const rd = (r.desktop && typeof r.desktop === "object" ? r.desktop : {}) as Record<string, unknown>;
  const bgMode = rb.mode === "custom" ? "custom" : rb.mode === "white" ? "white" : "theme";
  const known = (k: string) => !panelKeys || k === "notifications" || panelKeys.includes(k);

  const shortcuts = Array.isArray(r.shortcuts) ? [...new Set((r.shortcuts as unknown[]).filter((k): k is string => typeof k === "string" && /^[a-z][a-z0-9-]{0,29}$/.test(k) && known(k)))].slice(0, MAX_SHORTCUTS) : d.shortcuts;
  const startPage = typeof r.startPage === "string" && /^[a-z][a-z0-9-]{0,29}$/.test(r.startPage) && known(r.startPage) && r.startPage !== "notifications" ? r.startPage : d.startPage;
  const customUrl = typeof ri.customUrl === "string" && ri.customUrl.startsWith("/api/platform/brand-logo/") ? ri.customUrl.slice(0, 200) : null;
  const source = oneOf(ri.source, ["logo", "custom", "initials"] as const, d.icon.source);

  return {
    name: str(r.name, 45),
    shortName: str(r.shortName, 12),
    description: str(r.description, 200),
    themeColor: color(r.themeColor, d.themeColor),
    backgroundColor: color(r.backgroundColor, d.backgroundColor),
    icon: {
      source: source === "custom" && !customUrl ? "logo" : source,
      customUrl,
      background: bgMode === "white" ? { mode: "white", value: "#ffffff" } : { mode: bgMode, value: hex(rb.value, d.icon.background.value) },
    },
    startPage,
    shortcuts,
    display: oneOf(r.display, ["standalone", "minimal-ui"] as const, d.display),
    orientation: oneOf(r.orientation, ["any", "portrait", "landscape"] as const, d.orientation),
    statusBar: oneOf(r.statusBar, ["default", "black-translucent", "black"] as const, d.statusBar),
    installPrompt: typeof r.installPrompt === "boolean" ? r.installPrompt : d.installPrompt,
    desktop: {
      closeToTray: typeof rd.closeToTray === "boolean" ? rd.closeToTray : d.desktop.closeToTray,
      launchAtLogin: typeof rd.launchAtLogin === "boolean" ? rd.launchAtLogin : d.desktop.launchAtLogin,
    },
  };
}
