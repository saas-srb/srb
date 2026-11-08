/**
 * Workspace product analytics for the SOP, Digi Locker, Online Tests, AI Bots,
 * Social Media, SEO and Website products: every loader returns the numbers of
 * the CURRENT company from its own collections, never another company's, and
 * an empty company gives zeros without throwing. Runs against a throwaway
 * database that is dropped at the end.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/pa_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-product-analytics.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import {
  PANEL_CONFIGS,
  isPanelKey,
  getSopAnalytics,
  getDlmsAnalytics,
  getOtsAnalytics,
  getAibotsAnalytics,
  getSmmsAnalytics,
  getSeoAnalytics,
  getCmsAnalytics,
} from "@/lib/products/commandos/panel-analytics";
import { NAV_KEYS } from "@/lib/products/commandos/nav";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const DAY = 86_400_000;
const now = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysFromNow = (n: number) => new Date(now.getTime() + n * DAY);
const stamp = (createdAt: Date = now) => ({ createdAt, createdBy: null, updatedAt: createdAt, updatedBy: null, deletedAt: null, deletedBy: null });
const id = () => randomUUID();

/** Sum of every number in a loader's `kpis` (nulls count as zero). */
const kpiSum = (kpis: Record<string, number | null>) => Object.values(kpis).reduce<number>((s, v) => s + (v ?? 0), 0);
const valueOf = (rows: { label: string; value: number }[], label: string) => rows.find((r) => r.label === label)?.value ?? 0;

// ── seeds ──────────────────────────────────────────────────────────────────

/** `n` SOPs of one status in one department. */
function sops(dept: string, status: string, n: number, over: Record<string, unknown> = {}) {
  return Array.from({ length: n }, (_, i) => ({
    _id: id(),
    code: `SOP-${dept}-${status}-${i}`,
    title: `${status} ${i}`,
    departmentId: dept,
    functionId: null,
    processId: null,
    subProcessId: null,
    categoryId: null,
    ownerId: "u1",
    authorId: "u1",
    applicableRoleIds: [],
    effectiveDate: iso(daysFromNow(-10)),
    reviewDate: null,
    expiryDate: null,
    priority: "medium",
    confidentiality: "internal",
    mandatory: false,
    allowDownload: true,
    tags: [],
    accessUserIds: [],
    templateId: null,
    templateName: null,
    status,
    version: status === "draft" ? null : "1.0",
    publishedAt: status === "draft" ? null : now,
    lastPublishedBy: null,
    live: status === "draft" ? null : { title: `${status} ${i}`, description: "", sections: [], moduleLinks: [] },
    draft: { title: `${status} ${i}`, description: "", sections: [], moduleLinks: [] },
    hasUnpublishedChanges: false,
    archivedAt: null,
    archivedBy: null,
    statusBeforeArchive: null,
    ...stamp(),
    ...over,
  }));
}
const sopAssignment = (sopId: string, over: Record<string, unknown>) => ({ _id: id(), sopId, sopCode: "x", userId: id(), employeeId: null, userName: "Someone", departmentId: null, source: "manual", dueDate: null, assignedBy: "u1", assignedByName: "U", assignedAt: now, viewedAt: null, acknowledgedAt: null, acknowledgedVersion: null, requiredVersion: "1.0", ackHistory: [], checklist: {}, checklistUpdatedAt: null, ...over });

const vault = (n: number, over: Record<string, unknown> = {}) => Array.from({ length: n }, (_, i) => ({ _id: id(), scope: "company", clientId: null, name: `record ${i}`, category: "other", status: "active", expiryDate: null, notes: null, ...stamp(), ...over }));

const otsTest = (status: string) => ({ _id: id(), code: `T-${id().slice(0, 6)}`, name: `Test ${status}`, status, categoryId: null, config: { startAt: null, endAt: null }, sections: [], ...stamp() });
const otsAssignment = (testId: string, status: string, result: { passed: boolean; percentage: number } | null, createdAt: Date = now) => {
  const candidate = { kind: "applicant", id: id() };
  return { _id: id(), dispatchId: "d1", testId, candidate, candidateKey: `applicant:${candidate.id}`, candidateLabel: "Applicant", status, result: result ? { ...result, finalScore: result.percentage, timeTakenSec: 600 } : null, ...stamp(createdAt) };
};

