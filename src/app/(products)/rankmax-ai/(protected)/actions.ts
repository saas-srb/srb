"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { getCurrentSeoUser } from "@/lib/seo-auth";
import { signOutThisDevice } from "@/lib/security/sessions";
import { notifyGoogleIndexing } from "@/lib/google-indexing";
import type { SeoPermission } from "@/lib/seo-roles";
import { requireViewer, can, ForbiddenError, SeoInputError, type SeoViewer } from "@/lib/products/rankmax-ai/viewer";
import { recordAudit, diffSummary } from "@/lib/products/rankmax-ai/audit";
import { markSeoNotificationsRead, notifySeoUsers } from "@/lib/products/rankmax-ai/notifications";
import { addManualPage, cleanOverride, cleanSitemapOverride, deletePage, getPage, savePageSeo } from "@/lib/products/rankmax-ai/pages";
import { createManualIssue, getIssue, updateIssue } from "@/lib/products/rankmax-ai/issues";
import { CATEGORIES, ISSUE_STATUSES, SEVERITIES, type Category, type IssueStatus, type Severity } from "@/lib/products/rankmax-ai/checks";
import { addTaskComment, createTask, deleteTask, setTaskStatus, taskTypeForCheck, TASK_STATUSES, updateTask, type TaskInput, type TaskStatus } from "@/lib/products/rankmax-ai/tasks";
import { createKeyword, deleteGroup, deleteKeyword, importKeywords, updateKeyword, upsertGroup, type KeywordInput } from "@/lib/products/rankmax-ai/keywords";
import { importRankings, recordManualPosition } from "@/lib/products/rankmax-ai/rankings";
import { createBacklink, deleteBacklink, importBacklinks, updateBacklink } from "@/lib/products/rankmax-ai/backlinks";
import { deleteCompetitor, importCompetitorRankings, recordCompetitorPosition, upsertCompetitor } from "@/lib/products/rankmax-ai/competitors";
import { deleteSchema, saveSchema, setSchemaStatus } from "@/lib/products/rankmax-ai/schema";
import { publishRobots } from "@/lib/products/rankmax-ai/robots-store";
import { cleanOrigin, getSettings, saveSettings, type SeoSettings } from "@/lib/products/rankmax-ai/settings";
import { testSearchConsole, submitSitemap } from "@/lib/products/rankmax-ai/integrations/gsc";
import { testAnalytics } from "@/lib/products/rankmax-ai/integrations/ga4";
import { isBillingLimitError, writeBlockReason } from "@/lib/platform/billing/enforce";

/**
 * Every SEO mutation. Each action resolves the viewer from the SESSION COOKIE
 * (never from arguments), re-checks the specific permission here, and
 * returns `{ ok:false, error }` for expected failures so the client can show
 * the message. Changes that reach the live site revalidate it (see pages.ts).
 */

type Fail = { ok: false; error: string };
type Ok<T = object> = { ok: true } & T;
const SESSION_EXPIRED: Fail = { ok: false, error: "Your session has expired — please sign in again." };

async function run<T extends object>(permission: SeoPermission | SeoPermission[], fn: (v: SeoViewer) => Promise<T>): Promise<Ok<T> | Fail> {
  let v: SeoViewer;
  try {
    v = await requireViewer();
  } catch {
    return SESSION_EXPIRED;
  }
  const perms = Array.isArray(permission) ? permission : [permission];
  if (!perms.some((p) => can(v, p))) return { ok: false, error: "You don't have permission to do that." };
  const readOnly = await writeBlockReason();
  if (readOnly) return { ok: false, error: readOnly };
  try {
    const out = await fn(v);
    revalidatePath("/rankmax-ai", "layout");
    return { ok: true, ...out };
  } catch (err) {
    if (err instanceof SeoInputError || isBillingLimitError(err)) return { ok: false, error: err.message };
    if (err instanceof ForbiddenError) return { ok: false, error: "You don't have permission to do that." };
    console.error("[seo action]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const s = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");

/** Logs out of EVERY product (single sign-off), like every other product. */
export async function seoLogoutAction(): Promise<void> {
  const user = await getCurrentSeoUser();
  if (user && ObjectId.isValid(user.id)) await signOutThisDevice(new ObjectId(user.id));
  redirect("/commandos/login");
}

export async function markNotificationsReadAction(ids?: string[]) {
  const v = await requireViewer().catch(() => null);
  if (!v) return;
  await markSeoNotificationsRead(v.userId, ids?.filter((i) => typeof i === "string"));
  revalidatePath("/rankmax-ai", "layout");
}

// ── Pages / on-page ───────────────────────────────────────────────────────

export async function addPageAction(path: string) {
  return run("CREATE", async (v) => {
    const page = await addManualPage(s(path), v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "page", entityId: page._id, entityLabel: page.path, path: page.path, summary: "Added to the page inventory" });
    return { id: page._id };
  });
}

export async function deletePageAction(id: string) {
  return run("DELETE", async (v) => {
    const page = await deletePage(s(id, 60));
    if (!page) throw new SeoInputError("Page not found.");
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "page", entityId: page._id, entityLabel: page.path, path: page.path, summary: page.override ? "Removed, including its live metadata override" : "Removed from inventory" });
    return {};
  });
}

