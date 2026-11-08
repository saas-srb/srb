/** Product-screen style per module (the fallback illustration when no real screenshot exists). One colour for all: the products' primary. */
export type ScreenKind = "kanban" | "table" | "dashboard" | "chat" | "calendar" | "document" | "builder" | "flow" | "vault" | "ai" | "timeline" | "social" | "rank" | "test" | "course" | "portal";

export const PANEL_STYLE: Record<string, { color: string; screen: ScreenKind }> = {
  lms: { color: "#4338ca", screen: "kanban" },
  hrms: { color: "#4338ca", screen: "table" },
  fms: { color: "#4338ca", screen: "dashboard" },
  pms: { color: "#4338ca", screen: "timeline" },
  prms: { color: "#4338ca", screen: "flow" },
  tms: { color: "#4338ca", screen: "course" },
  messenger: { color: "#4338ca", screen: "chat" },
  sop: { color: "#4338ca", screen: "document" },
  lpms: { color: "#4338ca", screen: "document" },
  dlms: { color: "#4338ca", screen: "vault" },
  ots: { color: "#4338ca", screen: "test" },
  aibots: { color: "#4338ca", screen: "chat" },
  intelligence: { color: "#4338ca", screen: "ai" },
  smms: { color: "#4338ca", screen: "social" },
  seo: { color: "#4338ca", screen: "rank" },
  cms: { color: "#4338ca", screen: "builder" },
  website: { color: "#4338ca", screen: "builder" },
  portal: { color: "#4338ca", screen: "portal" },
  support: { color: "#4338ca", screen: "chat" },
  workspace: { color: "#4338ca", screen: "dashboard" },
};

export const panelColor = (key: string) => PANEL_STYLE[key]?.color ?? "#4f46e5";