const botRun = (botId: string, status: string, tokens: [number, number], costUsd: number, createdAt: Date = now) => ({ _id: id(), botId, chatId: "c", userId: "u1", model: "mock", status, inputTokens: tokens[0], outputTokens: tokens[1], costUsd, error: status === "failed" ? "boom" : null, createdAt });
const botChat = (botId: string, createdAt: Date = now) => ({ _id: id(), botId, userId: "u1", userEmail: "u1@test", title: "Chat", lastMessageAt: createdAt, messageCount: 1, ...stamp(createdAt) });

const post = (status: string, platform: string, metrics: Record<string, number> | null, publishedAt: Date | null = null) => ({
  _id: id(),
  title: `Post ${status}`,
  status,
  contentType: "image",
  platforms: [platform],
  scheduledAt: status === "scheduled" ? daysFromNow(3) : null,
  approvedBy: null,
  variants: [{ platform, publish: publishedAt ? { state: "published", at: publishedAt, url: null } : { state: "none", at: null }, metrics }],
  ...stamp(),
});

const seoIssue = (status: string, severity: string, category: string) => ({ _id: id(), fingerprint: id(), checkId: "manual", title: "Issue", status, severity, category, createdAt: now, updatedAt: now });
const seoKeyword = (currentPosition: number | null, status = "tracking") => ({ _id: id(), keyword: `kw ${id().slice(0, 5)}`, status, currentPosition, createdAt: now, updatedAt: now });
const seoBacklink = (sourceDomain: string, status: string) => ({ _id: id(), sourceDomain, sourceUrl: `https://${sourceDomain}/a`, targetUrl: "/", anchor: "link", rel: "follow", status, domainRating: null, firstSeen: iso(daysFromNow(-5)), lostAt: null, createdAt: now, updatedAt: now });
const seoTask = (status: string, dueDate: string | null) => ({ _id: id(), title: "Task", status, dueDate, assigneeId: null, completedAt: status === "done" ? now : null, createdAt: now, updatedAt: now });

const cmsPage = (path: string, status: string, hasUnpublishedChanges: boolean, seo: Record<string, unknown> | null) => {
  const content = { sections: [], seo, jsonLd: [] };
  return { _id: id(), path, title: path, templateKey: "default", status, draft: content, live: status === "published" ? content : null, hasUnpublishedChanges, version: status === "published" ? "1.0" : null, createdAt: now, createdBy: null, updatedAt: now, updatedBy: null };
};
const GOOD_SEO = { title: "A reasonable page title for search engines", description: "A description long enough to be useful in a search result, and short enough not to be cut.", canonical: "https://a.test/page", robots: { index: true, follow: true } };
const cmsRecord = (collection: string, slug: string, state: "published" | "draft" | "archived") => ({ _id: id(), collection, slug, draft: { title: slug }, live: state === "draft" ? null : { title: slug }, archived: state === "archived", hasUnpublishedChanges: state === "draft", publishedAt: state === "draft" ? null : now, orderKey: 1, history: [], createdAt: now, updatedAt: now });