/** Saves the live metadata override + focus keywords for a page. Empty fields fall back to the page's own code. */
export async function savePageSeoAction(id: string, input: Record<string, unknown>) {
  return run("MANAGE_ON_PAGE_SEO", async (v) => {
    const override = cleanOverride(input);
    const focusKeyword = s(input.focusKeyword, 120).trim();
    const secondaryKeywords = s(input.secondaryKeywords, 1000).split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20);
    const { before, after } = await savePageSeo(s(id, 60), { override, focusKeyword, secondaryKeywords, notes: s(input.notes, 2000) }, v.userId);
    const flat = (o: typeof override) => ({
      title: o?.title,
      description: o?.description,
      canonical: o?.canonical,
      robots: o?.robots ? `${o.robots.index ? "index" : "noindex"},${o.robots.follow ? "follow" : "nofollow"}` : undefined,
      keywords: o?.keywords,
      og: o?.og,
      twitter: o?.twitter,
    });
    const summary =
      diffSummary(
        { ...flat(before.override), focusKeyword: before.focusKeyword, secondaryKeywords: before.secondaryKeywords },
        { ...flat(after.override), focusKeyword: after.focusKeyword, secondaryKeywords: after.secondaryKeywords },
        ["title", "description", "canonical", "robots", "keywords", "og", "twitter", "focusKeyword", "secondaryKeywords"]
      ) ?? "No changes";
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "metadata", entityId: before._id, entityLabel: before.path, path: before.path, summary, metadata: { before: before.override, after: after.override } });
    return {};
  });
}

export async function saveSitemapSettingsAction(id: string, input: Record<string, unknown>) {
  return run("MANAGE_SITEMAP", async (v) => {
    const sitemap = cleanSitemapOverride(input);
    const { before, after } = await savePageSeo(s(id, 60), { sitemap }, v.userId);
    await recordAudit({
      actorId: v.userId,
      actorEmail: v.email,
      action: "update",
      entity: "sitemap",
      entityId: before._id,
      entityLabel: before.path,
      path: before.path,
      summary: diffSummary({ ...(before.sitemap ?? {}) }, { ...(after.sitemap ?? {}) }, ["exclude", "priority", "changeFrequency"]) ?? "No changes",
    });
    return {};
  });
}

/** Google Indexing API notice (officially supported for JobPosting / livestream pages; Google may ignore others). */
export async function requestIndexingAction(id: string) {
  return run("MANAGE_TECHNICAL_SEO", async (v) => {
    const page = await getPage(s(id, 60));
    if (!page) throw new SeoInputError("Page not found.");
    const res = await notifyGoogleIndexing(`${await companySiteUrl()}${page.path === "/" ? "" : page.path}`, "URL_UPDATED");
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "notify", entity: "page", entityId: page._id, entityLabel: page.path, path: page.path, summary: res.success ? "Indexing API: URL_UPDATED sent" : `Indexing API failed: ${res.message}` });
    if (!res.success) throw new SeoInputError(res.message ?? "The Indexing API request failed.");
    return { message: res.message ?? "Sent" };
  });
}

// ── Issues ────────────────────────────────────────────────────────────────

