import "server-only";
import { MODULE_COPY } from "@/lib/platform/saas/content";
import { PANEL_DETAIL } from "@/lib/platform/saas/panel-detail";
import { FEATURE_LISTS } from "@/lib/platform/saas/feature-lists";
import { TUTORIALS } from "@/lib/platform/saas/tutorials";
import { PERMISSION_GROUPS } from "@/lib/platform/console/permissions";
import { PANEL_ROUTES } from "@/lib/ai/agent/guide/nav.generated";

/**
 * "How do I…?" answers for every product, drawn from what the product itself documents (module descriptions, product detail pages, step-by-step
 * tutorials, feature lists) plus the real screens of the product. Nothing here is written for the agent alone, so it can't drift from the docs.
 */

export const GUIDE_PANELS = [...Object.keys(MODULE_COPY).filter((k) => k !== "website"), "platform"];

type Section = { title: string; text: string };

/** The Platform Console (the product owner\'s console) is not a company module, so its guide comes from its own permission catalogue and screens. */
function platformSections(): Section[] {
  const out: Section[] = [{ title: "What this product is for", text: "The Platform Console is the SaaS owner's console: every company on the platform, their plans and subscriptions, billing and invoices, coupons and add-ons, sign-up approvals, domains, products, usage and AI token history, support requests from companies, and the audit log. It exists only for the platform team and each person sees only the areas their platform role allows." }];
  for (const g of PERMISSION_GROUPS) out.push({ title: `${g.area}: what a platform role can allow`, text: g.permissions.map((p) => `- ${p.label}`).join("\n") });
  out.push({ title: "Common tasks and where they are", text: ["Suspend or reactivate a company: Companies › the company › status control", "Extend a trial or grant free access: Companies › the company (trial and free-access cards)", "Delete a company completely (data and domains): Companies › the company › Delete — owner only, multi-step confirmation", "Change a company's plan, cancel or suspend its subscription: Subscriptions › the company", "Create or edit plans and prices: Plans", "Create discount codes: Coupons", "Sell extra capacity or modules: Add-ons", "Approve or reject new sign-ups: Sign-ups (when sign-up mode is approval)", "Mark an invoice paid, void it, or issue a credit note: Invoices › the invoice", "See who is near their plan limits: Usage", "See AI tokens by company and every call: AI token history", "Reply to company support requests and write help articles: Support", "Announce maintenance: Maintenance", "Who can do what on the platform team: Users and roles"].map((t) => `- ${t}`).join("\n") });
  const routes = PANEL_ROUTES.platform;
  if (routes?.length) out.push({ title: "Screens (where things are)", text: routes.map((r) => `${r.name}: ${r.path}`).join("\n") });
  return out;
}

function sections(panel: string): Section[] {
  if (panel === "platform") return platformSections();
  const out: Section[] = [];
  const mod = MODULE_COPY[panel];
  if (mod) {
    out.push({ title: "What this product is for", text: `${mod.headline}. ${mod.summary}` });
    out.push({ title: "What you can do", text: mod.capabilities.map((c) => `- ${c}`).join("\n") });
    if (mod.automations.length) out.push({ title: "Automations you can set up", text: mod.automations.map((c) => `- ${c}`).join("\n") });
  }
  const d = PANEL_DETAIL[panel];
  if (d) {
    out.push({ title: "How it works", text: d.intro });
    out.push({ title: "Who uses it", text: d.audience.map((a) => `- ${a.who}: ${a.does}`).join("\n") });
    out.push({ title: "How work moves through it", text: d.workflow.map((w, i) => `${i + 1}. ${w.title} — ${w.text}`).join("\n") });
    if (d.connects.length) out.push({ title: "Connects to other products", text: d.connects.map((c) => `- ${c.panel}: ${c.text}`).join("\n") });
  }
  const features = FEATURE_LISTS[panel];
  if (features?.length) out.push({ title: "Features by area", text: features.map((g) => `${g.title}: ${g.items.map((i) => `${i.name} (${i.text})`).join("; ")}`).join("\n") });
  for (const t of TUTORIALS.filter((x) => x.panel === panel)) {
    out.push({ title: `Tutorial: ${t.title}`, text: `${t.summary}\n${t.steps.map((s, i) => `${i + 1}. ${s.title} — ${s.text}${s.tip ? ` (Tip: ${s.tip})` : ""}`).join("\n")}` });
  }
  const routes = PANEL_ROUTES[panel];
  if (routes?.length) out.push({ title: "Screens (where things are)", text: routes.map((r) => `${r.name}: ${r.path}`).join("\n") });
  return out;
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];

/** The part of a product's documentation that best answers `topic` (or an overview when there is none). */
export function panelGuide(panel: string, topic?: string): { panel: string; found: boolean; text: string } {
  const all = sections(panel);
  if (!all.length) return { panel, found: false, text: `There is no written guide for "${panel}". Use the screens list and the records you can read.` };
  const wanted = words(topic ?? "");
  let picked = all;
  if (wanted.length) {
    const scored = all
      .map((s) => {
        const hay = `${s.title} ${s.text}`.toLowerCase();
        return { s, score: wanted.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) + (s.title.toLowerCase().startsWith("tutorial") ? 0.1 : 0) };
      })
      .filter((x) => x.score > 0.1)
      .sort((a, b) => b.score - a.score);
    picked = scored.length ? scored.slice(0, 4).map((x) => x.s) : all.filter((s) => /^(What this panel|Screens)/.test(s.title));
  } else {
    picked = all.filter((s) => !s.title.startsWith("Tutorial") && s.title !== "Screens (where things are)");
  }
  const text = picked.map((s) => `## ${s.title}\n${s.text}`).join("\n\n");
  return { panel, found: true, text: text.length > 9000 ? `${text.slice(0, 9000)}\n…` : text };
}

/** Screens list for the system prompt (kept short: static screens only). */
export function routeSummary(panel: string, max = 45): string {
  const rows = (PANEL_ROUTES[panel] ?? []).filter((r) => !r.path.includes(":")).slice(0, max);
  return rows.map((r) => `${r.name}: ${r.path}`).join("\n");
}

export function panelRoutes(panel: string) {
  return PANEL_ROUTES[panel] ?? [];
}
