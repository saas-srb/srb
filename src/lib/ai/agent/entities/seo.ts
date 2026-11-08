import "server-only";
import * as A from "@/app/(products)/rankmax-ai/(protected)/actions";
import { seoCan, type SeoPermission } from "@/lib/seo-roles";
import { getViewer as seoViewer } from "@/lib/products/rankmax-ai/viewer";
import { runCrawl, CrawlBusyError } from "@/lib/products/rankmax-ai/crawler";
import { notifySeoUsers } from "@/lib/products/rankmax-ai/notifications";
import { getDashboard } from "@/lib/products/rankmax-ai/analytics";
import { issueStats } from "@/lib/products/rankmax-ai/issues";
import { taskStats, TASK_TYPES, TASK_STATUSES, TASK_PRIORITIES } from "@/lib/products/rankmax-ai/tasks";
import { detectCannibalization } from "@/lib/products/rankmax-ai/keywords";
import { ISSUE_STATUSES, SEVERITIES, CATEGORIES } from "@/lib/products/rankmax-ai/checks";
import { peek } from "@/lib/ai/agent/records";
import { viaAction, f, fail, str } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, FieldDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * Search engine optimisation (SEO) for the agent: run site audits, work issues and tasks, manage the page inventory with metadata overrides,
 * keywords and rankings, backlinks, competitors, structured data, sitemap and robots — through the product's own actions and rules.
 */

const ctx = (u: AgentUser) => ({ roles: u.roles, permissionOverrides: u.permissionOverrides });
const can = (p: SeoPermission) => (u: AgentUser) => seoCan(ctx(u), p);
const soft = { deletedAt: null };
const TT = Object.keys(TASK_TYPES); const TS = Object.keys(TASK_STATUSES); const TP = Object.keys(TASK_PRIORITIES);
const ro = (key: string, label: string, description: string, collection: string, extra: Partial<EntityDef> = {}): EntityDef => ({ key, panel: "seo", label, description, collection, idType: "string", read: "any", allowRead: can("VIEW"), ...extra });

export const SEO_ENTITIES: EntityDef[] = [
  ro("seo.page", "Page", "The page inventory: path, last audit result (status, indexability, response time), metadata override and focus keyword.", "seo_pages", { titleField: "path", search: ["path", "focusKeyword"] }),
  ro("seo.issue", "SEO issue", "Problems found by audits or added by hand: title, severity, category, page, status (open / in progress / fixed …), assignee.", "seo_issues", { titleField: "title", search: ["title", "path", "description"] }),
  ro("seo.task", "SEO task", "Work items: code, title, type, priority, status, assignee, due date.", "seo_tasks", { titleField: "title", search: ["title", "code", "url"] }),
  ro("seo.keyword", "Keyword", "Tracked keywords: volume, difficulty, target URL, current position, group.", "seo_keywords", { titleField: "keyword", search: ["keyword", "targetUrl", "cluster"] }),
  ro("seo.keyword_group", "Keyword group", "Groups of keywords.", "seo_keyword_groups", { titleField: "name" }),
  ro("seo.rank_history", "Ranking history", "Position of a keyword over time.", "seo_rank_history", {}),
  ro("seo.backlink", "Backlink", "Links from other sites: source, target, anchor, rel, domain rating.", "seo_backlinks", { titleField: "sourceUrl", search: ["sourceUrl", "targetUrl", "anchor"] }),
  ro("seo.competitor", "Competitor", "Competitor sites and their metrics.", "seo_competitors", { titleField: "name", search: ["name", "domain"] }),
  ro("seo.schema", "Structured data", "Schema.org markup (type, page, status draft/published, validation errors).", "seo_schemas", { titleField: "name", search: ["name", "path"], hide: ["source"] }),
  ro("seo.crawl_run", "Audit run", "Website audits: when, pages crawled, scores, new and fixed issues.", "seo_crawl_runs", {}),
  ro("seo.search_daily", "Search Console daily", "Daily clicks, impressions, CTR and position from Google Search Console.", "seo_search_daily", {}),
  ro("seo.traffic_daily", "Analytics daily", "Daily sessions and users from Google Analytics.", "seo_traffic_daily", {}),
  ro("seo.sitemap", "Sitemap", "Sitemap files and their status.", "seo_sitemaps", {}),
  ro("seo.activity", "Audit log", "Who changed what in SEO.", "seo_activity_logs", { search: ["entityLabel", "summary", "actorEmail"], read: "admin", allowRead: can("VIEW_AUDIT") }),
];
void soft;