export async function updateIssueAction(id: string, input: { status?: string; assigneeId?: string | null; notes?: string }) {
  return run("EDIT", async (v) => {
    const patch: { status?: IssueStatus; assigneeId?: string | null; notes?: string } = {};
    if (input.status !== undefined) {
      if (!(ISSUE_STATUSES as readonly string[]).includes(input.status)) throw new SeoInputError("Unknown status.");
      patch.status = input.status as IssueStatus;
    }
    if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId ? s(input.assigneeId, 60) : null;
    if (input.notes !== undefined) patch.notes = s(input.notes, 4000);
    const res = await updateIssue(s(id, 60), patch, v.userId);
    if (!res) throw new SeoInputError("Issue not found.");
    const summary = diffSummary({ ...res.before }, { ...res.after }, ["status", "assigneeId", "notes"]);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: patch.assigneeId !== undefined && patch.assigneeId !== res.before.assigneeId ? "assign" : "status", entity: "issue", entityId: res.before._id, entityLabel: res.before.title, path: res.before.path, summary });
    if (patch.assigneeId && patch.assigneeId !== res.before.assigneeId && patch.assigneeId !== v.userId) {
      await notifySeoUsers([patch.assigneeId], { type: "seo_issue_assigned", title: `SEO issue assigned: ${res.before.title}`, body: res.before.path, link: `/rankmax-ai/issues/${res.before._id}` });
    }
    return {};
  });
}

export async function bulkIssueStatusAction(ids: string[], status: string) {
  return run("EDIT", async (v) => {
    if (!(ISSUE_STATUSES as readonly string[]).includes(status)) throw new SeoInputError("Unknown status.");
    let n = 0;
    for (const id of ids.slice(0, 500)) {
      const res = await updateIssue(s(id, 60), { status: status as IssueStatus }, v.userId);
      if (res) n++;
    }
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "status", entity: "issue", entityId: "bulk", entityLabel: `${n} issues`, summary: `Set ${n} issue(s) to ${status}` });
    return { updated: n };
  });
}

export async function createIssueAction(input: Record<string, unknown>) {
  return run("CREATE", async (v) => {
    const title = s(input.title, 200).trim();
    const path = s(input.path, 500).trim() || "/";
    if (!title) throw new SeoInputError("Title is required.");
    if (!path.startsWith("/")) throw new SeoInputError("URL must be a site path starting with “/”.");
    const severity = (SEVERITIES as readonly string[]).includes(String(input.severity)) ? (input.severity as Severity) : "medium";
    const category = (CATEGORIES as readonly string[]).includes(String(input.category)) ? (input.category as Category) : "technical";
    const issue = await createManualIssue({ title, path, severity, category, description: s(input.description, 4000), recommendation: s(input.recommendation, 4000), assigneeId: s(input.assigneeId, 60) || null }, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "issue", entityId: issue._id, entityLabel: issue.title, path: issue.path, summary: `Manual ${severity} issue` });
    if (issue.assigneeId && issue.assigneeId !== v.userId) await notifySeoUsers([issue.assigneeId], { type: "seo_issue_assigned", title: `SEO issue assigned: ${issue.title}`, body: issue.path, link: `/rankmax-ai/issues/${issue._id}` });
    return { id: issue._id };
  });
}

// ── Tasks ─────────────────────────────────────────────────────────────────

function taskInput(input: Record<string, unknown>): TaskInput {
  return {
    title: s(input.title, 200),
    type: s(input.type, 40),
    description: s(input.description, 5000),
    priority: s(input.priority, 20),
    status: s(input.status, 20),
    assigneeId: s(input.assigneeId, 60),
    dueDate: s(input.dueDate, 10),
    url: s(input.url, 500),
    issueId: s(input.issueId, 60),
  };
}

export async function createTaskAction(input: Record<string, unknown>) {
  return run("MANAGE_TASKS", async (v) => {
    const data = taskInput(input);
    if (!v.isManagerTier && data.assigneeId && data.assigneeId !== v.userId) throw new SeoInputError("Only an SEO manager can assign a task to someone else.");
    const task = await createTask(data, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "task", entityId: task._id, entityLabel: `${task.code} ${task.title}`, path: task.url, summary: `${task.type} · ${task.priority}` });
    if (task.assigneeId && task.assigneeId !== v.userId) await notifySeoUsers([task.assigneeId], { type: "seo_task_assigned", title: `${task.code}: ${task.title}`, body: task.dueDate ? `Due ${task.dueDate}` : undefined, link: `/rankmax-ai/tasks/${task._id}` });
    return { id: task._id, code: task.code };
  });
}

