import { DOC_ROUTES } from "@/lib/platform/saas/docs-routes";
import { GUIDE_FACTS, type ScreenFacts } from "@/lib/platform/saas/guide-facts";

export interface GuideStep { title: string; text: string; items?: string[] }
export interface FeatureGuide { img: string | null; auto: boolean; steps: GuideStep[]; routeKey: string | null; facts?: ScreenFacts; tips: string[] }

const CREATE = /^(new|add|create|invite|upload|import|generate|start|send|post|request|run|record|issue|raise|schedule|submit)\b/i;
const q = (s: string) => `“${s}”`;

/** The real screen a feature is documented from, if it was captured. */
export function guideFor(panel: string, featureName: string, panelName: string, featureText: string): FeatureGuide {
  const r = DOC_ROUTES[panel];
  const hit = r?.map[featureName];
  const routeKey = hit ? (Array.isArray(hit) ? hit[0] : hit) : null;
  const auto = Array.isArray(hit);
  const facts: ScreenFacts | undefined = routeKey ? GUIDE_FACTS[panel]?.[routeKey] : undefined;
  const steps: GuideStep[] = [];
  const clean = (a: string[]) => a.filter((x) => !/[▼▲]|__|^\W*$/.test(x));
  steps.push({ title: `Open ${panelName}`, text: panel === "workspace" ? "Sign in to your business's Workspace. You see only what your role allows." : `Sign in and open the ${panelName} product from your Workspace dashboard (or sign in to it directly). You see only what your role allows.` });
  if (!facts) {
    const route = routeKey ? r?.routes[routeKey] : undefined;
    const routeText = route
      ? route.includes("/:") ? `The mapped screen route is ${route}. Open the relevant record first, then use the available action to reach this screen.`
        : `The mapped screen route is ${route}. Open it in the signed-in ${panelName} app.`
      : `Open ${q(featureName)} in ${panelName}.`;
    steps.push({ title: `Open ${featureName}`, text: routeText });
    steps.push({ title: `Use ${featureName}`, text: `${featureText}${/[.!?]$/.test(featureText) ? "" : "."} The exact actions shown can depend on your role and the records available in your workspace.` });
    return { img: null, auto, steps, routeKey, tips: [] };
  }
  const img = `/selfrun/guide/${panel}/${routeKey}.webp`;
  if (auto) {
    steps.push({ title: "Nothing to set up", text: `${featureName} works on its own. ${featureText}${/[.!?]$/.test(featureText) ? "" : "."}` });
    steps.push({ title: "See it at work", text: `Open ${q(facts.menu || facts.title)}${facts.menu ? " in the left menu" : ""} — the screen on the right is where its effect shows.` });
    return { img, auto, steps, routeKey, facts, tips: tipsFrom(facts) };
  }
  steps.push({ title: `Open ${q(facts.menu || facts.title)}`, text: facts.menu ? `In the left menu, click ${q(facts.menu)}. The ${q(facts.title)} screen opens${facts.sub ? ` — ${facts.sub.charAt(0).toLowerCase() + facts.sub.slice(1)}` : ""}${/[.!?]$/.test(facts.sub || "") ? "" : "."}` : `In the left menu of ${panelName}, open the page called ${q(facts.title)} (some pages sit inside a menu group — click the group to expand it).${facts.sub ? " " + facts.sub : ""}` });
  const isForm = /^new|add|create|invite/i.test(featureName) || /new$/.test(routeKey ?? "");
  if (facts.tabs.length) steps.push({ title: "Choose a view", text: "Use the tabs at the top of the screen to switch between:", items: facts.tabs });
  if (facts.placeholders.length && !isForm) steps.push({ title: "Find what you need", text: `Type in the search box (${q(facts.placeholders[0])}) to find a record quickly.` });
  if (facts.labels.length) steps.push(isForm
    ? { title: "Fill in the details", text: "Complete the fields on the form:", items: clean(facts.labels) }
    : { title: "Narrow the list", text: "Use these filters to see only what you want:", items: clean(facts.labels) });
  if (facts.headers.length) steps.push({ title: "Read the list", text: "Each row shows:", items: facts.headers });
  const buttons = clean(facts.buttons);
  const create = (isForm && buttons.find((b) => /^(create|save|submit)\b/i.test(b))) || buttons.find((b) => CREATE.test(b));
  if (create) steps.push({ title: isForm ? "Save it" : "Add a new one", text: isForm ? `When the details are right, click ${q(create)} to save.` : `Click ${q(create)} to add one. A form opens for the details.` });
  const rest = buttons.filter((b) => b !== create && b.length > 1 && !/^(previous|next|columns|\d+)$/i.test(b)).slice(0, 8);
  if (rest.length) steps.push({ title: "Other actions on this screen", text: "You will also see these buttons:", items: rest });
  steps.push({ title: "Done", text: `${featureText}${/[.!?]$/.test(featureText) ? "" : "."}` });
  return { img, auto, steps, routeKey, facts, tips: tipsFrom(facts) };
}

/** Practical tips, each one only when the captured screen really has that control. */
function tipsFrom(f: ScreenFacts): string[] {
  const t: string[] = [];
  const ok = (a: string[]) => a.filter((x) => !/[▼▲]|__/.test(x));
  const req = ok(f.labels).filter((l) => /\*$/.test(l)).map((l) => l.replace(/\s*\*$/, ""));
  if (req.length) t.push(`Fields marked with * are required — ${req.join(", ")}. The form cannot be saved until they are filled in.`);
  const labels = ok(f.labels).filter((l) => !/\*$/.test(l) && !/^search$/i.test(l));
  if (labels.length > 1 && !req.length) t.push(`You can use more than one filter together (${labels.slice(0, 3).join(", ")}) to see exactly the records you want.`);
  if (f.placeholders[0] && !req.length) t.push(`The search box accepts: ${f.placeholders[0]}. Start typing and the list narrows down.`);
  const exp = ok(f.buttons).filter((b) => /^(csv|excel|pdf|export|download)/i.test(b));
  if (exp.length) t.push(`Use ${exp.map((b) => `“${b}”`).join(" or ")} to download what you see, for example to share it or keep a copy.`);
  const imp = ok(f.buttons).find((b) => /^(import|upload)/i.test(b));
  if (imp) t.push(`“${imp}” lets you add many records at once from a file instead of one by one.`);
  if (f.tabs.length > 1) t.push(`The tabs (${f.tabs.slice(0, 4).join(", ")}) show different views of the same data — switching tabs never changes anything.`);
  if (f.headers.length) t.push(`Click a row to open that record and see all of its details.`);
  t.push("If you make a mistake, open the record again and correct it. Changes are recorded against your name so your team can see who did what.");
  return t;
}
