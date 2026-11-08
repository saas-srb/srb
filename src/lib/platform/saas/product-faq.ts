import type { FeatureModule } from "@/lib/platform/saas/modules";
import type { FeatureGroupList, PanelValue } from "@/lib/platform/saas/feature-lists";
import type { PanelDetail } from "@/lib/platform/saas/panel-detail";

export interface ProductFaq { q: string; a: string }

/**
 * The questions people ask about one product, answered only from that product's own data (its copy, feature list, roles, workflow,
 * connections and guides). Nothing here is about another product or invented; it is what the page says, in question form.
 */
export function productFaqs(m: FeatureModule, d: { groups: FeatureGroupList[]; total: number; value?: PanelValue; detail?: PanelDetail; connected: string[]; guides: string[] }): ProductFaq[] {
  const { groups, total, value, detail, connected, guides } = d;
  const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const out: ProductFaq[] = [
    { q: `What is ${m.name}?`, a: `${m.name}: ${m.description.replace(/[.!?]$/, "")}. ${m.summary}` },
    { q: `What can I do with ${m.name}?`, a: `${m.capabilities.join(". ")}.` },
  ];
  if (detail) out.push({ q: `Who is ${m.name} for?`, a: detail.audience.map((a) => `${a.who}: ${a.does}`).join(" ") });
  if (value) out.push({ q: `What does ${m.name} take the place of?`, a: `${m.name} takes the place of ${value.replaces.toLowerCase()}. ${value.benefits.join(". ")}.` });
  if (detail) out.push({ q: `How does ${m.name} work?`, a: detail.workflow.map((w, i) => `${i + 1}. ${w.title}: ${w.text}`).join(" ") });
  if (total > 0) out.push({ q: `What features does ${m.name} have?`, a: `They are grouped like this: ${list(groups.map((g) => g.title))}. Every one of them is included in every plan.` });
  if (m.automations.length) out.push({ q: `What does ${m.name} do automatically?`, a: `${m.automations.join(". ")}.` });
  if (connected.length) out.push({ q: `Does ${m.name} work with other products?`, a: `It works fully on its own, and it can pass work to ${list(connected)} when you want it to.` });
  if (detail?.ask?.length) out.push({ q: `Can I ask AI questions about my ${m.name} data?`, a: `Yes. Ask in plain English, for example ${detail.ask.slice(0, 3).map((q) => `“${q}”`).join(", ")}. Answers are worked out from the records the person asking is allowed to see, and show how they were calculated.` });
  out.push({ q: `Is ${m.name} included in every plan?`, a: `Yes. Every plan, including the Free plan, includes ${m.name} and every one of its features. Plans differ only by the number of people and the monthly allowances of storage, AI, email and voice.` });
  out.push({ q: `How do I start with ${m.name}?`, a: guides.length ? `Register free, switch on ${m.name} in your business setup, and follow ${list(guides)} in the documentation.` : `Register free, switch on ${m.name} in your business setup, then open the guide for it in the documentation.` });
  out.push({ q: `Who can see the data in ${m.name}?`, a: `Only the people you give a role in it. Each business's data is kept separate from every other business's. Permissions are checked every time someone opens a page, does something or exports data, and sensitive areas need their own permission. Read how it works on the Security & Trust page.` });
  return out;
}