export async function createTaskFromIssueAction(issueId: string, input: Record<string, unknown>) {
  return run("MANAGE_TASKS", async (v) => {
    const issue = await getIssue(s(issueId, 60));
    if (!issue) throw new SeoInputError("Issue not found.");
    const data = taskInput({ ...input, issueId: issue._id, url: issue.path, type: input.type || taskTypeForCheck(issue.checkId), title: input.title || `${issue.title} — ${issue.path}`, description: input.description || `${issue.description}\n\nRecommendation: ${issue.recommendation}${issue.details.length ? `\n\nDetails:\n- ${issue.details.join("\n- ")}` : ""}` });
    if (!v.isManagerTier && data.assigneeId && data.assigneeId !== v.userId) throw new SeoInputError("Only an SEO manager can assign a task to someone else.");
    const task = await createTask(data, v.userId);
    if (issue.status === "open") await updateIssue(issue._id, { status: "in_progress", ...(task.assigneeId && !issue.assigneeId ? { assigneeId: task.assigneeId } : {}) }, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "task", entityId: task._id, entityLabel: `${task.code} ${task.title}`, path: task.url, summary: `Created from issue "${issue.title}"` });
    if (task.assigneeId && task.assigneeId !== v.userId) await notifySeoUsers([task.assigneeId], { type: "seo_task_assigned", title: `${task.code}: ${task.title}`, link: `/rankmax-ai/tasks/${task._id}` });
    return { id: task._id, code: task.code };
  });
}

export async function updateTaskAction(id: string, input: Record<string, unknown>) {
  return run("MANAGE_TASKS", async (v) => {
    const { before, after } = await updateTask(s(id, 60), taskInput(input), v);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "task", entityId: before._id, entityLabel: `${before.code} ${after.title}`, path: after.url, summary: diffSummary({ ...before }, { ...after }, ["title", "type", "priority", "status", "assigneeId", "dueDate", "url"]) });
    if (after.assigneeId && after.assigneeId !== before.assigneeId && after.assigneeId !== v.userId) await notifySeoUsers([after.assigneeId], { type: "seo_task_assigned", title: `${after.code}: ${after.title}`, link: `/rankmax-ai/tasks/${after._id}` });
    return {};
  });
}

export async function setTaskStatusAction(id: string, status: string) {
  return run("MANAGE_TASKS", async (v) => {
    if (!(status in TASK_STATUSES)) throw new SeoInputError("Unknown status.");
    const { before, after } = await setTaskStatus(s(id, 60), status as TaskStatus, v);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "status", entity: "task", entityId: before._id, entityLabel: `${before.code} ${before.title}`, path: before.url, summary: `status: ${before.status} → ${after.status}` });
    const watchers = [before.createdBy, before.assigneeId].filter((x): x is string => !!x && x !== v.userId);
    if (watchers.length) await notifySeoUsers(watchers, { type: "seo_task_updated", title: `${before.code} is now ${TASK_STATUSES[after.status]}`, body: before.title, link: `/rankmax-ai/tasks/${before._id}` });
    return {};
  });
}

export async function addTaskCommentAction(id: string, text: string) {
  return run("MANAGE_TASKS", async (v) => {
    const task = await addTaskComment(s(id, 60), s(text, 2000), v);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "comment", entity: "task", entityId: task._id, entityLabel: `${task.code} ${task.title}`, path: task.url, summary: s(text, 140) });
    const watchers = [task.createdBy, task.assigneeId].filter((x): x is string => !!x && x !== v.userId);
    if (watchers.length) await notifySeoUsers(watchers, { type: "seo_task_updated", title: `New comment on ${task.code}`, body: s(text, 140), link: `/rankmax-ai/tasks/${task._id}` });
    return {};
  });
}

export async function deleteTaskAction(id: string) {
  return run("DELETE", async (v) => {
    const t = await deleteTask(s(id, 60));
    if (!t) throw new SeoInputError("Task not found.");
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "task", entityId: t._id, entityLabel: `${t.code} ${t.title}`, path: t.url });
    return {};
  });
}

// ── Keywords & rankings ───────────────────────────────────────────────────

function keywordInput(input: Record<string, unknown>): KeywordInput {
  return {
    keyword: s(input.keyword, 200),
    intent: s(input.intent, 30),
    volume: input.volume,
    difficulty: input.difficulty,
    cpc: input.cpc,
    competition: input.competition,
    targetPosition: input.targetPosition,
    targetUrl: s(input.targetUrl, 500),
    country: s(input.country, 2),
    language: s(input.language, 5),
    device: s(input.device, 10),
    engine: s(input.engine, 30),
    priority: s(input.priority, 20),
    status: s(input.status, 20),
    type: s(input.type, 20),
    groupId: s(input.groupId, 60),
    cluster: s(input.cluster, 100),
    relatedKeywords: s(input.relatedKeywords, 2000),
    assigneeId: s(input.assigneeId, 60),
    notes: s(input.notes, 2000),
    metricsSource: s(input.metricsSource, 60),
  };
}

