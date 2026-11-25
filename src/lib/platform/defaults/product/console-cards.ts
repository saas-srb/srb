import { PRODUCT_SPECS } from "@/lib/platform/defaults/product/specs";
import { allSettings } from "@/lib/platform/defaults/product/model";
import type { SettingsCardData, SettingsCategory } from "@/components/settings/model";

/** The cards of Platform Console → Product settings (pure: the page, the harness and the tests build the same ones). One card per product. */
export const PRODUCT_DEFAULTS_PATH = "/console/product-settings";

export const PRODUCT_DEFAULT_CATEGORIES: SettingsCategory[] = [
  { key: "workspace", title: "Workspace", description: "Company-wide settings." },
  { key: "people", title: "People", description: "Attendance and pay." },
  { key: "finance", title: "Finance", description: "Payments, tax and purchasing." },
  { key: "delivery", title: "Projects and delivery" },
  { key: "learning", title: "Learning and assessment" },
  { key: "ai", title: "AI and documents" },
  { key: "marketing", title: "Marketing and website" },
  { key: "security", title: "Security and legal" },
];

/** A product with nothing the platform may default: the card says which, and why. */
export interface NoDefaultCard { key: string; name: string; category: string; state: "company-only"; note: string; links?: { href: string; label: string }[] }

export const NO_DEFAULT_CARDS: NoDefaultCard[] = [
  { key: "workspace", name: "Workspace", category: "workspace", state: "company-only", note: "Company identity is never a default. The two platform-wide Workspace defaults already have their own screens: the sign-in second step (a company can be given its own) and the starting language, currency and time zone of new companies.", links: [{ href: "/console/health", label: "Sign-in second step" }, { href: "/console/settings", label: "New company defaults" }] },
  { key: "contractflow-ai", name: "ContractFlow", category: "security", state: "company-only", note: "Its only setting is the company's own India SMS (DLT) registration. Stamp duty values are the platform rulebook.", links: [{ href: "/console/stamp-rulebook", label: "Stamp rulebook" }] },
  { key: "sitecraft-ai", name: "SiteCraft", category: "marketing", state: "company-only", note: "Maintenance mode, the share image, the legal name, the site identity and tracking all describe one company's own website." },
  { key: "huddle-ai", name: "Huddle", category: "workspace", state: "company-only", note: "Its settings belong to each person (display name, sounds, presence), not to a company." },
  { key: "databrain-ai", name: "DataBrain", category: "ai", state: "company-only", note: "It has no settings." },
];

export function productDefaultCards(chosen: Record<string, number>, usage: Record<string, { usingDefault: number; usingOwn: number }>): SettingsCardData[] {
  const href = (key: string) => `${PRODUCT_DEFAULTS_PATH}?open=${key}`;
  const specs: SettingsCardData[] = PRODUCT_SPECS.map((p) => {
    const n = chosen[p.key] ?? 0;
    const u = usage[p.key];
    return {
      key: p.key, name: p.name, description: p.description, category: p.category, icon: "settings", href: href(p.key),
      status: n > 0 ? "ready" : "not_set_up",
      note: `${n} of ${allSettings(p).length} defaults set${u ? ` · ${u.usingDefault} follow all defaults, ${u.usingOwn} changed some` : ""}`,
    };
  });
  const rest: SettingsCardData[] = NO_DEFAULT_CARDS.map((c) => ({ key: c.key, name: c.name, description: c.links ? "Its defaults have their own screens." : "Nothing to default here.", category: c.category, icon: "settings", href: href(c.key), status: "company_only" }));
  return [...specs, ...rest];
}
