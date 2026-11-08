// SEO product demo data: SEO-role logins, keyword groups + tracked keywords (with a few manual position readings),
// backlinks (unverified — run "Verify all" to check them for real), one competitor with estimated metrics and
// positions, and a handful of tasks. Crawl data is NOT seeded: run a website audit from /rankmax-ai/audit for real results.
// Idempotent: everything it creates has a `demo-seo-` id (or the demo email) and is replaced on each run.
import { ObjectId } from "mongodb";
import { hashPassword, ago, dayAgo, audit } from "./lib.mjs";

const PASSWORD = "Demo@12345";
const D = "demo-seo-";

export const SEO_DEMO_ACCOUNTS = [
  { email: "demo.seo.admin@example.com", label: "SEO Admin", roles: ["seo_admin"] },
  { email: "demo.seo.manager@example.com", label: "SEO Manager", roles: ["seo_manager"] },
  { email: "demo.seo.specialist@example.com", label: "SEO Specialist", roles: ["seo_specialist"] },
  { email: "demo.seo.employee@example.com", label: "SEO Executive", roles: ["seo_employee"] },
];

const GROUPS = [
  ["Software Development", "#6366f1"],
  ["AI & Automation", "#06b6d4"],
  ["Training & Internships", "#f59e0b"],
  ["Staffing", "#ec4899"],
];

// keyword, group, target, intent, volume, difficulty, priority, cluster, positions (oldest → newest; null = not ranking)
const KEYWORDS = [
  ["custom software development company", 0, "/software-development", "commercial", 2400, 58, "critical", "custom software", [34, 28, 22, 19]],
  ["web app development services", 0, "/services/web-app-development", "commercial", 1300, 49, "high", "web apps", [18, 15, 12, 9]],
  ["mobile app development company noida", 0, "/services/mobile-app-development", "transactional", 590, 41, "high", "mobile apps", [null, 64, 41, 27]],
  ["ai chatbot development", 1, "/ai-automations", "commercial", 880, 52, "high", "ai chatbots", [12, 9, 7, 5]],
  ["ai automation services for business", 1, "/ai-automations", "commercial", 720, 47, "medium", "ai automation", [22, 25, 31, 29]],
  ["what is prediction and forecasting in ai", 1, "/services/prediction-and-forecasting", "informational", 320, 28, "low", "forecasting", [8, 6, 4, 3]],
  ["industrial training program for btech students", 2, "/industrial-training", "informational", 1600, 33, "high", "industrial training", [6, 5, 5, 4]],
  ["paid internship for computer science students in noida", 2, "/internship-program", "transactional", 480, 29, "medium", "internships", [15, 11, 9, 8]],
  ["6 week industrial training", 2, "/industrial-training", "commercial", 2900, 38, "critical", "industrial training", [11, 13, 10, 12]],
  ["hire dedicated developers india", 3, "/resource-augmentation", "transactional", 1900, 63, "high", "staff augmentation", [null, null, 88, 71]],
  ["it staff augmentation services", 3, "/resource-augmentation", "commercial", 1000, 55, "medium", "staff augmentation", [41, 38, 36, 33]],
  ["demo", 0, "/", "navigational", 90, 5, "critical", "brand", [1, 1, 1, 1]],
];