export async function saveKeywordAction(id: string | null, input: Record<string, unknown>) {
  return run("MANAGE_KEYWORDS", async (v) => {
    const defaults = (await getSettings()).defaults;
    if (id) {
      const { before, after } = await updateKeyword(s(id, 60), keywordInput(input), defaults, v.userId);
      await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "keyword", entityId: before._id, entityLabel: after.keyword, path: after.targetUrl || null, summary: diffSummary({ ...before }, { ...after }, ["keyword", "intent", "volume", "difficulty", "cpc", "competition", "targetUrl", "targetPosition", "country", "device", "priority", "status", "type", "groupId", "cluster", "assigneeId"]) });
      return { id: before._id };
    }
    const kw = await createKeyword(keywordInput(input), defaults, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "keyword", entityId: kw._id, entityLabel: kw.keyword, path: kw.targetUrl || null, summary: `${kw.country} · ${kw.device} · ${kw.priority}` });
    return { id: kw._id };
  });
}

export async function deleteKeywordAction(id: string) {
  return run("DELETE", async (v) => {
    const kw = await deleteKeyword(s(id, 60));
    if (!kw) throw new SeoInputError("Keyword not found.");
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "keyword", entityId: kw._id, entityLabel: kw.keyword, summary: "Deleted with its ranking history" });
    return {};
  });
}

export async function importKeywordsAction(csv: string, source: string) {
  return run("MANAGE_KEYWORDS", async (v) => {
    if (csv.length > 2_000_000) throw new SeoInputError("File is too large (max 2 MB).");
    const res = await importKeywords(csv, (await getSettings()).defaults, s(source, 60).trim() || "import", v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "import", entity: "keyword", entityId: "import", entityLabel: `CSV (${s(source, 60) || "import"})`, summary: `${res.created} created, ${res.updated} updated, ${res.failed} failed` });
    return res;
  });
}

export async function saveGroupAction(id: string | null, input: Record<string, unknown>) {
  return run("MANAGE_KEYWORDS", async (v) => {
    const g = await upsertGroup(id ? s(id, 60) : null, { name: s(input.name, 80), description: s(input.description, 500), color: s(input.color, 7) }, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: id ? "update" : "create", entity: "keyword_group", entityId: g._id, entityLabel: g.name });
    return { id: g._id };
  });
}

export async function deleteGroupAction(id: string) {
  return run(["DELETE", "MANAGE_KEYWORDS"], async (v) => {
    if (!can(v, "DELETE")) throw new ForbiddenError("DELETE");
    const g = await deleteGroup(s(id, 60));
    if (!g) throw new SeoInputError("Group not found.");
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "keyword_group", entityId: g._id, entityLabel: g.name, summary: "Its keywords were ungrouped" });
    return {};
  });
}

export async function recordPositionAction(keywordId: string, input: { date: string; position: string; url: string }) {
  return run("MANAGE_RANKINGS", async (v) => {
    const kw = await recordManualPosition(s(keywordId, 60), { date: s(input.date, 10), position: s(input.position, 12), url: s(input.url, 500) });
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "ranking", entityId: kw._id, entityLabel: kw.keyword, summary: `${s(input.date, 10)}: position ${s(input.position, 12) || "not ranking"}` });
    return {};
  });
}

export async function importRankingsAction(csv: string) {
  return run("MANAGE_RANKINGS", async (v) => {
    if (csv.length > 4_000_000) throw new SeoInputError("File is too large (max 4 MB).");
    const res = await importRankings(csv);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "import", entity: "ranking", entityId: "import", entityLabel: "Rank CSV", summary: `${res.imported} rows for ${res.keywords} keywords, ${res.failed} failed` });
    return res;
  });
}

// ── Backlinks ─────────────────────────────────────────────────────────────

export async function saveBacklinkAction(id: string | null, input: Record<string, unknown>) {
  return run("MANAGE_BACKLINKS", async (v) => {
    if (id) {
      const { before, after } = await updateBacklink(s(id, 60), { anchor: s(input.anchor, 300), rel: s(input.rel, 20), domainRating: input.domainRating, notes: s(input.notes, 2000), targetUrl: s(input.targetUrl, 500) }, v.userId);
      await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "update", entity: "backlink", entityId: before._id, entityLabel: before.sourceUrl, path: after.targetPath, summary: diffSummary({ ...before }, { ...after }, ["anchor", "rel", "domainRating", "targetPath"]) });
      return { id: before._id };
    }
    const b = await createBacklink({ sourceUrl: s(input.sourceUrl, 1000), targetUrl: s(input.targetUrl, 500), anchor: s(input.anchor, 300), rel: s(input.rel, 20), firstSeen: s(input.firstSeen, 10), domainRating: input.domainRating, notes: s(input.notes, 2000) }, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "backlink", entityId: b._id, entityLabel: b.sourceUrl, path: b.targetPath });
    return { id: b._id };
  });
}