async function seedA() {
  const db = await getDb();
  // SOP: 3 active + 2 drafts in dept d1, 1 published-with-past-review in d2; 4 assignments (2 acknowledged, 1 pending, 1 overdue).
  const live = sops("d1", "active", 3);
  const reviewDue = sops("d2", "active", 1, { reviewDate: iso(daysFromNow(-3)), mandatory: true });
  await db.collection("sops").insertMany([...live, ...sops("d1", "draft", 2), ...reviewDue, ...sops("d1", "active", 1, { deletedAt: now })] as never[]);
  await db.collection("sop_assignments").insertMany([
    sopAssignment(live[0]._id, { acknowledgedAt: now }),
    sopAssignment(live[0]._id, { acknowledgedAt: now }),
    sopAssignment(live[1]._id, { dueDate: iso(daysFromNow(5)) }),
    sopAssignment(live[2]._id, { dueDate: iso(daysFromNow(-2)) }),
  ] as never[]);

  // Digi Locker: 3 credentials (1 expired, 1 for a client), 2 documents (1 expiring), 1 link, 2 notes, 1 archived note, 1 deleted credential.
  await db.collection("dlms_credentials").insertMany([...vault(1), ...vault(1, { expiryDate: iso(daysFromNow(-4)) }), ...vault(1, { scope: "client", clientId: "client-1" }), ...vault(1, { deletedAt: now })] as never[]);
  await db.collection("dlms_documents").insertMany([...vault(1, { createdAt: daysFromNow(-90) }), ...vault(1, { expiryDate: iso(daysFromNow(2)), scope: "client", clientId: "client-1" })] as never[]);
  await db.collection("dlms_links").insertMany(vault(1) as never[]);
  await db.collection("dlms_notes").insertMany([...vault(2), ...vault(1, { status: "archived" })] as never[]);

  // Online Tests: 2 published tests + 1 draft; 5 assignments: 2 completed (1 pass 80%, 1 fail 40%), 1 submitted, 1 assigned, 1 expired (60 days old).
  const t1 = otsTest("published");
  const t2 = otsTest("published");
  await db.collection("ots_tests").insertMany([t1, t2, otsTest("draft")] as never[]);
  await db.collection("ots_assignments").insertMany([
    otsAssignment(t1._id, "completed", { passed: true, percentage: 80 }),
    otsAssignment(t1._id, "completed", { passed: false, percentage: 40 }),
    otsAssignment(t2._id, "submitted", null),
    otsAssignment(t2._id, "assigned", null),
    otsAssignment(t2._id, "expired", null, daysFromNow(-60)),
  ] as never[]);
  await db.collection("ots_certificates").insertMany([{ _id: id(), issuedOn: now, ...stamp() }, { _id: id(), issuedOn: daysFromNow(-200), ...stamp(daysFromNow(-200)) }] as never[]);

  // AI Bots: 2 bots (1 active), 3 chats, 4 runs in the window (1 failed) + 1 older than 30 days.
  await db.collection("aibots_bots").insertMany([{ _id: "bot-a", name: "Helper", icon: "bot", color: "slate", status: "active", ...stamp() }, { _id: "bot-b", name: "Paused", icon: "bot", color: "slate", status: "inactive", ...stamp() }] as never[]);
  await db.collection("aibots_chats").insertMany([botChat("bot-a"), botChat("bot-a"), botChat("bot-b", daysFromNow(-3))] as never[]);
  await db.collection("aibots_runs").insertMany([
    botRun("bot-a", "completed", [100, 50], 0.5),
    botRun("bot-a", "completed", [200, 50], 0.25),
    botRun("bot-a", "failed", [10, 0], 0),
    botRun("bot-b", "completed", [40, 10], 0.25, daysFromNow(-2)),
    botRun("bot-a", "completed", [9999, 9999], 9, daysFromNow(-45)),
  ] as never[]);

  // Social Media: 2 campaigns (+1 archived), 4 posts (2 published with metrics, 1 scheduled, 1 failed), 2 ads.
  await db.collection("smms_campaigns").insertMany([{ _id: id(), name: "C1", status: "draft", lmsCampaignKeys: [], ...stamp() }, { _id: id(), name: "C2", status: "published", lmsCampaignKeys: [], ...stamp() }, { _id: id(), name: "C3", status: "archived", lmsCampaignKeys: [], ...stamp() }] as never[]);
  await db.collection("smms_posts").insertMany([
    post("published", "instagram", { impressions: 1000, reach: 700, engagements: 90, clicks: 30 }, daysFromNow(-2)),
    post("published", "linkedin", { impressions: 500, reach: 300, engagements: 10, clicks: 5 }, daysFromNow(-100)),
    post("scheduled", "facebook", null),
    post("failed", "instagram", null),
  ] as never[]);
  await db.collection("smms_ads").insertMany([{ _id: id(), status: "draft", platform: "facebook", format: "image", ...stamp() }, { _id: id(), status: "generated", platform: "instagram", format: "video", ...stamp() }] as never[]);

  // SEO: 1 completed crawl; 4 issues (2 critical open, 1 medium in progress, 1 fixed); 3 tracked keywords (#2, #8, not ranking) + 1 paused; 3 backlinks (1 lost) from 2 domains; 3 tasks (1 overdue, 1 done).
  await db.collection("seo_crawl_runs").insertOne({ _id: id(), status: "completed", trigger: "manual", origin: "https://a.test", startedAt: daysFromNow(-1), finishedAt: now, pagesCrawled: 12, indexablePages: 10, scores: { overall: 74, technical: 80, onPage: 70, content: 72 }, issueCounts: {}, byCategory: {}, notes: [] } as never);
  await db.collection("seo_issues").insertMany([seoIssue("open", "critical", "technical"), seoIssue("open", "critical", "content"), seoIssue("in_progress", "medium", "technical"), seoIssue("fixed", "high", "links")] as never[]);
  await db.collection("seo_keywords").insertMany([seoKeyword(2), seoKeyword(8), seoKeyword(null), seoKeyword(1, "paused")] as never[]);
  await db.collection("seo_backlinks").insertMany([seoBacklink("one.test", "live"), seoBacklink("one.test", "live"), seoBacklink("two.test", "lost")] as never[]);
  await db.collection("seo_tasks").insertMany([seoTask("todo", iso(daysFromNow(-1))), seoTask("in_progress", iso(daysFromNow(9))), seoTask("done", null)] as never[]);

  // Website: 5 pages (3 published — one with unpublished changes, one with no SEO — 1 draft, 1 archived), 3 media (1 without alt), 3 records.
  await db.collection("cms_pages").insertMany([
    cmsPage("/", "published", false, GOOD_SEO),
    cmsPage("/services", "published", true, GOOD_SEO),
    cmsPage("/about", "published", false, { title: "", description: "", canonical: null }),
    cmsPage("/new", "draft", true, null),
    cmsPage("/old", "archived", false, null),
  ] as never[]);
  await db.collection("cms_media").insertMany([{ _id: id(), name: "a.png", altText: "A", createdAt: now }, { _id: id(), name: "b.png", altText: "B", createdAt: now }, { _id: id(), name: "c.png", altText: " ", createdAt: now }] as never[]);
  await db.collection(CMS_RECORDS).insertMany([cmsRecord("blog", "post-1", "published"), cmsRecord("blog", "post-2", "draft"), cmsRecord("jobs", "job-1", "published")] as never[]);
}

