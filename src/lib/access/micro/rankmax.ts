import type { MicroFeature } from "./types";

const P = "rankmax-ai";
type Row = [short: string, module: string, kind: MicroFeature["kind"], label: string, description: string, level: "read" | "write", legacy: string[], scope?: "all"];

/** What everybody given RankMax gets: they can open the dashboard (which shows only what their other features allow). */
const BASELINE = new Set(["dashboard.view"]);

const ROWS: Row[] = [
  ["dashboard.view", "Dashboard", "page", "Open the dashboard", "Open the RankMax dashboard with the numbers of the areas the person can see.", "read", ["seo.VIEW"]],
  ["overview.view", "Overview", "page", "Open SEO Overview", "Open the SEO overview: scores, traffic and search trends.", "read", ["seo.VIEW"]],
  ["pages.view", "Pages", "page", "See pages", "Open the page inventory and a page's detail.", "read", ["seo.VIEW"]],
  ["pages.create", "Pages", "button", "Add a page", "Add a page to the inventory.", "write", ["seo.CREATE"]],
  ["pages.delete", "Pages", "button", "Delete a page", "Remove a page from the inventory.", "write", ["seo.DELETE"]],
  ["audit.view", "Website audit", "page", "See audits", "Open the website audit and its past runs.", "read", ["seo.VIEW"]],
  ["audit.run", "Website audit", "button", "Run an audit", "Start a website audit now.", "write", ["seo.RUN_AUDIT"]],
  ["audit.log", "Website audit", "section", "Read the activity log and export it", "Read who changed what in RankMax and export the log.", "read", ["seo.VIEW_AUDIT"]],
  ["technical.view", "Technical SEO", "page", "See technical SEO", "Open Technical SEO: crawl health, speed and indexing.", "read", ["seo.VIEW"]],
  ["technical.manage", "Technical SEO", "button", "Change technical SEO", "Request indexing and check index status of pages.", "write", ["seo.MANAGE_TECHNICAL_SEO"]],
  ["technical.pagespeed", "Technical SEO", "button", "Run PageSpeed checks", "Test the speed of pages with PageSpeed.", "write", ["seo.RUN_AUDIT"]],
  ["onpage.view", "On-page SEO", "page", "See on-page SEO", "Open On-Page SEO: titles, descriptions and headings.", "read", ["seo.VIEW"]],
  ["onpage.manage", "On-page SEO", "button", "Edit on-page SEO", "Change a page's title, description and other on-page settings.", "write", ["seo.MANAGE_ON_PAGE_SEO"]],
  ["content.view", "Content SEO", "page", "See content SEO", "Open Content SEO: content quality findings.", "read", ["seo.VIEW"]],
  ["keywords.view", "Keywords", "page", "See keywords", "Open keywords, groups and a keyword's detail.", "read", ["seo.VIEW"]],
  ["keywords.manage", "Keywords", "button", "Add and edit keywords", "Add, edit, group and import keywords.", "write", ["seo.MANAGE_KEYWORDS"]],
  ["keywords.delete", "Keywords", "button", "Delete keywords and groups", "Delete a keyword or a keyword group.", "write", ["seo.DELETE"]],
  ["rankings.view", "Rankings", "page", "See rankings", "Open ranking positions and their history.", "read", ["seo.VIEW"]],
  ["rankings.manage", "Rankings", "button", "Record and sync rankings", "Record positions, import rankings and sync Search Console and Analytics.", "write", ["seo.MANAGE_RANKINGS"]],
  ["competitors.view", "Competitors", "page", "See competitors", "Open competitors and a competitor's detail.", "read", ["seo.VIEW"]],
  ["competitors.manage", "Competitors", "button", "Manage competitors", "Add and edit competitors, import and record their rankings, snapshot their sitemaps.", "write", ["seo.MANAGE_COMPETITORS"]],
  ["competitors.delete", "Competitors", "button", "Delete a competitor", "Delete a competitor.", "write", ["seo.DELETE"]],
  ["internallinks.view", "Internal links", "page", "See internal links", "Open the internal link map.", "read", ["seo.VIEW"]],
  ["backlinks.view", "Backlinks", "page", "See backlinks", "Open backlinks.", "read", ["seo.VIEW"]],
  ["backlinks.manage", "Backlinks", "button", "Manage backlinks", "Add, edit and import backlinks and verify them.", "write", ["seo.MANAGE_BACKLINKS"]],
  ["backlinks.delete", "Backlinks", "button", "Delete a backlink", "Delete a backlink.", "write", ["seo.DELETE"]],
  ["sitemap.view", "Sitemap", "page", "See the sitemap", "Open the sitemap and its status.", "read", ["seo.VIEW"]],
  ["sitemap.manage", "Sitemap", "button", "Manage the sitemap", "Change sitemap settings, discover and submit sitemaps.", "write", ["seo.MANAGE_SITEMAP"]],
  ["robots.view", "Robots.txt", "page", "See robots.txt", "Open robots.txt and its history.", "read", ["seo.VIEW"]],
  ["robots.manage", "Robots.txt", "button", "Publish robots.txt", "Publish a new robots.txt.", "write", ["seo.MANAGE_ROBOTS"]],
  ["schema.view", "Structured data", "page", "See structured data", "Open schema markup records.", "read", ["seo.VIEW"]],
  ["schema.manage", "Structured data", "button", "Manage structured data", "Create, edit and publish schema markup.", "write", ["seo.MANAGE_SCHEMA"]],
  ["schema.delete", "Structured data", "button", "Delete structured data", "Delete a schema markup record.", "write", ["seo.DELETE"]],
  ["issues.view", "Issues", "page", "See SEO issues", "Open the issue list and an issue's detail.", "read", ["seo.VIEW"]],
  ["issues.create", "Issues", "button", "Add an issue", "Add an SEO issue by hand.", "write", ["seo.CREATE"]],
  ["issues.edit", "Issues", "button", "Update issues", "Change an issue's status, assignee and notes, singly or in bulk.", "write", ["seo.EDIT"]],
  ["tasks.view", "Tasks", "page", "See tasks", "Open the SEO work queue and a task's detail.", "read", ["seo.VIEW"]],
  ["tasks.manage", "Tasks", "button", "Create and update tasks", "Create tasks (also from an issue), change status and comment on tasks they may work on.", "write", ["seo.MANAGE_TASKS"]],
  ["tasks.delete", "Tasks", "button", "Delete a task", "Delete a task.", "write", ["seo.DELETE"]],
  ["tasks.all", "Tasks", "scope", "Work on and assign everyone's tasks", "Without this a person works on tasks assigned to or created by them and can only assign to themselves. With it they can work on every task and assign anyone.", "read", ["seo.isSeoManagerTier"], "all"],
  ["reports.view", "Reports", "page", "Open reports", "Open reports.", "read", ["seo.VIEW"]],
  ["reports.export", "Reports", "export", "Export lists and reports", "Download lists and reports as CSV or Excel (together with the list's own view feature).", "read", ["seo.EXPORT_REPORTS"]],
  ["settings.manage", "Settings", "section", "Change integrations and settings", "Change RankMax integrations (Search Console, Analytics) and settings, and test them.", "write", ["seo.MANAGE_INTEGRATIONS"]],
];

export const RANKMAX_MICRO: MicroFeature[] = ROWS.map(([short, module, kind, label, description, level, legacy, scope]) => ({
  key: `${P}.${short}`, product: P, module, kind, label, description, level, legacy, ...(scope ? { scope } : {}), ...(BASELINE.has(short) ? { baseline: true } : {}),
}));