export async function deleteBacklinkAction(id: string) {
  return run("DELETE", async (v) => {
    const b = await deleteBacklink(s(id, 60));
    if (!b) throw new SeoInputError("Backlink not found.");
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "backlink", entityId: b._id, entityLabel: b.sourceUrl, path: b.targetPath });
    return {};
  });
}

export async function importBacklinksAction(csv: string, source: string) {
  return run("MANAGE_BACKLINKS", async (v) => {
    if (csv.length > 4_000_000) throw new SeoInputError("File is too large (max 4 MB).");
    const res = await importBacklinks(csv, s(source, 60).trim() || "import", v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "import", entity: "backlink", entityId: "import", entityLabel: `CSV (${s(source, 60) || "import"})`, summary: `${res.created} created, ${res.updated} updated, ${res.failed} failed` });
    return res;
  });
}

// ── Competitors ───────────────────────────────────────────────────────────

export async function saveCompetitorAction(id: string | null, input: Record<string, unknown>) {
  return run("MANAGE_COMPETITORS", async (v) => {
    const metrics = Object.fromEntries(["organicKeywords", "rankingKeywords", "organicTraffic", "backlinks", "referringDomains", "domainRating", "source", "asOf"].map((k) => [k, input[k]]));
    const hasMetrics = Object.values(metrics).some((x) => x !== undefined && x !== "");
    const { before, after } = await upsertCompetitor(id ? s(id, 60) : null, { name: s(input.name, 100), domain: s(input.domain, 200), color: s(input.color, 7), notes: s(input.notes, 2000), metrics: hasMetrics || id ? metrics : undefined, topPages: s(input.topPages, 20000) }, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: before ? "update" : "create", entity: "competitor", entityId: after._id, entityLabel: `${after.name} (${after.domain})`, summary: before ? diffSummary({ ...before.metrics, name: before.name, domain: before.domain }, { ...after.metrics, name: after.name, domain: after.domain }, ["name", "domain", "organicKeywords", "organicTraffic", "backlinks", "referringDomains", "domainRating", "source"]) : "Added" });
    return { id: after._id };
  });
}

export async function deleteCompetitorAction(id: string) {
  return run("DELETE", async (v) => {
    const c = await deleteCompetitor(s(id, 60));
    if (!c) throw new SeoInputError("Competitor not found.");
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "competitor", entityId: c._id, entityLabel: `${c.name} (${c.domain})` });
    return {};
  });
}

export async function importCompetitorRankingsAction(id: string, csv: string, source: string) {
  return run("MANAGE_COMPETITORS", async (v) => {
    if (csv.length > 4_000_000) throw new SeoInputError("File is too large (max 4 MB).");
    const res = await importCompetitorRankings(s(id, 60), csv, s(source, 60).trim() || "import");
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "import", entity: "competitor", entityId: s(id, 60), entityLabel: "Competitor positions CSV", summary: `${res.imported} rows` });
    return res;
  });
}

export async function recordCompetitorPositionAction(id: string, input: Record<string, unknown>) {
  return run("MANAGE_COMPETITORS", async (v) => {
    await recordCompetitorPosition(s(id, 60), { keyword: s(input.keyword, 200), position: s(input.position, 12), url: s(input.url, 500), date: s(input.date, 10) });
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "create", entity: "competitor", entityId: s(id, 60), entityLabel: s(input.keyword, 200), summary: `Position ${s(input.position, 12) || "not ranking"}` });
    return {};
  });
}

// ── Schema ────────────────────────────────────────────────────────────────

export async function saveSchemaAction(id: string | null, input: Record<string, unknown>) {
  return run("MANAGE_SCHEMA", async (v) => {
    const { before, after } = await saveSchema(id ? s(id, 60) : null, { name: s(input.name, 120), type: s(input.type, 40), path: s(input.path, 500), source: s(input.source, 100_000) }, v.userId);
    await recordAudit({
      actorId: v.userId,
      actorEmail: v.email,
      action: before ? "update" : "create",
      entity: "schema",
      entityId: after._id,
      entityLabel: after.name,
      path: after.path === "*" ? null : after.path,
      summary: `${after.type} · ${after.validation.errors.length} error(s)${before?.status === "published" && after.status === "draft" ? " · unpublished because it no longer validates" : ""}`,
    });
    return { id: after._id, errors: after.validation.errors.length };
  });
}

