import type { FeatureModule } from "@/lib/platform/saas/modules";
import type { FeatureGroupList, PanelValue } from "@/lib/platform/saas/feature-lists";
import type { PanelDetail } from "@/lib/platform/saas/panel-detail";
import type { ProductStory } from "@/lib/platform/saas/product-story";

export interface ProductFaq { q: string; a: string }

/**
 * The questions people ask about one product, answered only from that product's own data (its copy, feature list, roles, workflow
 * and connections). Nothing here is about another product or invented; it is what the page says, in question form.
 */
export function productFaqs(m: FeatureModule, d: { groups: FeatureGroupList[]; total: number; value?: PanelValue; detail?: PanelDetail; connected: string[]; story?: ProductStory }): ProductFaq[] {
  const { groups, total, value, detail, connected, story } = d;
  const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const out: ProductFaq[] = [
    { q: `What is ${m.name}?`, a: story ? `${story.what} ${story.why}` : `${m.name}: ${m.description.replace(/[.!?]$/, "")}. ${m.summary}` },
    { q: `What can I do with ${m.name}?`, a: `${m.capabilities.join(". ")}.` },
  ];
  if (detail) out.push({ q: `Who is ${m.name} for?`, a: detail.audience.map((a) => `${a.who}: ${a.does}`).join(" ") });
  if (value) out.push({ q: `What does ${m.name} take the place of?`, a: `${m.name} takes the place of ${/^[A-Z][a-z]/.test(value.replaces) ? value.replaces.charAt(0).toLowerCase() + value.replaces.slice(1) : value.replaces}. ${value.benefits.join(". ")}.` });
  if (detail) out.push({ q: `How does ${m.name} work?`, a: detail.workflow.map((w, i) => `${i + 1}. ${w.title}: ${w.text}`).join(" ") });
  if (total > 0) out.push({ q: `What features does ${m.name} have?`, a: `They are grouped like this: ${list(groups.map((g) => g.title))}. All of them come with the product.` });
  if (m.automations.length) out.push({ q: `What does ${m.name} do automatically?`, a: `${m.automations.join(". ")}.` });
  if (connected.length) out.push({ q: `Does ${m.name} work with other products?`, a: `It works fully on its own, and it can pass work to ${list(connected)} when you want it to.` });
  if (detail?.ask?.length) out.push({ q: `Can I ask AI questions about my ${m.name} data?`, a: `Yes. Ask in plain English, for example ${detail.ask.slice(0, 3).map((q) => `“${q}”`).join(", ")}. Answers are worked out from the records the person asking is allowed to see, and show how they were calculated.` });
  out.push({ q: `Can I take only ${m.name}?`, a: m.key === "portal" || m.key === "seo" ? "It comes with SiteCraft & Sites, and with All products." : m.key === "intelligence" || m.key === "workspace" || m.key === "support" ? "It comes with every workspace, whichever products you take." : m.key === "website" ? "Your website comes with SiteCraft." : `Yes. Take ${m.name} on its own or with other products, with every one of its features.` });
  out.push({ q: `How do I start with ${m.name}?`, a: `Create your workspace in three short steps: choose your products, tell us about your business and set up your account. ${m.name} is ready as soon as you sign in. You can also ask for a demo first.` });
  out.push({ q: `Who can see the data in ${m.name}?`, a: `Only the people you give a role in it. Each business's data is kept separate from every other business's. Permissions are checked every time someone opens a page, does something or exports data, and sensitive areas need their own permission. Read how it works on the Security & Trust page.` });
  return out;
}
