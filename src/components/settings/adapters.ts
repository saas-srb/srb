import { CARD_COPY } from "@/lib/platform/connections/card-copy";
import type { CardStatus, IntegrationCard } from "@/lib/platform/connections/cards";
import type { ProductStatus } from "@/lib/products/commandos/product-status";
import type { SettingsCardData, SettingsStatus } from "@/components/settings/model";

/** The two old status vocabularies mapped onto the ONE shared one. Pure: tested. */
export function fromCardStatus(s: CardStatus): SettingsStatus {
  return s === "srb_unavailable" ? "not_set_up" : s;
}
export function fromProductStatus(s: ProductStatus, locked: boolean): SettingsStatus {
  return locked ? "locked" : s === "needs_setup" ? "not_set_up" : "ready";
}

export const INTEGRATIONS_PATH = "/commandos/settings/integrations";
export const PRODUCTS_PATH = "/commandos/settings/products";

const ICON_BY_CATEGORY: Record<string, string> = { email: "email", payments: "payments", ai: "ai", voice: "voice", website: "website", social: "social", webhooks: "webhooks", domains: "domains", storage: "storage", leads: "leads" };

export function integrationCardData(c: IntegrationCard): SettingsCardData {
  const status = fromCardStatus(c.status);
  return {
    key: c.key,
    name: c.name,
    description: CARD_COPY[c.key] ?? c.description,
    category: c.category,
    status,
    note: c.status === "srb_unavailable" ? "No included default, add your own." : c.status === "needs_attention" ? c.note : null,
    meta: c.usedBy.length > 0 ? { label: "Used by", items: c.usedBy.map(plainProductName) } : null,
    icon: ICON_BY_CATEGORY[c.category] ?? "plug",
    href: c.kind === "page" && !c.testable ? (c.href ?? INTEGRATIONS_PATH) : `${INTEGRATIONS_PATH}?open=${c.key}`,
  };
}

export interface ProductCardInput { key: string; name: string; description: string; group: string; panelKey: string | undefined; connections: string[] }

export function productCardData(p: ProductCardInput, status: ProductStatus, locked: boolean): SettingsCardData {
  return {
    key: p.key,
    name: p.name,
    description: p.description,
    category: p.group,
    status: fromProductStatus(status, locked),
    meta: p.connections.length > 0 ? { label: "Connections", items: p.connections } : null,
    icon: "settings",
    href: `${PRODUCTS_PATH}?open=${p.key}`,
    lockedHref: `/commandos/locked?item=product.${p.panelKey}`,
  };
}

/** "SRB TalentOS" is shown as "TalentOS" everywhere on these pages. */
export const plainProductName = (name: string) => name.replace(/^(SRB|SelfRun)\s+/i, "").trim();

export const slugOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