export async function setSchemaStatusAction(id: string, status: string) {
  return run("MANAGE_SCHEMA", async (v) => {
    if (!["published", "draft", "disabled"].includes(status)) throw new SeoInputError("Unknown status.");
    const sc = await setSchemaStatus(s(id, 60), status as "published" | "draft" | "disabled", v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: status === "published" ? "publish" : "unpublish", entity: "schema", entityId: sc._id, entityLabel: sc.name, path: sc.path === "*" ? null : sc.path, summary: `${sc.type} → ${status}` });
    return {};
  });
}

export async function deleteSchemaAction(id: string) {
  return run("DELETE", async (v) => {
    const sc = await deleteSchema(s(id, 60));
    if (!sc) throw new SeoInputError("Schema not found.");
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "delete", entity: "schema", entityId: sc._id, entityLabel: sc.name, path: sc.path === "*" ? null : sc.path, summary: sc.status === "published" ? "Removed from the live site" : undefined });
    return {};
  });
}

// ── Robots.txt ────────────────────────────────────────────────────────────

export async function publishRobotsAction(content: string | null, opts: { confirmBlockAll?: boolean; note?: string }) {
  return run("MANAGE_ROBOTS", async (v) => {
    const res = await publishRobots(content === null ? null : s(content, 600_000), { actorId: v.userId, actorEmail: v.email, confirmBlockAll: !!opts.confirmBlockAll, note: s(opts.note, 200) });
    await recordAudit({
      actorId: v.userId,
      actorEmail: v.email,
      action: "publish",
      entity: "robots",
      entityId: "robots",
      entityLabel: "robots.txt",
      path: "/robots.txt",
      summary: content === null ? "Reverted to the code default" : s(opts.note, 200) || "Published a new version",
      metadata: { before: res.before, after: res.after },
    });
    return {};
  });
}

// ── Settings & integrations ───────────────────────────────────────────────

