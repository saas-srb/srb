/**
 * robots.txt parsing, matching and validation (RFC 9309 + Google's documented
 * behaviour): groups of user-agent lines, the most specific matching group
 * wins, then the longest matching rule wins and `allow` wins a length tie.
 * `*` matches any run of characters and a trailing `$` anchors the end.
 *
 * Pure — the robots editor uses it client-side for live preview/validation,
 * the crawler uses it to decide what is blocked, and the publish action
 * re-runs `validateRobots` on the server before anything goes live.
 */

export interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
  line: number;
}

export interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
  crawlDelay: number | null;
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
  problems: RobotsProblem[];
}

export interface RobotsProblem {
  level: "error" | "warning";
  line: number | null;
  message: string;
}

const KNOWN = new Set(["user-agent", "allow", "disallow", "sitemap", "crawl-delay", "host", "noindex", "clean-param"]);

export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  const problems: RobotsProblem[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = idx + 1;
    const content = raw.replace(/#.*$/, "").trim();
    if (!content) return;
    const colon = content.indexOf(":");
    if (colon === -1) {
      problems.push({ level: "error", line, message: `Line is not a "field: value" directive: "${content.slice(0, 60)}"` });
      return;
    }
    const field = content.slice(0, colon).trim().toLowerCase();
    const value = content.slice(colon + 1).trim();

    if (!KNOWN.has(field)) {
      problems.push({ level: "warning", line, message: `Unknown directive "${field}" — crawlers will ignore it.` });
      lastWasAgent = false;
      return;
    }

    if (field === "user-agent") {
      if (!value) problems.push({ level: "error", line, message: "User-agent has no value." });
      if (!current || !lastWasAgent) {
        current = { userAgents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.userAgents.push(value.toLowerCase());
      lastWasAgent = true;
      return;
    }
    lastWasAgent = false;

    if (field === "sitemap") {
      try {
        const u = new URL(value);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
        sitemaps.push(value);
      } catch {
        problems.push({ level: "error", line, message: `Sitemap must be an absolute URL: "${value}"` });
      }
      return;
    }

    if (field === "host" || field === "clean-param") {
      problems.push({ level: "warning", line, message: `"${field}" is not supported by Google.` });
      return;
    }
    if (field === "noindex") {
      problems.push({ level: "warning", line, message: 'Google does not support "noindex" in robots.txt — use a robots meta tag instead.' });
      return;
    }

    if (!current) {
      problems.push({ level: "error", line, message: `"${field}" appears before any User-agent line and applies to nothing.` });
      return;
    }

    if (field === "crawl-delay") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) problems.push({ level: "error", line, message: `Crawl-delay must be a non-negative number, got "${value}".` });
      else {
        current.crawlDelay = n;
        problems.push({ level: "warning", line, message: "Googlebot ignores Crawl-delay (Bing and others respect it)." });
      }
      return;
    }

    // allow / disallow
    if (value && !value.startsWith("/") && !value.startsWith("*")) {
      problems.push({ level: "error", line, message: `Path must start with "/" or "*": "${value}"` });
      return;
    }
    // An empty Disallow means "allow everything" — valid, adds no rule.
    if (value) current.rules.push({ type: field as "allow" | "disallow", path: value, line });
  });

  return { groups, sitemaps, problems };
}