/** A second company with different, larger numbers everywhere: any of them showing up in A is a leak. */
async function seedB() {
  const db = await getDb();
  const live = sops("dx", "active", 9);
  await db.collection("sops").insertMany([...live, ...sops("dx", "draft", 7)] as never[]);
  await db.collection("sop_assignments").insertMany(Array.from({ length: 11 }, () => sopAssignment(live[0]._id, { dueDate: iso(daysFromNow(-9)) })) as never[]);
  await db.collection("dlms_credentials").insertMany(vault(13, { expiryDate: iso(daysFromNow(-1)) }) as never[]);
  await db.collection("dlms_notes").insertMany(vault(17) as never[]);
  const t = otsTest("published");
  await db.collection("ots_tests").insertMany([t, otsTest("draft"), otsTest("draft"), otsTest("draft")] as never[]);
  await db.collection("ots_assignments").insertMany(Array.from({ length: 19 }, () => otsAssignment(t._id, "completed", { passed: true, percentage: 100 })) as never[]);
  await db.collection("ots_certificates").insertMany(Array.from({ length: 23 }, () => ({ _id: id(), issuedOn: now, ...stamp() })) as never[]);
  await db.collection("aibots_bots").insertMany(Array.from({ length: 6 }, (_, i) => ({ _id: `b-${i}`, name: `B${i}`, icon: "bot", color: "slate", status: "active", ...stamp() })) as never[]);
  await db.collection("aibots_chats").insertMany(Array.from({ length: 29 }, () => botChat("b-0")) as never[]);
  await db.collection("aibots_runs").insertMany(Array.from({ length: 31 }, () => botRun("b-0", "failed", [5000, 5000], 3)) as never[]);
  await db.collection("smms_campaigns").insertMany(Array.from({ length: 8 }, (_, i) => ({ _id: id(), name: `B${i}`, status: "published", lmsCampaignKeys: [], ...stamp() })) as never[]);
  await db.collection("smms_posts").insertMany(Array.from({ length: 37 }, () => post("published", "youtube", { impressions: 100000, reach: 90000, engagements: 8000, clicks: 7000 }, now)) as never[]);
  await db.collection("seo_issues").insertMany(Array.from({ length: 41 }, () => seoIssue("open", "critical", "mobile")) as never[]);
  await db.collection("seo_keywords").insertMany(Array.from({ length: 43 }, () => seoKeyword(1)) as never[]);
  await db.collection("seo_backlinks").insertMany(Array.from({ length: 47 }, (_, i) => seoBacklink(`b${i}.test`, "live")) as never[]);
  await db.collection("cms_pages").insertMany(Array.from({ length: 53 }, (_, i) => cmsPage(`/b-${i}`, "published", true, null)) as never[]);
  await db.collection("cms_media").insertMany(Array.from({ length: 59 }, (_, i) => ({ _id: id(), name: `${i}.png`, altText: "", createdAt: now })) as never[]);
  await db.collection(CMS_RECORDS).insertMany(Array.from({ length: 61 }, (_, i) => cmsRecord("blog", `b-${i}`, "published")) as never[]);
}