export async function saveSettingsAction(input: Record<string, unknown>) {
  return run("MANAGE_INTEGRATIONS", async (v) => {
    const cur = await getSettings();
    const n = (x: unknown, min: number, max: number, fallback: number) => {
      const val = Number(x);
      return Number.isFinite(val) ? Math.min(Math.max(Math.round(val), min), max) : fallback;
    };
    const siteUrl = await companySiteUrl();
    const origin = cleanOrigin(s(input.siteOrigin, 300));
    if (!origin) throw new SeoInputError(`Site origin must be an http(s) URL, e.g. ${siteUrl}.`);
    const property = s(input.gscProperty, 300).trim();
    if (property && !/^(sc-domain:[a-z0-9.-]+|https?:\/\/[^\s]+\/)$/i.test(property)) throw new SeoInputError(`Search Console property must look like "sc-domain:${new URL(siteUrl).hostname}" or "${siteUrl}/".`);
    const ga4 = s(input.ga4PropertyId, 30).trim();
    if (ga4 && !/^\d+$/.test(ga4)) throw new SeoInputError("GA4 property id is numeric (Admin → Property settings).");
    const freq = ["off", "daily", "weekly"].includes(String(input.auditFrequency)) ? (input.auditFrequency as SeoSettings["schedule"]["auditFrequency"]) : cur.schedule.auditFrequency;
    const next: SeoSettings = {
      ...cur,
      siteOrigin: origin,
      crawl: {
        maxPages: n(input.maxPages, 10, 2000, cur.crawl.maxPages),
        concurrency: n(input.concurrency, 1, 10, cur.crawl.concurrency),
        timeoutMs: n(input.timeoutMs, 3000, 60000, cur.crawl.timeoutMs),
        checkExternalLinks: input.checkExternalLinks === true,
        maxExternalChecks: n(input.maxExternalChecks, 0, 1000, cur.crawl.maxExternalChecks),
        excludePrefixes: s(input.excludePrefixes, 4000).split(/[\n,]/).map((x) => x.trim()).filter((x) => x.startsWith("/")).slice(0, 100),
      },
      thresholds: {
        titleMin: n(input.titleMin, 10, 100, cur.thresholds.titleMin),
        titleMax: n(input.titleMax, 30, 120, cur.thresholds.titleMax),
        descriptionMin: n(input.descriptionMin, 20, 200, cur.thresholds.descriptionMin),
        descriptionMax: n(input.descriptionMax, 80, 400, cur.thresholds.descriptionMax),
        thinContentWords: n(input.thinContentWords, 50, 3000, cur.thresholds.thinContentWords),
        slowResponseMs: n(input.slowResponseMs, 200, 20000, cur.thresholds.slowResponseMs),
        staleContentDays: n(input.staleContentDays, 30, 3650, cur.thresholds.staleContentDays),
        minInternalLinksIn: n(input.minInternalLinksIn, 1, 50, cur.thresholds.minInternalLinksIn),
      },
      schedule: { auditFrequency: freq, syncSearchData: input.syncSearchData === true, verifyBacklinks: input.verifyBacklinks === true },
      defaults: {
        country: (s(input.defaultCountry, 2) || cur.defaults.country).toUpperCase(),
        language: (s(input.defaultLanguage, 5) || cur.defaults.language).toLowerCase(),
        device: input.defaultDevice === "mobile" ? "mobile" : "desktop",
        engine: (s(input.defaultEngine, 30) || cur.defaults.engine).toLowerCase(),
      },
      integrations: {
        gsc: { ...cur.integrations.gsc, enabled: input.gscEnabled === true, property: property || cur.integrations.gsc.property },
        ga4: { ...cur.integrations.ga4, enabled: input.ga4Enabled === true, propertyId: ga4 },
        psi: { enabled: input.psiEnabled === true, strategy: input.psiStrategy === "desktop" ? "desktop" : "mobile" },
      },
    };
    if (next.thresholds.titleMin >= next.thresholds.titleMax) throw new SeoInputError("Title minimum must be below the maximum.");
    if (next.thresholds.descriptionMin >= next.thresholds.descriptionMax) throw new SeoInputError("Description minimum must be below the maximum.");
    await saveSettings(next, v.userId);
    const integrationChanged = JSON.stringify({ g: [cur.integrations.gsc.enabled, cur.integrations.gsc.property], a: [cur.integrations.ga4.enabled, cur.integrations.ga4.propertyId], p: cur.integrations.psi }) !== JSON.stringify({ g: [next.integrations.gsc.enabled, next.integrations.gsc.property], a: [next.integrations.ga4.enabled, next.integrations.ga4.propertyId], p: next.integrations.psi });
    await recordAudit({
      actorId: v.userId,
      actorEmail: v.email,
      action: "settings",
      entity: integrationChanged ? "integration" : "settings",
      entityId: "global",
      entityLabel: "SEO settings",
      summary: diffSummary(
        { origin: cur.siteOrigin, ...cur.crawl, ...cur.thresholds, ...cur.schedule, gsc: cur.integrations.gsc.enabled, gscProperty: cur.integrations.gsc.property, ga4: cur.integrations.ga4.enabled, ga4Property: cur.integrations.ga4.propertyId, psi: cur.integrations.psi.enabled },
        { origin: next.siteOrigin, ...next.crawl, ...next.thresholds, ...next.schedule, gsc: next.integrations.gsc.enabled, gscProperty: next.integrations.gsc.property, ga4: next.integrations.ga4.enabled, ga4Property: next.integrations.ga4.propertyId, psi: next.integrations.psi.enabled },
        ["origin", "maxPages", "concurrency", "timeoutMs", "checkExternalLinks", "maxExternalChecks", "excludePrefixes", "titleMin", "titleMax", "descriptionMin", "descriptionMax", "thinContentWords", "slowResponseMs", "staleContentDays", "minInternalLinksIn", "auditFrequency", "syncSearchData", "verifyBacklinks", "gsc", "gscProperty", "ga4", "ga4Property", "psi"]
      ),
    });
    return {};
  });
}

export async function testIntegrationAction(which: "gsc" | "ga4") {
  return run("MANAGE_INTEGRATIONS", async (v) => {
    const res = which === "gsc" ? await testSearchConsole() : await testAnalytics();
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "verify", entity: "integration", entityId: which, entityLabel: which === "gsc" ? "Search Console" : "Google Analytics", summary: res.message });
    return { success: res.ok, message: res.message };
  });
}

export async function submitSitemapAction(url: string) {
  return run("MANAGE_SITEMAP", async (v) => {
    await submitSitemap(s(url, 1000)).catch((err) => {
      throw new SeoInputError(err instanceof Error ? err.message : "Submission failed.");
    });
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "publish", entity: "sitemap", entityId: s(url, 1000), entityLabel: s(url, 1000), summary: "Submitted to Search Console" });
    return {};
  });
}