export async function seedSeo(db) {
  const now = new Date();
  const passwordHash = hashPassword(PASSWORD);
  for (const c of ["seo_keywords", "seo_keyword_groups", "seo_rank_history", "seo_backlinks", "seo_competitors", "seo_competitor_rankings", "seo_tasks"]) {
    await db.collection(c).deleteMany({ _id: new RegExp(`^${D}`) });
  }

  const users = {};
  for (const a of SEO_DEMO_ACCOUNTS) {
    const existing = await db.collection("admin_users").findOne({ email: a.email }, { projection: { _id: 1 } });
    const id = existing?._id ?? new ObjectId();
    await db.collection("admin_users").updateOne(
      { email: a.email },
      { $set: { email: a.email, passwordHash, roles: a.roles, permissionOverrides: {}, userType: "employee", employeeId: null, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: null }, $setOnInsert: { _id: id, createdAt: now } },
      { upsert: true }
    );
    users[a.roles[0]] = id.toString();
  }

  const groupIds = GROUPS.map((_, i) => `${D}grp-${i}`);
  await db.collection("seo_keyword_groups").insertMany(GROUPS.map(([name, color], i) => ({ _id: groupIds[i], name, color, description: "", ...audit(ago(60), users.seo_manager) })));

  const kwDocs = [];
  const hist = [];
  for (const [i, [keyword, g, targetUrl, intent, volume, difficulty, priority, cluster, positions]] of KEYWORDS.entries()) {
    const id = `${D}kw-${i}`;
    const dates = [dayAgo(63), dayAgo(42), dayAgo(21), dayAgo(1)];
    positions.forEach((p, j) => hist.push({ _id: `${id}|${dates[j]}|manual`, keywordId: id, date: dates[j], position: p, url: p === null ? null : targetUrl, source: "manual", impressions: null, clicks: null, createdAt: now }));
    const ranked = positions.filter((p) => p !== null);
    kwDocs.push({
      _id: id, keyword, normalized: keyword.toLowerCase(), intent, volume, difficulty, cpc: Math.round((0.4 + (i % 5) * 0.35) * 100) / 100, competition: Math.round((0.3 + (i % 4) * 0.15) * 100) / 100,
      currentPosition: positions[3], previousPosition: positions[2], bestPosition: ranked.length ? Math.min(...ranked) : null, targetPosition: 3, targetUrl, rankingUrl: positions[3] === null ? null : targetUrl,
      country: "IN", language: "en", device: i % 4 === 2 ? "mobile" : "desktop", engine: "google", priority, status: "tracking", type: i % 3 === 2 ? "secondary" : "primary",
      groupId: groupIds[g], cluster, relatedKeywords: [], assigneeId: i % 2 ? users.seo_specialist : users.seo_employee, lastCheckedAt: new Date(`${dates[3]}T12:00:00`), positionSource: "manual",
      metricsSource: "demo (estimated)", notes: "", ...audit(ago(70), users.seo_manager),
    });
  }
  await db.collection("seo_keywords").insertMany(kwDocs);
  await db.collection("seo_rank_history").insertMany(hist);

  // Real, public pages that link to lots of sites — "Verify all" will genuinely report them as lost (they don't link to us).
  const backlinks = [
    ["https://en.wikipedia.org/wiki/Software_development", "/software-development", "software development partner", "nofollow", 92],
    ["https://github.com/topics/chatbot", "/ai-automations", "Demo Company", "follow", 95],
    ["https://news.ycombinator.com/", "/", "example.com", "nofollow", 90],
  ].map(([sourceUrl, targetPath, anchor, rel, dr], i) => ({
    _id: `${D}bl-${i}`, sourceUrl, sourceDomain: new URL(sourceUrl).hostname.replace(/^www\./, ""), targetPath, anchor, rel, status: "unverified", firstSeen: dayAgo(90 - i * 30),
    lastSeenLiveAt: null, lastCheckedAt: null, lostAt: null, checkNote: null, domainRating: dr, source: "demo", notes: "Demo row — verify to see the real status.", ...audit(ago(90 - i * 30), users.seo_specialist),
  }));
  await db.collection("seo_backlinks").insertMany(backlinks);

  await db.collection("seo_competitors").insertOne({
    _id: `${D}comp-1`, name: "Example Competitor", domain: "example.com", color: "#f59e0b", notes: "Demo competitor — figures are illustrative estimates.",
    metrics: { organicKeywords: 4200, rankingKeywords: 310, organicTraffic: 18500, backlinks: 12800, referringDomains: 940, domainRating: 61, source: "demo (estimated)", asOf: dayAgo(3) },
    topPages: [], sitemap: null, ...audit(ago(30), users.seo_manager),
  });
  await db.collection("seo_competitor_rankings").insertMany(
    KEYWORDS.slice(0, 8).flatMap(([keyword], i) => [
      { _id: `${D}cr-${i}-a`, competitorId: `${D}comp-1`, keyword, normalized: keyword.toLowerCase(), position: 4 + i * 3, url: null, volume: null, date: dayAgo(30), source: "demo" },
      { _id: `${D}cr-${i}-b`, competitorId: `${D}comp-1`, keyword, normalized: keyword.toLowerCase(), position: 3 + i * 2, url: null, volume: null, date: dayAgo(2), source: "demo" },
    ])
  );

  const tasks = [
    ["Rewrite title & description for /software-development", "fix_metadata", "high", "in_progress", users.seo_specialist, "/software-development", 3],
    ["Add FAQ schema to /industrial-training", "add_schema", "medium", "todo", users.seo_specialist, "/industrial-training", 7],
    ["Link to /internship-program from the blog", "internal_linking", "medium", "todo", users.seo_employee, "/internship-program", 5],
    ["Compress hero images on the home page", "optimize_images", "low", "done", users.seo_employee, "/", -4],
  ];
  const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  await db.collection("seo_tasks").insertMany(
    tasks.map(([title, type, priority, status, assigneeId, url, due], i) => ({
      _id: `${D}task-${i}`, code: `SEO-D${String(i + 1).padStart(3, "0")}`, title, type, description: "", priority, status, assigneeId, dueDate: d(due), url, issueId: null,
      completedAt: status === "done" ? ago(2) : null, comments: [], ...audit(ago(10 - i), users.seo_manager),
    }))
  );

  return { keywords: kwDocs.length, readings: hist.length, backlinks: backlinks.length, tasks: tasks.length };
}