const CMS_RECORDS = "cms_records";

async function main() {
  const platform = await getPlatformDb();
  if (!/test/.test(platform.databaseName)) throw new Error(`Refusing to run against "${platform.databaseName}"`);
  const A = randomUUID();
  const B = randomUUID();
  const EMPTY = randomUUID();
  const company = (_id: string, slug: string) => ({ _id: _id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
  await platform.collection("companies").insertMany([company(A, "alpha"), company(B, "bravo"), company(EMPTY, "empty")]);
  await runAsCompany(A, seedA);
  await runAsCompany(B, seedB);

  const NEW = ["sop", "dlms", "ots", "aibots", "smms", "seo", "cms"] as const;
  console.log("configuration");
  await check("each of the seven products has a config, and its analytics key is a guarded nav key", () => {
    for (const p of NEW) {
      assert.ok(isPanelKey(p), p);
      assert.equal(PANEL_CONFIGS[p].href, `/${p}`);
      assert.ok(NAV_KEYS.includes(`analytics.${p}`), `analytics.${p}`);
    }
    for (const bad of ["toString", "constructor", "__proto__", "nope", "", null, 7]) assert.equal(isPanelKey(bad), false, String(bad));
    for (const key of Object.keys(PANEL_CONFIGS)) assert.ok(NAV_KEYS.includes(`analytics.${key}`), `analytics.${key} has no nav item`);
  });

  console.log("company A: its own numbers");
  await check("SOP: library, status, acknowledgements and reviews", async () => {
    const d = await runAsCompany(A, () => getSopAnalytics());
    assert.deepEqual(
      { total: d.kpis.total, published: d.kpis.published, draft: d.kpis.draft, mandatory: d.kpis.mandatory, overdueReviews: d.kpis.overdueReviews, createdInPeriod: d.kpis.createdInPeriod },
      { total: 6, published: 4, draft: 2, mandatory: 1, overdueReviews: 1, createdInPeriod: 6 },
    );
    assert.deepEqual(
      { assigned: d.kpis.assigned, acknowledged: d.kpis.acknowledged, pending: d.kpis.pendingAcknowledgements, overdue: d.kpis.overdueAcknowledgements, rate: d.kpis.acknowledgementRate },
      { assigned: 4, acknowledged: 2, pending: 1, overdue: 1, rate: 50 },
    );
    assert.deepEqual(d.charts.byDepartment.map((x) => x.value).sort(), [1, 5]);
    assert.equal(valueOf(d.charts.byStatus, "Draft"), 2);
    assert.ok(d.alerts.some((a) => a.type === "danger" && /1 SOP acknowledgement/.test(a.message)));
  });
  await check("Digi Locker: records by type and ownership, expiry, added in the period — deleted and archived left out", async () => {
    const d = await runAsCompany(A, () => getDlmsAnalytics());
    assert.deepEqual(d.kpis, { totalRecords: 8, credentials: 3, documents: 2, links: 1, notes: 2, companyRecords: 6, clientRecords: 2, archivedRecords: 1, expired: 1, expiringSoon: 1, addedInPeriod: 8 });
    assert.deepEqual(d.charts.expiryByType, [{ label: "Credentials", expired: 1, expiring: 0 }, { label: "Documents", expired: 0, expiring: 1 }, { label: "URL / Accounts", expired: 0, expiring: 0 }]);
    assert.deepEqual(d.alerts.map((a) => a.type), ["danger", "warning"]);
    assert.ok(!JSON.stringify(d).includes("record 0"), "no record names in the analytics");
    // The date range narrows "added": the 90-day-old document is the only one in that window.
    const old = await runAsCompany(A, () => getDlmsAnalytics({ dateFrom: iso(daysFromNow(-120)), dateTo: iso(daysFromNow(-60)) }));
    assert.equal(old.kpis.addedInPeriod, 1);
    assert.equal(old.kpis.totalRecords, 8, "the vault size is the current state");
  });
  await check("Online Tests: tests, assignments, results, certificates; the date range and status filter apply", async () => {
    const d = await runAsCompany(A, () => getOtsAnalytics());
    assert.deepEqual(
      { tests: d.kpis.totalTests, active: d.kpis.activeTests, assignments: d.kpis.assignments, pending: d.kpis.pending, completed: d.kpis.completed, awaiting: d.kpis.awaitingEvaluation, expired: d.kpis.expired, passed: d.kpis.passed, failed: d.kpis.failed, candidates: d.kpis.candidates, certs: d.kpis.certificatesIssued },
      { tests: 3, active: 2, assignments: 5, pending: 1, completed: 3, awaiting: 1, expired: 1, passed: 1, failed: 1, candidates: 5, certs: 2 },
    );
    assert.equal(valueOf(d.charts.assignmentStatus, "Completed"), 2);
    assert.deepEqual(d.charts.passFailByTest.map((r) => [r.passed, r.failed]), [[1, 1]]);
    assert.equal(d.charts.averageByTest[0].value, 60);
    const recent = await runAsCompany(A, () => getOtsAnalytics({ dateFrom: iso(daysFromNow(-7)), dateTo: iso(now) }));
    assert.deepEqual([recent.kpis.assignments, recent.kpis.expired, recent.kpis.certificatesIssued], [4, 0, 1]);
    const onlyExpired = await runAsCompany(A, () => getOtsAnalytics({ status: "expired" }));
    assert.deepEqual([onlyExpired.kpis.assignments, onlyExpired.kpis.expired], [1, 1]);
  });
  await check("AI Bots: bots, chats and the last 30 days of executions, tokens, cost and failures", async () => {
    const d = await runAsCompany(A, () => getAibotsAnalytics());
    assert.deepEqual(d.kpis, { totalBots: 2, activeBots: 1, totalChats: 3, chatsToday: 2, executions30d: 4, failedExecutions30d: 1, failureRate30d: 25, inputTokens30d: 350, outputTokens30d: 110, tokens30d: 460, estimatedCostUsd30d: 1 });
    assert.deepEqual(d.charts.topBots.map((b) => [b.label, b.value]), [["Helper", 3], ["Paused", 1]]);
    assert.equal(d.charts.dailyExecutions.length, 30);
    assert.equal(d.charts.dailyExecutions.reduce((s, x) => s + x.count, 0), 4);
    assert.ok(!JSON.stringify(d).includes("u1@test"), "no chat owners in the analytics");
  });
  await check("Social Media: content by status and the recorded post results; the date range narrows the results", async () => {
    const d = await runAsCompany(A, () => getSmmsAnalytics());
    assert.deepEqual(d.kpis, { campaigns: 2, posts: 4, publishedPosts: 2, scheduledPosts: 1, failedPosts: 1, ads: 2, publishedVersions: 2, impressions: 1500, reach: 1000, engagements: 100, clicks: 35, aiGenerations30d: 0, linkedAdCampaigns: 0 });
    assert.equal(valueOf(d.charts.engagementByPlatform, "Instagram"), 90);
    assert.equal(valueOf(d.charts.postsByStatus, "Published"), 2);
    assert.ok(d.alerts.some((a) => a.type === "danger" && /1 post\(s\) failed/.test(a.message)) && d.alerts.some((a) => /need approval/.test(a.message)));
    const week = await runAsCompany(A, () => getSmmsAnalytics({ dateFrom: iso(daysFromNow(-7)), dateTo: iso(now) }));
    assert.deepEqual([week.kpis.publishedVersions, week.kpis.impressions, week.kpis.engagements], [1, 1000, 90]);
    assert.equal(week.kpis.posts, 4, "content counts are the current state");
  });
  await check("SEO: audit score, issues, keywords, backlinks and tasks; Search Console shown as not connected", async () => {
    const d = await runAsCompany(A, () => getSeoAnalytics());
    assert.deepEqual(d.kpis, { overallScore: 74, pagesCrawled: 12, indexedPages: 10, pagesNeedingOptimization: 0, openIssues: 3, criticalIssues: 2, keywordsTracked: 3, keywordsRanking: 2, keywordsTop10: 2, backlinks: 2, referringDomains: 1, openTasks: 2, overdueTasks: 1, searchClicks28d: null, searchImpressions28d: null });
    assert.deepEqual(d.charts.issuesBySeverity.map((x) => x.value), [2, 0, 1, 0]);
    assert.equal(valueOf(d.charts.keywordPositions, "Top 3"), 1);
    assert.deepEqual(d.alerts.map((a) => a.type), ["danger", "warning"]);
  });
  await check("Website: pages, records and media, and what is waiting", async () => {
    const d = await runAsCompany(A, () => getCmsAnalytics());
    assert.deepEqual(d.kpis, { totalPages: 5, publishedPages: 3, draftPages: 1, archivedPages: 1, pagesAwaitingPublish: 2, records: 3, liveRecords: 2, recordsAwaitingPublish: 1, mediaFiles: 3, imagesWithoutAlt: 1, pagesNeedingSeo: 1 });
    assert.deepEqual(d.charts.pagesByStatus.map((x) => x.value), [3, 1, 1]);
    assert.equal(d.charts.pagesByArea.reduce((s, x) => s + x.value, 0), 5);
    const blog = d.charts.recordsByCollection.find((c) => c.total === 2)!;
    assert.deepEqual([blog.live, blog.drafts], [1, 1]);
  });

  console.log("tenant isolation");
  await check("company B gets its own numbers from the same loaders", async () => {
    await runAsCompany(B, async () => {
      const [sop, dlms, ots, bots, smms, seo, cms] = await Promise.all([getSopAnalytics(), getDlmsAnalytics(), getOtsAnalytics(), getAibotsAnalytics(), getSmmsAnalytics(), getSeoAnalytics(), getCmsAnalytics()]);
      assert.deepEqual([sop.kpis.total, sop.kpis.draft, sop.kpis.overdueAcknowledgements], [16, 7, 11]);
      assert.deepEqual([dlms.kpis.totalRecords, dlms.kpis.credentials, dlms.kpis.notes, dlms.kpis.expired], [30, 13, 17, 13]);
      assert.deepEqual([ots.kpis.totalTests, ots.kpis.assignments, ots.kpis.passed, ots.kpis.certificatesIssued], [4, 19, 19, 23]);
      assert.deepEqual([bots.kpis.totalBots, bots.kpis.totalChats, bots.kpis.executions30d, bots.kpis.failedExecutions30d], [6, 29, 31, 31]);
      assert.deepEqual([smms.kpis.campaigns, smms.kpis.posts, smms.kpis.engagements], [8, 37, 37 * 8000]);
      assert.deepEqual([seo.kpis.overallScore, seo.kpis.criticalIssues, seo.kpis.keywordsTracked, seo.kpis.backlinks], [null, 41, 43, 47]);
      assert.deepEqual([cms.kpis.totalPages, cms.kpis.mediaFiles, cms.kpis.records], [53, 59, 61]);
    });
  });
  await check("A's numbers are unchanged with B's data present, in every order and when the two run interleaved", async () => {
    const snapshot = () => Promise.all([getSopAnalytics(), getDlmsAnalytics(), getOtsAnalytics(), getAibotsAnalytics(), getSmmsAnalytics(), getSeoAnalytics(), getCmsAnalytics()]).then((all) => all.map((x) => x.kpis));
    const [a1, b1, a2] = await Promise.all([runAsCompany(A, snapshot), runAsCompany(B, snapshot), runAsCompany(A, snapshot)]);
    assert.deepEqual(a1, a2);
    assert.notDeepEqual(a1, b1);
    assert.deepEqual(a1.map((k) => kpiSum(k as Record<string, number | null>)), (await runAsCompany(A, snapshot)).map((k) => kpiSum(k as Record<string, number | null>)));
    assert.deepEqual([(a1[0] as { total: number }).total, (a1[1] as { totalRecords: number }).totalRecords, (a1[6] as { totalPages: number }).totalPages], [6, 8, 5]);
    // None of B's distinctive totals appears anywhere in A's analytics.
    const flatA = JSON.stringify(a1);
    for (const n of [13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61]) assert.ok(!new RegExp(`:${n}[,}]`).test(flatA), `B's ${n} leaked into A`);
  });

  console.log("empty company");
  await check("a company with no data gets zeros (and no score), not an error", async () => {
    await runAsCompany(EMPTY, async () => {
      const all = await Promise.all([getSopAnalytics(), getDlmsAnalytics(), getOtsAnalytics(), getAibotsAnalytics(), getSmmsAnalytics(), getSeoAnalytics(), getCmsAnalytics()]);
      for (const [i, d] of all.entries()) assert.equal(kpiSum(d.kpis as Record<string, number | null>), 0, `${NEW[i]}: ${JSON.stringify(d.kpis)}`);
      const seo = all[5] as Awaited<ReturnType<typeof getSeoAnalytics>>;
      assert.deepEqual([seo.kpis.overallScore, seo.kpis.searchClicks28d], [null, null]);
      assert.deepEqual(seo.alerts.map((a) => a.message.slice(0, 13)), ["No site audit"]);
      for (const [i, d] of all.entries()) if (i !== 5) assert.deepEqual(d.alerts, [], NEW[i]);
      const withFilters = await Promise.all([getOtsAnalytics({ dateFrom: "2026-01-01", dateTo: "2026-01-31", status: "completed" }), getSmmsAnalytics({ dateFrom: "garbage", dateTo: "also garbage" }), getDlmsAnalytics({ dateFrom: "garbage" })]);
      for (const d of withFilters) assert.equal(kpiSum(d.kpis as Record<string, number | null>), 0);
    });
  });

  console.log(`product analytics: all ${passed} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    await c.db().dropDatabase();
    await c.close();
  });
