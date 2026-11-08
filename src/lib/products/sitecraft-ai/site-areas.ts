/**
 * Groups the site's pages by area (their first path segment) for the CMS
 * lists, filters and dashboard. Pure (client + server).
 */
export const SITE_AREAS: { key: string; label: string; match: (path: string) => boolean }[] = [
  { key: "home", label: "Homepage", match: (p) => p === "/" },
  { key: "services", label: "Services", match: (p) => /^\/(services|software-development|digital-marketing|ai-automations)(\/|$)/.test(p) },
  { key: "industries", label: "Industries", match: (p) => p.startsWith("/industries") },
  { key: "training", label: "Training & Internships", match: (p) => /^\/(industrial-training|internship-program)(\/|$)/.test(p) },
  { key: "hiring", label: "Resource Augmentation", match: (p) => p.startsWith("/resource-augmentation") },
  { key: "blog", label: "Blog", match: (p) => p.startsWith("/blog") },
  { key: "careers", label: "Careers", match: (p) => p.startsWith("/careers") },
  { key: "about", label: "About & Legal", match: (p) => p.startsWith("/about") },
  { key: "other", label: "Other", match: () => true },
];

export function areaOf(path: string): string {
  return SITE_AREAS.find((a) => a.match(path))!.key;
}

export function areaLabel(key: string): string {
  return SITE_AREAS.find((a) => a.key === key)?.label ?? key;
}

/** A readable name for a page whose CMS title is just its path ("/careers/apply" → "Careers › Apply"). */
export function displayTitle(title: string, path: string): string {
  if (title && !title.startsWith("/")) return title;
  if (path === "/") return "Homepage";
  return path
    .split("/")
    .filter(Boolean)
    .map((seg) => seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" › ");
}

/** "3 minutes ago" style, for activity lists. */
export function timeAgo(date: Date | string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  if (s < 60) return "just now";
  const units: [number, string][] = [[60, "minute"], [3600, "hour"], [86400, "day"], [604800, "week"], [2629800, "month"], [31557600, "year"]];
  let [div, name] = units[0];
  for (const u of units) if (s >= u[0]) [div, name] = u;
  const n = Math.floor(s / div);
  return `${n} ${name}${n === 1 ? "" : "s"} ago`;
}