const act = (key: string, label: string, description: string, params: FieldDef[], perm: SeoPermission, run: (v: Json, u: AgentUser) => Promise<unknown>, success: string, destructive = false): ActionDef => ({
  key, panel: "seo", label, description, params, level: "any", allow: can(perm), destructive, run: (v, u) => viaAction(() => run(v, u), success),
});

const pseudo = (key: string, collection: string): EntityDef => ({ key, panel: "seo", label: key, description: "", collection, idType: "string" });
const E = { task: pseudo("seo.task", "seo_tasks"), keyword: pseudo("seo.keyword", "seo_keywords"), backlink: pseudo("seo.backlink", "seo_backlinks"), competitor: pseudo("seo.competitor", "seo_competitors"), schema: pseudo("seo.schema", "seo_schemas"), page: pseudo("seo.page", "seo_pages") };
const keep = async (e: EntityDef, id: unknown, keys: string[]): Promise<Json> => {
  const cur = (await peek(e, String(id))) as Json | null;
  return Object.fromEntries(keys.filter((k) => cur && cur[k] !== undefined && cur[k] !== null).map((k) => [k, cur![k]]));
};

const TASK_FIELDS: FieldDef[] = [f.str("title", "Title", true), f.enum("type", "Type", TT), f.text("description", "Description"), f.enum("priority", "Priority", TP), f.enum("status", "Status", TS), f.str("assigneeId", "Assignee (workspace.user id)"), f.date("dueDate", "Due date"), f.str("url", "Page path (e.g. /pricing)"), f.str("issueId", "Related issue id")];
const KW_FIELDS: FieldDef[] = [f.str("keyword", "Keyword", true), f.str("intent", "Intent (informational, commercial, transactional, navigational)"), f.num("volume", "Monthly search volume"), f.num("difficulty", "Difficulty 0-100"), f.num("cpc", "CPC"), f.num("targetPosition", "Target position"), f.str("targetUrl", "Target page path"), f.str("country", "Country code (e.g. IN)"), f.str("language", "Language code (e.g. en)"), f.enum("device", "Device", ["desktop", "mobile"]), f.str("priority", "Priority (low/medium/high)"), f.str("status", "Status"), f.str("cluster", "Topic cluster"), f.ref("groupId", "Group (seo.keyword_group id)", "seo.keyword_group"), f.text("notes", "Notes")];