function ruleRegex(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** The group that applies to `agent`: the longest matching product token, else `*`. */
export function groupFor(parsed: ParsedRobots, agent: string): RobotsGroup | null {
  const a = agent.toLowerCase();
  let best: { group: RobotsGroup; len: number } | null = null;
  for (const g of parsed.groups) {
    for (const ua of g.userAgents) {
      if (ua !== "*" && a.includes(ua) && (!best || ua.length > best.len)) best = { group: g, len: ua.length };
    }
  }
  if (best) return best.group;
  return parsed.groups.find((g) => g.userAgents.includes("*")) ?? null;
}

export interface RobotsVerdict {
  allowed: boolean;
  rule: RobotsRule | null;
  agentGroup: string | null;
}

/** Whether `pathWithQuery` may be crawled by `agent`. */
export function isAllowed(parsed: ParsedRobots, pathWithQuery: string, agent = "Googlebot"): RobotsVerdict {
  const group = groupFor(parsed, agent);
  if (!group) return { allowed: true, rule: null, agentGroup: null };
  let best: RobotsRule | null = null;
  let bestLen = -1;
  for (const rule of group.rules) {
    if (!ruleRegex(rule.path).test(pathWithQuery)) continue;
    const len = rule.path.length;
    if (len > bestLen || (len === bestLen && rule.type === "allow")) {
      best = rule;
      bestLen = len;
    }
  }
  return { allowed: !best || best.type === "allow", rule: best, agentGroup: group.userAgents.join(", ") };
}

/**
 * Full validation for the editor and the publish action. `importantPaths` are
 * the site's indexable pages (from the latest audit) so the validator can warn
 * when a rule would block pages that currently rank or sit in the sitemap.
 */
export function validateRobots(
  text: string,
  opts: { primaryHost?: string; importantPaths?: string[] } = {}
): { parsed: ParsedRobots; problems: RobotsProblem[]; blocksEverything: boolean; blockedImportant: string[] } {
  const parsed = parseRobots(text);
  const problems = [...parsed.problems];

  if (new TextEncoder().encode(text).length > 500 * 1024) {
    problems.push({ level: "error", line: null, message: "robots.txt is larger than Google's 500 KiB limit; the rest is ignored." });
  }
  if (parsed.groups.length === 0) {
    problems.push({ level: "warning", line: null, message: "No User-agent groups — every URL is crawlable." });
  }
  if (parsed.sitemaps.length === 0) {
    problems.push({ level: "warning", line: null, message: "No Sitemap line. Listing the sitemap helps crawlers discover pages." });
  }
  if (opts.primaryHost) {
    const primary = opts.primaryHost.replace(/^www\./, "");
    for (const s of parsed.sitemaps) {
      try {
        const host = new URL(s).host;
        if (host !== opts.primaryHost) {
          problems.push({
            level: "warning",
            line: null,
            message: `Sitemap host "${host}" differs from the primary host "${opts.primaryHost}"${host.replace(/^www\./, "") === primary ? " (www vs non-www)" : ""}.`,
          });
        }
      } catch {
        // reported by the parser
      }
    }
  }

  const blocksEverything = ["Googlebot", "Bingbot", "*"].some((ua) => !isAllowed(parsed, "/", ua === "*" ? "SomeCrawler" : ua).allowed);
  if (blocksEverything) {
    problems.push({ level: "error", line: null, message: "This file blocks the home page for major crawlers — the whole site would drop out of search." });
  }

  const blockedImportant = (opts.importantPaths ?? []).filter((p) => !isAllowed(parsed, p).allowed);
  if (blockedImportant.length > 0) {
    problems.push({
      level: "warning",
      line: null,
      message: `${blockedImportant.length} currently indexable page(s) would be blocked for Googlebot, e.g. ${blockedImportant.slice(0, 3).join(", ")}.`,
    });
  }

  return { parsed, problems, blocksEverything, blockedImportant };
}

/** The code-default robots.txt for a site at `siteUrl` (a company's public origin, no trailing slash). */
export function robotsTxtTemplate(siteUrl: string): string {
  return `User-Agent: *
Allow: /
Disallow: /dealflow-ai
Disallow: /cohort-ai
Disallow: /verify

Sitemap: ${siteUrl}/sitemap.xml
`;
}

/**
 * The platform owner's fallback until someone publishes from the product —
 * byte-for-byte what the previous code-defined `src/app/robots.ts` served.
 * Other companies get `robotsTxtTemplate(companySiteUrl())` (see `defaultRobots()`).
 */