export const SEO_ACTIONS: ActionDef[] = [
  {
    key: "seo.run_audit", panel: "seo", label: "Run a website audit", description: "Crawl the website and update scores and issues. Takes up to a few minutes.", params: [], level: "any", allow: can("RUN_AUDIT"),
    run: async (_v, u) => {
      try {
        const run = await runCrawl({ trigger: "manual", actorId: u.id, actorEmail: u.email });
        if (run.status === "completed") await notifySeoUsers([u.id], { type: "seo_audit_completed", title: `Website audit finished — score ${run.scores?.overall ?? "—"}`, body: `${run.pagesCrawled} pages`, link: "/rankmax-ai/audit" } as never);
        return run.status === "completed" ? { ok: true, result: `Audit finished: ${run.pagesCrawled} pages, overall score ${run.scores?.overall ?? "—"}.`, runId: run._id } : fail(run.error ?? "The audit did not complete.");
      } catch (e) {
        return fail(e instanceof CrawlBusyError ? e.message : "The audit could not be started.");
      }
    },
  },
  act("seo.add_page", "Add a page to the inventory", "Track a page path (e.g. /pricing).", [f.str("path", "Path starting with /", true)], "CREATE", (v) => A.addPageAction(String(v.path)), "Page added."),
  act("seo.delete_page", "Remove a page from the inventory", "Remove a page (and its metadata override).", [f.ref("pageId", "Page id", "seo.page", true)], "DELETE", (v) => A.deletePageAction(String(v.pageId)), "Page removed.", true),
  act("seo.save_page_seo", "Set a page's SEO metadata", "Override the live title, meta description, canonical, robots and social tags, and set focus keywords. Empty fields fall back to the page's own code. (Send every field you want to keep.)", [f.ref("pageId", "Page id", "seo.page", true), f.str("title", "Meta title"), f.text("description", "Meta description"), f.str("canonical", "Canonical URL"), f.str("robots", "Robots (e.g. index,follow)"), f.str("focusKeyword", "Focus keyword"), f.str("secondaryKeywords", "Secondary keywords, comma separated"), f.text("notes", "Notes")], "MANAGE_ON_PAGE_SEO", async (v) => {
    const cur = await keep(E.page, v.pageId, ["focusKeyword", "notes"]);
    const o = ((await peek(E.page, String(v.pageId))) as Json | null)?.override as Json | undefined;
    const merged: Json = { title: o?.title, description: o?.description, canonical: o?.canonical, focusKeyword: cur.focusKeyword, notes: cur.notes, ...v };
    const { pageId, ...input } = merged;
    return A.savePageSeoAction(String(pageId ?? v.pageId), input);
  }, "Page metadata saved."),
  act("seo.request_indexing", "Ask Google to (re)index a page", "Send an Indexing API notice (officially for job-posting and livestream pages).", [f.ref("pageId", "Page id", "seo.page", true)], "MANAGE_TECHNICAL_SEO", (v) => A.requestIndexingAction(String(v.pageId)), "Indexing request sent."),
  act("seo.update_issue", "Update an SEO issue", "Change an issue's status, assignee or notes.", [f.ref("issueId", "Issue id", "seo.issue", true), f.enum("status", "Status", [...ISSUE_STATUSES] as string[]), f.str("assigneeId", "Assignee (workspace.user id)"), f.text("notes", "Notes")], "EDIT", (v) => A.updateIssueAction(String(v.issueId), { ...(v.status !== undefined ? { status: String(v.status) } : {}), ...(v.assigneeId !== undefined ? { assigneeId: str(v.assigneeId) } : {}), ...(v.notes !== undefined ? { notes: String(v.notes) } : {}) }), "Issue updated."),
  act("seo.bulk_issue_status", "Set the status of many issues", "Mark several issues fixed / ignored / in progress at once.", [f.list("issueIds", "Issue ids"), f.enum("status", "Status", [...ISSUE_STATUSES] as string[], true)], "EDIT", (v) => A.bulkIssueStatusAction((v.issueIds as string[]) ?? [], String(v.status)), "Issues updated."),
  act("seo.create_issue", "Add an SEO issue by hand", "Log a problem you found.", [f.str("title", "Title", true), f.str("path", "Page path (default /)"), f.enum("severity", "Severity", [...SEVERITIES] as string[]), f.enum("category", "Category", [...CATEGORIES] as string[]), f.text("description", "Description"), f.text("recommendation", "Recommended fix"), f.str("assigneeId", "Assignee (workspace.user id)")], "CREATE", (v) => A.createIssueAction(v), "Issue added."),
  act("seo.create_task", "Create an SEO task", "A work item; only managers can assign it to someone else.", TASK_FIELDS, "MANAGE_TASKS", (v) => A.createTaskAction(v), "Task created."),
  act("seo.create_task_from_issue", "Turn an issue into a task", "Create a task from an issue (moves the issue to in progress).", [f.ref("issueId", "Issue id", "seo.issue", true), f.str("title", "Task title (defaults from the issue)"), f.str("assigneeId", "Assignee"), f.date("dueDate", "Due date"), f.enum("priority", "Priority", TP)], "MANAGE_TASKS", (v) => { const { issueId, ...rest } = v; return A.createTaskFromIssueAction(String(issueId), rest); }, "Task created."),
  act("seo.update_task", "Edit an SEO task", "Change fields of a task (others stay as they are).", [f.ref("taskId", "Task id", "seo.task", true), ...TASK_FIELDS.map((p) => ({ ...p, required: false }))], "MANAGE_TASKS", async (v) => {
    const cur = await keep(E.task, v.taskId, TASK_FIELDS.map((p) => p.key));
    const { taskId, ...changes } = v;
    return A.updateTaskAction(String(taskId), { ...cur, ...changes });
  }, "Task updated."),
  act("seo.set_task_status", "Move an SEO task to another status", "To do / in progress / in review / done / cancelled.", [f.ref("taskId", "Task id", "seo.task", true), f.enum("status", "Status", TS, true)], "MANAGE_TASKS", (v) => A.setTaskStatusAction(String(v.taskId), String(v.status)), "Task updated."),
  act("seo.comment_task", "Comment on an SEO task", "Add a comment.", [f.ref("taskId", "Task id", "seo.task", true), f.text("text", "Comment", true)], "MANAGE_TASKS", (v) => A.addTaskCommentAction(String(v.taskId), String(v.text ?? "")), "Comment added."),
  act("seo.delete_task", "Delete an SEO task", "Delete a task.", [f.ref("taskId", "Task id", "seo.task", true)], "DELETE", (v) => A.deleteTaskAction(String(v.taskId)), "Task deleted.", true),
  act("seo.add_keyword", "Add a keyword to track", "Start tracking a keyword.", KW_FIELDS, "MANAGE_KEYWORDS", (v) => A.saveKeywordAction(null, v), "Keyword added."),
  act("seo.update_keyword", "Edit a tracked keyword", "Change fields of a keyword (others stay as they are).", [f.ref("keywordId", "Keyword id", "seo.keyword", true), ...KW_FIELDS.map((p) => ({ ...p, required: false }))], "MANAGE_KEYWORDS", async (v) => {
    const cur = await keep(E.keyword, v.keywordId, KW_FIELDS.map((p) => p.key));
    const { keywordId, ...changes } = v;
    return A.saveKeywordAction(String(keywordId), { ...cur, ...changes });
  }, "Keyword updated."),
  act("seo.delete_keyword", "Stop tracking a keyword", "Delete a keyword.", [f.ref("keywordId", "Keyword id", "seo.keyword", true)], "DELETE", (v) => A.deleteKeywordAction(String(v.keywordId)), "Keyword deleted.", true),
  act("seo.import_keywords", "Import keywords from CSV text", "Paste CSV text (header: keyword,volume,difficulty,…) to add many keywords.", [f.text("csv", "CSV text", true), f.str("source", "Source name (e.g. Semrush)")], "MANAGE_KEYWORDS", (v) => A.importKeywordsAction(String(v.csv ?? ""), String(v.source ?? "import")), "Keywords imported."),
  act("seo.save_keyword_group", "Create or edit a keyword group", "Group keywords.", [f.str("groupId", "Group id to edit (leave out to create)"), f.str("name", "Name", true), f.text("description", "Description"), f.str("color", "Colour (#rrggbb)")], "MANAGE_KEYWORDS", (v) => A.saveGroupAction(str(v.groupId), v), "Group saved."),
  act("seo.delete_keyword_group", "Delete a keyword group", "Delete a group.", [f.ref("groupId", "Group id", "seo.keyword_group", true)], "DELETE", (v) => A.deleteGroupAction(String(v.groupId)), "Group deleted.", true),
  act("seo.record_position", "Record a keyword's ranking position", "Enter the position you checked for a keyword on a date.", [f.ref("keywordId", "Keyword id", "seo.keyword", true), f.date("date", "Date", true), f.num("position", "Position (blank = not ranking)"), f.str("url", "Ranking URL")], "MANAGE_RANKINGS", (v) => A.recordPositionAction(String(v.keywordId), { date: String(v.date), position: String(v.position ?? ""), url: String(v.url ?? "") }), "Position recorded."),
  act("seo.import_rankings", "Import rankings from CSV text", "Paste CSV text of positions to import.", [f.text("csv", "CSV text", true)], "MANAGE_RANKINGS", (v) => A.importRankingsAction(String(v.csv ?? "")), "Rankings imported."),
  act("seo.add_backlink", "Record a backlink", "Add a link from another site.", [f.str("sourceUrl", "Source page URL", true), f.str("targetUrl", "Target page on your site", true), f.str("anchor", "Anchor text"), f.str("rel", "rel (follow, nofollow, sponsored, ugc)"), f.date("firstSeen", "First seen"), f.num("domainRating", "Domain rating"), f.text("notes", "Notes")], "MANAGE_BACKLINKS", (v) => A.saveBacklinkAction(null, v), "Backlink added."),
  act("seo.update_backlink", "Edit a backlink", "Change anchor, rel, domain rating, notes or target.", [f.ref("backlinkId", "Backlink id", "seo.backlink", true), f.str("anchor", "Anchor"), f.str("rel", "rel"), f.num("domainRating", "Domain rating"), f.text("notes", "Notes"), f.str("targetUrl", "Target URL")], "MANAGE_BACKLINKS", async (v) => {
    const cur = await keep(E.backlink, v.backlinkId, ["anchor", "rel", "domainRating", "notes", "targetUrl"]);
    const { backlinkId, ...changes } = v;
    return A.saveBacklinkAction(String(backlinkId), { ...cur, ...changes });
  }, "Backlink updated."),
  act("seo.delete_backlink", "Delete a backlink record", "Delete a backlink.", [f.ref("backlinkId", "Backlink id", "seo.backlink", true)], "DELETE", (v) => A.deleteBacklinkAction(String(v.backlinkId)), "Backlink deleted.", true),
  act("seo.save_competitor", "Add or edit a competitor", "Competitor name, domain and optional metrics.", [f.str("competitorId", "Competitor id to edit (leave out to add)"), f.str("name", "Name", true), f.str("domain", "Domain", true), f.str("color", "Colour"), f.text("notes", "Notes"), f.num("organicKeywords", "Organic keywords"), f.num("organicTraffic", "Organic traffic"), f.num("backlinks", "Backlinks"), f.num("referringDomains", "Referring domains"), f.num("domainRating", "Domain rating")], "MANAGE_COMPETITORS", (v) => A.saveCompetitorAction(str(v.competitorId), v), "Competitor saved."),
  act("seo.delete_competitor", "Delete a competitor", "Delete a competitor.", [f.ref("competitorId", "Competitor id", "seo.competitor", true)], "DELETE", (v) => A.deleteCompetitorAction(String(v.competitorId)), "Competitor deleted.", true),
  act("seo.save_schema", "Create or edit structured data (JSON-LD)", "A schema.org block for a page (path) or all pages (*). It is validated and stays a draft until published.", [f.str("schemaId", "Schema id to edit (leave out to create)"), f.str("name", "Name", true), f.str("type", "Schema type (e.g. Organization, FAQPage)", true), f.str("path", "Page path, or * for all", true), f.text("source", "JSON-LD source", true)], "MANAGE_SCHEMA", async (v) => A.saveSchemaAction(str(v.schemaId), v), "Schema saved."),
  act("seo.set_schema_status", "Publish, unpublish or disable structured data", "Set a schema block to published, draft or disabled.", [f.ref("schemaId", "Schema id", "seo.schema", true), f.enum("status", "Status", ["published", "draft", "disabled"], true)], "MANAGE_SCHEMA", (v) => A.setSchemaStatusAction(String(v.schemaId), String(v.status)), "Schema status changed.", true),
  act("seo.delete_schema", "Delete structured data", "Delete a schema block.", [f.ref("schemaId", "Schema id", "seo.schema", true)], "DELETE", (v) => A.deleteSchemaAction(String(v.schemaId)), "Schema deleted.", true),
  act("seo.publish_robots", "Publish robots.txt", "Publish new robots.txt content (leave `content` out to revert to the code default). Blocking everything needs confirmBlockAll.", [f.text("content", "robots.txt content"), f.bool("confirmBlockAll", "I confirm blocking the whole site"), f.str("note", "Change note")], "MANAGE_ROBOTS", (v) => A.publishRobotsAction(v.content === undefined ? null : String(v.content), { confirmBlockAll: v.confirmBlockAll === true, note: String(v.note ?? "") }), "robots.txt published.", true),
  act("seo.submit_sitemap", "Submit the sitemap to Google Search Console", "Send the sitemap URL to Search Console.", [f.str("url", "Sitemap URL", true)], "MANAGE_SITEMAP", (v) => A.submitSitemapAction(String(v.url)), "Sitemap submitted."),
  act("seo.test_integration", "Test the Search Console or Analytics connection", "Check that the integration works.", [f.enum("which", "Which", ["gsc", "ga4"], true)], "MANAGE_INTEGRATIONS", (v) => A.testIntegrationAction(v.which as "gsc"), "Tested."),
  act("seo.save_sitemap_settings", "Change a page's sitemap settings", "Include/exclude the page, change frequency and priority for the sitemap (send the full sitemap override).", [f.ref("pageId", "SEO page id", "seo.page", true), f.json("sitemap", "Sitemap settings, e.g. {include, changefreq, priority}", true)], "MANAGE_SITEMAP", (v) => A.saveSitemapSettingsAction(String(v.pageId), (v.sitemap as Json) ?? {}), "Sitemap settings saved."),
  act("seo.import_backlinks", "Import backlinks from CSV text", "Paste the CSV contents (with a header row) of a backlink export; rows are created or updated.", [f.text("csv", "CSV contents", true), f.str("source", "Where it came from, e.g. ahrefs")], "MANAGE_BACKLINKS", (v) => A.importBacklinksAction(String(v.csv ?? ""), String(v.source ?? "import")), "Backlinks imported.", true),
  act("seo.import_competitor_rankings", "Import a competitor's rankings from CSV text", "CSV contents with keyword, position, url, date columns.", [f.ref("competitorId", "Competitor id", "seo.competitor", true), f.text("csv", "CSV contents", true), f.str("source", "Where it came from")], "MANAGE_COMPETITORS", (v) => A.importCompetitorRankingsAction(String(v.competitorId), String(v.csv ?? ""), String(v.source ?? "import")), "Rankings imported.", true),
  act("seo.record_competitor_position", "Record a competitor's position for a keyword", "One data point: keyword, position (blank = not ranking), url and date.", [f.ref("competitorId", "Competitor id", "seo.competitor", true), f.str("keyword", "Keyword", true), f.str("position", "Position (blank = not ranking)"), f.str("url", "Ranking URL"), f.date("date", "Date")], "MANAGE_COMPETITORS", (v) => A.recordCompetitorPositionAction(String(v.competitorId), { keyword: v.keyword, position: v.position ?? "", url: v.url ?? "", date: v.date ?? "" }), "Position recorded."),
];

export const SEO_REPORTS: ReportDef[] = [
  { key: "seo.dashboard", panel: "seo", label: "SEO dashboard numbers", description: "Scores, issues, keyword positions, traffic and tasks at a glance.", level: "any", allow: can("VIEW"), params: [], run: async (_v, u) => (await getDashboard(u.id)) as unknown as Json },
  { key: "seo.issue_stats", panel: "seo", label: "Issue statistics", description: "Open issues by severity, category and status.", level: "any", allow: can("VIEW"), params: [], run: async () => (await issueStats()) as unknown as Json },
  { key: "seo.task_stats", panel: "seo", label: "Task statistics", description: "SEO tasks by status and priority (add mine=true for just yours).", level: "any", allow: can("VIEW"), params: [f.bool("mine", "Only my tasks")], run: async (v, u) => (await taskStats(v.mine === true ? u.id : undefined)) as unknown as Json },
  { key: "seo.cannibalization", panel: "seo", label: "Keyword cannibalisation", description: "Keywords where several of your pages compete for the same term.", level: "any", allow: can("VIEW"), params: [], run: async () => ({ cases: await detectCannibalization() }) as unknown as Json },
];
void seoViewer; void TT;
