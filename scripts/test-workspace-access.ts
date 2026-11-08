/**
 * Workspace access checks: the navigation each kind of user gets, that the
 * page guard agrees with it for every nav key, that the Workspace session
 * opens the Command Center only for the roles that allow it, and that the
 * company pages' loaders never read another company's data. Runs against a
 * throwaway database that is dropped at the end.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/ws_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-workspace-access.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { listPlans } from "@/lib/platform/billing/plans";
import { recordUsage } from "@/lib/platform/billing/usage";
import { meterStorage } from "@/lib/platform/billing/enforce";
import { rolesForPreset } from "@/lib/platform/onboarding/catalog";
import { createHubSession, getSessionHubUser } from "@/lib/hub-auth";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { safeNextPath, workspaceLoginUrl, workspaceSessionAccountId } from "@/lib/workspace-session";
import { getHrmsUserForAccount } from "@/lib/hrms-auth";
import { getPmsUserForAccount } from "@/lib/pms-auth";
import { getFmsUserForAccount } from "@/lib/fms-auth";
import { getLmsUserForAccount } from "@/lib/lms-auth";
import { getPrmsUserForAccount } from "@/lib/prms-auth";
import { getTmsUserForAccount } from "@/lib/tms-auth";
import { getOtsUserForAccount } from "@/lib/ots-auth";
import { getSopUserForAccount } from "@/lib/sop-auth";
import { getDlmsUserForAccount } from "@/lib/dlms-auth";
import { getCmsUserForAccount } from "@/lib/cms-auth";
import { getSeoUserForAccount } from "@/lib/seo-auth";
import { getSmmsUserForAccount } from "@/lib/smms-auth";
import { getAibotsUserForAccount } from "@/lib/aibots-auth";
import { getIntelligenceUserForAccount } from "@/lib/intelligence-auth";
import { getChatUserForAccount } from "@/lib/messenger-auth";
import { delegatedManagerBlock } from "@/lib/products/commandos/admin-users";
import { notify as notifyWorkspace } from "@/lib/platform/notifications";
import { notify as notifyPms } from "@/lib/products/sprintos/notifications";
import { listWorkspaceNotifications, markAllWorkspaceNotificationsRead, markWorkspaceNotificationRead, seesPanelNotifications, workspaceUnreadCount } from "@/lib/products/commandos/notifications";
import { MANAGE_PERMISSIONS, NAV_KEYS, NAV_SECTIONS, canViewAuditLog, canViewCommandCenter, canViewWorkspaceEvents } from "@/lib/products/commandos/nav";
import { loadExecutiveOverview } from "@/lib/products/commandos/executive-overview";
import { allowedAuditSources, resolveAuditSource } from "@/lib/products/commandos/activity-log-shared";
import { checkWorkspaceAccess, resolveWorkspaceNav, type WorkspaceUser } from "@/lib/products/commandos/access";
import { getCompanyBillingHistory, getCompanySecurity, getCompanyUsage, listCompanyIntegrations, paymentsFromInvoices } from "@/lib/products/commandos/company";
import { ALL_KNOWN_ROLES } from "@/lib/products/commandos/role-catalog";
import { ALL_PERMISSION_KEYS } from "@/lib/products/commandos/permission-catalog";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const MANAGE_KEYS = NAV_KEYS.filter((k) => k.startsWith("manage."));
/** Growth has no Training product, so its registers are not offered either. */
const GROWTH_MANAGE_KEYS = MANAGE_KEYS.filter((k) => !k.startsWith("manage.tms."));
const COMPANY_KEYS = NAV_KEYS.filter((k) => k.startsWith("company."));

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);

  const now = new Date();
  const owner = randomUUID(); // runs the platform: no plan, every product
  const acme = randomUUID(); // Growth plan
  const small = randomUUID(); // Starter plan: no Finance
  const beta = randomUUID(); // a second tenant with nothing in it
  const company = (id: string, slug: string, isPlatformOwner = false) => ({ _id: id as never, slug, name: slug[0].toUpperCase() + slug.slice(1), status: "active", isPlatformOwner, createdAt: now, updatedAt: now });
  await db.collection("companies").insertMany([company(owner, "owner", true), company(acme, "acme"), company(small, "small"), company(beta, "beta")]);
  await listPlans(); // seeds the default catalogue
  // Every real plan has every product; these checks cover plans with fewer, so Starter and Growth are narrowed here (test database only).
  await db.collection("billing_plans").updateOne({ _id: "starter" as never }, { $set: { modules: ["hrms", "pms", "lms", "sop", "cms"] } });
  await db.collection("billing_plans").updateOne({ _id: "growth" as never }, { $set: { modules: ["hrms", "pms", "lms", "fms", "prms", "sop", "lpms", "dlms", "cms", "seo", "portal", "ots", "intelligence"] } });
  const sub = (planId: string) => ({ planId, status: "active", interval: "monthly", trialEndsAt: null, currentPeriodStart: now, currentPeriodEnd: null, cancelAtPeriodEnd: false, graceEndsAt: null, provider: null, updatedAt: now });
  for (const [id, plan] of [[acme, "growth"], [small, "starter"], [beta, "growth"]] as const) await db.collection("companies").updateOne({ _id: id as never }, { $set: { subscription: sub(plan) } });

  /** Creates an account in a company and returns it as the Workspace sees it (through a real session). */
  async function account(companyId: string, email: string, roles: string[], extra: Record<string, unknown> = {}): Promise<{ user: WorkspaceUser & { email: string }; hubToken: string; _id: ObjectId }> {
    return runAsCompany(companyId, async () => {
      const _id = new ObjectId();
      await (await getDb()).collection("admin_users").insertOne({ _id, email, passwordHash: "x", failedLoginAttempts: 0, lockedUntil: null, createdAt: now, lastLoginAt: now, roles, ...extra });
      const hubToken = await createHubSession(_id);
      const user = await getSessionHubUser(hubToken);
      assert.ok(user, `session for ${email}`);
      return { user, hubToken, _id };
    });
  }
  const preset = (p: string) => rolesForPreset(p)!;

  const admin = await account(acme, "admin@acme.test", ["super_admin"]);
  const hr = await account(acme, "hr@acme.test", preset("hr"));
  const dev = await account(acme, "dev@acme.test", preset("developer"));
  const finance = await account(acme, "fin@acme.test", preset("finance"));
  const sales = await account(acme, "sales@acme.test", preset("sales"));
  // A developer the Super Admin gave two single capabilities, and took one away.
  const tuned = await account(acme, "tuned@acme.test", preset("developer"), { permissionOverrides: { "lms.canViewAnalytics": true, "portal.isPortalAdmin": true, "workspace.canViewAnalytics": false, "workspace.manageProjects": true } });
  const noRoles = await account(acme, "nobody@acme.test", []);
  const smallAdmin = await account(small, "admin@small.test", ["super_admin"]);
  const smallFinance = await account(small, "fin@small.test", preset("finance"));
  const betaAdmin = await account(beta, "admin@beta.test", ["super_admin"]);
  const ownerAdmin = await account(owner, "root@owner.test", ["super_admin"]);
  const ownerRevoked = await account(owner, "revoked@owner.test", ["super_admin"], { platformRevokedAt: now });
  const ownerHr = await account(owner, "hr@owner.test", preset("hr"));

  const everyone: [string, string, { user: WorkspaceUser }][] = [
    ["acme super admin", acme, admin],
    ["acme HR manager", acme, hr],
    ["acme PMS employee", acme, dev],
    ["acme finance", acme, finance],
    ["acme sales", acme, sales],
    ["acme developer with overrides", acme, tuned],
    ["acme account without roles", acme, noRoles],
    ["starter-plan super admin", small, smallAdmin],
    ["starter-plan finance", small, smallFinance],
    ["second tenant super admin", beta, betaAdmin],
    ["platform owner", owner, ownerAdmin],
    ["owner-company super admin, platform access revoked", owner, ownerRevoked],
    ["owner-company HR", owner, ownerHr],
  ];
  const navOf = (companyId: string, u: { user: WorkspaceUser }) => runAsCompany(companyId, () => resolveWorkspaceNav(u.user));
  const allowed = async (companyId: string, u: { user: WorkspaceUser }) => new Set((await navOf(companyId, u)).allowed);

  console.log("catalogs");
  await check("the nav uses only roles and permissions that exist in the catalogs", () => {
    for (const p of ["hr", "developer", "finance", "sales"]) for (const r of preset(p)) assert.ok(ALL_KNOWN_ROLES.includes(r), `role ${r}`);
    for (const k of ["lms.canViewAnalytics", "portal.isPortalAdmin", "workspace.canViewAnalytics", ...Object.values(MANAGE_PERMISSIONS)]) assert.ok(ALL_PERMISSION_KEYS.includes(k), `permission ${k}`);
    assert.equal(new Set(NAV_KEYS).size, NAV_KEYS.length, "nav keys are unique");
  });

  console.log("navigation = guard");
  for (const [name, companyId, u] of everyone) {
    await check(`${name}: the guard agrees with the navigation for all ${NAV_KEYS.length} keys`, async () => {
      const nav = await navOf(companyId, u);
      const shown = new Set(nav.sections.flatMap((s) => s.items.map((i) => i.key)));
      assert.deepEqual([...shown].sort(), [...nav.allowed].sort(), "sections contain exactly the allowed items");
      for (const key of NAV_KEYS) {
        const guard = await runAsCompany(companyId, () => checkWorkspaceAccess(u.user, key));
        assert.equal(guard, shown.has(key), `${key}: shown=${shown.has(key)} guard=${guard}`);
      }
      assert.ok(nav.sections.every((s) => s.items.length > 0), "no empty section");
      const order = NAV_SECTIONS.map((s) => s.key);
      assert.deepEqual(nav.sections.map((s) => s.key), order.filter((k) => nav.sections.some((s) => s.key === k)), "section order");
      assert.equal(await runAsCompany(companyId, () => checkWorkspaceAccess(u.user, "no.such.key")), false);
    });
  }

  console.log("who sees what");
  const ownerKeys = await allowed(owner, ownerAdmin);
  const noRolesNav = await allowed(acme, noRoles);
  await check("company super admin: every company and management item of the plan's products, no Platform link", async () => {
    const a = await allowed(acme, admin);
    for (const k of [...COMPANY_KEYS, ...GROWTH_MANAGE_KEYS, "dashboard", "account.documents", "account.notifications", "account.password"]) assert.ok(a.has(k), k);
    for (const k of MANAGE_KEYS.filter((x) => x.startsWith("manage.tms."))) assert.ok(!a.has(k), `${k}: Training is not in the plan`);
    assert.ok(MANAGE_KEYS.every((k) => ownerKeys.has(k)), "the unlimited owner company gets every register");
    for (const k of ["panel.hrms", "panel.pms", "panel.fms", "panel.lms", "panel.messenger", "analytics.fms", "analytics.portal", "analytics.workspace"]) assert.ok(a.has(k), k);
    assert.ok(!a.has("platform.panel"), "tenant never sees the Platform link");
    const nav = await navOf(acme, admin);
    assert.deepEqual(nav.sections.map((s) => s.key), ["dashboard", "panels", "analytics", "manage", "company", "account", "engagement", "ai"]);
    assert.deepEqual(nav.sections.filter((s) => s.sidebar).map((s) => s.key), ["dashboard", "company", "engagement", "ai"], "AI tools appear last in the sidebar");
    assert.ok(a.has("manage.push"), "website push notifications are available to the workspace admin");
    // Growth has no Training / Social / AI Bots: locked on the hub, absent from the nav.
    assert.ok(!a.has("panel.tms") && nav.lockedPanels.includes("tms"));
    assert.ok(!a.has("analytics.tms"));
  });
  await check("HR manager: HR product and analytics, nothing of company admin or company settings", async () => {
    const a = await allowed(acme, hr);
    for (const k of ["panel.hrms", "panel.lms", "panel.messenger", "panel.sop", "panel.ots", "analytics.hrms", "analytics.messenger", "analytics.workspace"]) assert.ok(a.has(k), k);
    for (const k of [...COMPANY_KEYS, ...MANAGE_KEYS, "panel.pms", "panel.fms", "analytics.fms", "analytics.pms", "analytics.lms", "analytics.portal", "platform.panel"]) assert.ok(!a.has(k), k);
    assert.deepEqual((await navOf(acme, hr)).sections.map((s) => s.key), ["dashboard", "panels", "analytics", "account"]);
    assert.deepEqual((await navOf(acme, hr)).sections.filter((s) => s.sidebar).map((s) => s.key), ["dashboard"]);
  });
  await check("PMS employee: own products only; lead and portal analytics are not theirs", async () => {
    const a = await allowed(acme, dev);
    for (const k of ["panel.pms", "panel.hrms", "panel.prms", "panel.dlms", "analytics.pms", "analytics.hrms", "analytics.prms"]) assert.ok(a.has(k), k);
    for (const k of ["panel.fms", "analytics.fms", "analytics.lms", "analytics.portal", "account.documents", "company.audit", "company.billing", "company.users"]) assert.ok(!a.has(k), k);
  });
  await check("finance user: Finance product and analytics", async () => {
    const a = await allowed(acme, finance);
    assert.ok(a.has("panel.fms") && a.has("analytics.fms"));
    assert.ok(!a.has("panel.pms") && !a.has("company.invoices") && !a.has("manage.prms.payments"));
  });
  await check("sales manager: lead analytics through the LMS role", async () => {
    assert.ok((await allowed(acme, sales)).has("analytics.lms"));
  });
  await check("permission overrides add and remove single items", async () => {
    const a = await allowed(acme, tuned);
    const base = await allowed(acme, dev);
    assert.ok(a.has("analytics.lms") && !base.has("analytics.lms"), "granted lms.canViewAnalytics");
    assert.ok(a.has("analytics.portal") && !base.has("analytics.portal"), "granted portal.isPortalAdmin");
    assert.ok(!a.has("analytics.workspace") && base.has("analytics.workspace"), "denied workspace.canViewAnalytics");
    assert.ok(a.has("manage.pms.projects") && a.has("manage.pms.timesheets") && !base.has("manage.pms.projects"), "granted workspace.manageProjects");
    assert.ok(!canViewCommandCenter({ roles: tuned.user.roles, permissionOverrides: tuned.user.permissionOverrides ?? null }) && !a.has("company.audit") && !a.has("account.documents") && !a.has("company.users") && !a.has("manage.prms.vendors") && !a.has("company.billing"), "one grant opens only its own pages");
  });
  await check("an account without roles gets the dashboard, the open CRM and its own account pages", async () => {
    const a = await allowed(acme, noRoles);
    assert.deepEqual([...a].sort(), ["account.notifications", "account.password", "account.sessions", "dashboard", "panel.lms", "panel.support", "panel.website"]);
  });
  await check("plan without Finance: the product is locked, its analytics hidden — for the finance user and the super admin", async () => {
    for (const u of [smallFinance, smallAdmin]) {
      const nav = await navOf(small, u);
      assert.ok(nav.lockedPanels.includes("fms"), "locked tile");
      assert.ok(!nav.allowed.includes("panel.fms") && !nav.allowed.includes("analytics.fms"));
      assert.equal(await runAsCompany(small, () => checkWorkspaceAccess(u.user, "analytics.fms")), false);
    }
    assert.ok((await allowed(small, smallAdmin)).has("panel.hrms"));
    assert.ok(!(await allowed(small, smallAdmin)).has("analytics.portal"), "portal is not in Starter");
    assert.ok((await allowed(small, smallAdmin)).has("company.billing"), "the company still manages its plan");
  });
  await check("a product the company switched off disappears (not locked)", async () => {
    await db.collection("companies").updateOne({ _id: beta as never }, { $set: { enabledModules: ["workspace", "admin", "messenger", "hrms"] } });
    const nav = await navOf(beta, betaAdmin);
    assert.ok(nav.allowed.includes("panel.hrms") && !nav.allowed.includes("panel.pms") && !nav.allowed.includes("analytics.pms"));
    assert.ok(!nav.lockedPanels.includes("pms"));
    await db.collection("companies").updateOne({ _id: beta as never }, { $unset: { enabledModules: "" } });
  });

  console.log("sidebar without the products; analytics for every product");
  const NEW_ANALYTICS = ["sop", "dlms", "ots", "aibots", "smms", "seo", "cms"];
  await check("the Products section is never in the sidebar, yet every product.* key still resolves and guards", async () => {
    assert.equal(NAV_SECTIONS.find((s) => s.key === "panels")?.sidebar, false);
    assert.deepEqual(NAV_SECTIONS.filter((s) => s.sidebar === false).map((s) => s.key), ["panels", "analytics", "manage", "account"], "the Staff Hub tiles and the Workspace settings replace these in the sidebar");
    for (const [name, companyId, u] of everyone) {
      const nav = await navOf(companyId, u);
      const sidebar = nav.sections.filter((s) => s.sidebar);
      assert.ok(!sidebar.some((s) => s.key === "panels"), `${name}: Products in the sidebar`);
      assert.ok(!sidebar.flatMap((s) => s.items).some((i) => i.key.startsWith("panel.")), `${name}: a product link in the sidebar`);
      const panels = nav.sections.find((s) => s.key === "panels");
      assert.deepEqual((panels?.items ?? []).map((i) => i.key).sort(), nav.allowed.filter((k) => k.startsWith("panel.")).sort(), `${name}: the products still resolve for the Staff Hub tiles`);
      assert.ok(panels && panels.items.length > 0 && panels.sidebar === false, `${name}: products section is resolved but not for the sidebar`);
      const ai = nav.sections.find((s) => s.key === "ai");
      assert.equal(ai?.sidebar ?? false, ai?.items.some((item) => item.key.startsWith("manage.chatbot.")) ?? false, `${name}: chatbot tools appear in the sidebar only when available`);
      const engagement = nav.sections.find((s) => s.key === "engagement");
      assert.equal(engagement?.sidebar ?? false, engagement?.items.some((item) => item.key === "manage.push") ?? false, `${name}: push notifications appear in the sidebar only when available`);
    }
    const a = await navOf(acme, admin);
    for (const k of ["panel.hrms", "panel.pms", "panel.sop", "panel.dlms", "panel.ots", "panel.seo", "panel.cms"]) assert.equal(await runAsCompany(acme, () => checkWorkspaceAccess(admin.user, k)), true, k);
    assert.ok(a.lockedPanels.includes("smms") && a.lockedPanels.includes("aibots") && a.lockedPanels.includes("tms"), "locked products are still reported for the upgrade tiles");
    assert.equal(await runAsCompany(acme, () => checkWorkspaceAccess(noRoles.user, "panel.hrms")), false);
  });
  await check("every product has an analytics item, in the section's alphabetical order", async () => {
    const keys = NAV_KEYS.filter((k) => k.startsWith("analytics."));
    assert.deepEqual(keys, [...keys].sort(), "ordered by product key");
    // AI Intelligence is a conversation and Help & Support a help desk, not registers: they deliberately have no company-wide analytics page.
    const NO_ANALYTICS = ["panel.intelligence", "panel.support", "panel.website"]; // the website product is analysed under analytics.cms
    for (const p of NAV_KEYS.filter((k) => k.startsWith("panel.") && !NO_ANALYTICS.includes(k))) assert.ok(keys.includes(p.replace("panel.", "analytics.")), `${p} has no analytics`);
    assert.ok(!keys.includes("analytics.intelligence"));
    const labels = Object.fromEntries((await navOf(owner, ownerAdmin)).sections.find((s) => s.key === "analytics")!.items.map((i) => [i.key, [i.label, i.href]]));
    assert.deepEqual(
      NEW_ANALYTICS.map((p) => labels[`analytics.${p}`]),
      [["SOPs & Policies Analytics", "/commandos/analytics/playbook-ai"], ["Digi Locker Analytics", "/commandos/analytics/cybervault"], ["Online Tests Analytics", "/commandos/analytics/evaliq"], ["AI Assistants Analytics", "/commandos/analytics/agentos"], ["Social Media Analytics", "/commandos/analytics/viralpulse-ai"], ["SEO Analytics", "/commandos/analytics/rankmax-ai"], ["Website Analytics", "/commandos/analytics/sitecraft-ai"]],
    );
  });
  await check("AI Intelligence: a product tile for its own roles only, gated by plan, no analytics, and it grants no data by itself", async () => {
    const analyst = await account(acme, "analyst@acme.test", ["intelligence_user"]);
    const intelAdmin = await account(acme, "intel-admin@acme.test", ["intelligence_admin"]);
    assert.ok((await allowed(acme, analyst)).has("panel.intelligence"));
    assert.ok((await allowed(acme, intelAdmin)).has("panel.intelligence"));
    assert.ok((await allowed(acme, admin)).has("panel.intelligence"), "Super Admin");
    for (const u of [hr, dev, finance, sales, noRoles]) assert.ok(!(await allowed(acme, u)).has("panel.intelligence"), "other roles don't get the product");
    assert.ok(![...(await allowed(acme, admin))].some((k) => k === "analytics.intelligence"));
    // Starter's plan does not include it: locked (upgrade tile), not accessible; the owner company has every product.
    assert.equal(await runAsCompany(small, () => checkWorkspaceAccess(smallAdmin.user, "panel.intelligence")), false);
    assert.ok((await navOf(small, smallAdmin)).lockedPanels.includes("intelligence"));
    assert.ok((await allowed(owner, ownerAdmin)).has("panel.intelligence"));
    // The product role opens the product only — the product's own auth accepts the Workspace session and re-checks the roles.
    const intelUser = (token: string) => runAsCompany(acme, async () => { const id = await workspaceSessionAccountId(token); return id ? getIntelligenceUserForAccount(id) : null; });
    assert.ok(await intelUser(analyst.hubToken));
    assert.equal(await intelUser(hr.hubToken), null);
    // The role is a Super-Admin-assignable role with a permission-catalogue entry.
    const { ROLE_GROUPS } = await import("@/lib/products/commandos/role-catalog");
    assert.ok(ROLE_GROUPS.some((g) => g.module === "AI Intelligence" && g.roles.map((r) => r.value).join() === "intelligence_admin,intelligence_user"));
    const { PERMISSION_GROUPS } = await import("@/lib/products/commandos/permission-catalog");
    assert.ok(PERMISSION_GROUPS.some((g) => g.module === "AI Intelligence" && g.permissions.some((p) => p.key === "intelligence.canUse")));
    await runAsCompany(acme, async () => (await getDb()).collection("admin_users").deleteMany({ _id: { $in: [analyst._id, intelAdmin._id] } }));
  });
  await check("new analytics: open to the product's own role, closed to every other role and to the product's per-person tier", async () => {
    // In the owner company (every product in the plan), one account per product role.
    const HOLDERS: [panel: string, role: string][] = [["sop", "sop_manager"], ["dlms", "dlms_manager"], ["ots", "ots_manager"], ["aibots", "aibots_manager"], ["smms", "smms_specialist"], ["seo", "seo_employee"], ["cms", "cms_viewer"]];
    const made: ObjectId[] = [];
    for (const [panel, role] of HOLDERS) {
      const u = await account(owner, `${role}@owner.test`, [role]);
      made.push(u._id);
      const a = await allowed(owner, u);
      assert.ok(a.has(`product.${panel}`), `${role} opens the ${panel} product`);
      for (const other of NEW_ANALYTICS) assert.equal(a.has(`analytics.${other}`), other === panel, `${role} → analytics.${other}`);
      for (const other of NEW_ANALYTICS) assert.equal(await runAsCompany(owner, () => checkWorkspaceAccess(u.user, `analytics.${other}`)), other === panel, `guard: ${role} → analytics.${other}`);
    }
    // People who only see their own slice of a product don't get its company-wide numbers.
    const SCOPED: [panel: string, role: string][] = [["sop", "sop_employee"], ["sop", "sop_author"], ["dlms", "dlms_employee"], ["ots", "ots_candidate"], ["aibots", "aibots_user"], ["smms", "smms_employee"]];
    for (const [panel, role] of SCOPED) {
      const u = await account(owner, `${role}@owner.test`, [role]);
      made.push(u._id);
      const a = await allowed(owner, u);
      assert.ok(a.has(`product.${panel}`), `${role} still opens the ${panel} product`);
      for (const other of NEW_ANALYTICS) assert.ok(!a.has(`analytics.${other}`), `${role} must not get analytics.${other}`);
    }
    // A single permission grant opens the analytics, exactly like inside the product.
    const granted = await account(owner, "smms-granted@owner.test", ["smms_employee"], { permissionOverrides: { "smms.canViewAnalytics": true } });
    const denied = await account(owner, "smms-denied@owner.test", ["smms_manager"], { permissionOverrides: { "smms.canViewAnalytics": false } });
    made.push(granted._id, denied._id);
    assert.ok((await allowed(owner, granted)).has("analytics.smms") && !(await allowed(owner, denied)).has("analytics.smms"));
    for (const u of [ownerHr, noRoles]) for (const p of ["dlms", "aibots", "smms", "seo", "cms"]) assert.equal(await runAsCompany(owner, () => checkWorkspaceAccess(u.user, `analytics.${p}`)), false, p);
    // The HR preset carries sop_manager + ots_manager: those two, nothing else.
    const h = await allowed(acme, hr);
    assert.deepEqual(NEW_ANALYTICS.filter((p) => h.has(`analytics.${p}`)), ["sop", "ots"]);
    // The developer preset is a SOP reader and a Digi Locker employee: none.
    const d = await allowed(acme, dev);
    assert.deepEqual(NEW_ANALYTICS.filter((p) => d.has(`analytics.${p}`)), []);
    assert.deepEqual(NEW_ANALYTICS.filter((p) => (noRolesNav.has(`analytics.${p}`))), []);
    await runAsCompany(owner, async () => (await getDb()).collection("admin_users").deleteMany({ _id: { $in: made } }));
  });
  await check("new analytics: the Command Center holder and the super admin get all seven; the plan and the product switch hide them", async () => {
    assert.ok(NEW_ANALYTICS.every((p) => ownerKeys.has(`analytics.${p}`)), "super admin of a company with every product");
    const exec = await account(owner, "exec@owner.test", preset("developer"), { permissionOverrides: { "workspace.viewCommandCenter": true } });
    const e = await allowed(owner, exec);
    assert.deepEqual(NEW_ANALYTICS.filter((p) => e.has(`analytics.${p}`)), NEW_ANALYTICS);
    assert.ok(!e.has("panel.smms") && !e.has("panel.aibots") && !e.has("panel.seo") && !e.has("panel.cms"), "analytics without the product itself");
    await runAsCompany(owner, async () => (await getDb()).collection("admin_users").deleteOne({ _id: exec._id }));

    // Growth has no Social Media / AI Bots; Starter has only SOP and Website of the seven.
    const growth = await allowed(acme, admin);
    assert.deepEqual(NEW_ANALYTICS.filter((p) => growth.has(`analytics.${p}`)), ["sop", "dlms", "ots", "seo", "cms"]);
    const starter = await allowed(small, smallAdmin);
    assert.deepEqual(NEW_ANALYTICS.filter((p) => starter.has(`analytics.${p}`)), ["sop", "cms"]);
    for (const p of ["smms", "aibots"]) assert.equal(await runAsCompany(acme, () => checkWorkspaceAccess(admin.user, `analytics.${p}`)), false, `Growth: analytics.${p}`);
    for (const p of ["dlms", "ots", "seo", "smms", "aibots"]) assert.equal(await runAsCompany(small, () => checkWorkspaceAccess(smallAdmin.user, `analytics.${p}`)), false, `Starter: analytics.${p}`);
    // Analytics of a product outside the plan is hidden, not a locked tile of its own.
    assert.ok((await navOf(acme, admin)).lockedPanels.every((p) => !growth.has(`analytics.${p}`)));

    await db.collection("companies").updateOne({ _id: beta as never }, { $set: { enabledModules: ["workspace", "admin", "messenger", "hrms", "sop"] } });
    const off = await allowed(beta, betaAdmin);
    assert.deepEqual(NEW_ANALYTICS.filter((p) => off.has(`analytics.${p}`)), ["sop"], "switched-off products lose their analytics");
    assert.equal(await runAsCompany(beta, () => checkWorkspaceAccess(betaAdmin.user, "analytics.cms")), false);
    await db.collection("companies").updateOne({ _id: beta as never }, { $unset: { enabledModules: "" } });
    assert.equal(await runAsCompany(beta, () => checkWorkspaceAccess(betaAdmin.user, "analytics.cms")), true);
  });

  console.log("platform boundary");
  await check("Platform link: only owner company + platform access", async () => {
    assert.ok((await allowed(owner, ownerAdmin)).has("platform.panel"), "platform owner");
    assert.ok(!(await allowed(owner, ownerRevoked)).has("platform.panel"), "revoked");
    assert.ok(!(await allowed(owner, ownerHr)).has("platform.panel"), "no platform role");
    for (const [, companyId, u] of everyone.filter(([, c]) => c !== owner)) assert.ok(!(await allowed(companyId, u)).has("platform.panel"));
  });
  await check("a platform role gives the link without any Workspace permission, and Workspace roles don't give the link", async () => {
    await runAsCompany(owner, async () => (await getDb()).collection("admin_users").updateOne({ _id: ownerHr._id }, { $set: { platformRoleId: "owner" } }));
    const a = await allowed(owner, ownerHr);
    assert.ok(a.has("platform.panel"));
    assert.ok(!a.has("company.billing") && !a.has("company.audit") && !a.has("account.documents"), "platform access is not company management");
    await runAsCompany(owner, async () => (await getDb()).collection("admin_users").updateOne({ _id: ownerHr._id }, { $unset: { platformRoleId: "" } }));
    assert.ok((await allowed(owner, ownerRevoked)).has("company.billing"), "revoked platform access keeps company management");
  });
  await check("the nav never contains a Platform Console page other than the single link", async () => {
    const nav = await navOf(owner, ownerAdmin);
    const platformLinks = nav.sections.flatMap((s) => s.items).filter((i) => i.href.startsWith("/console"));
    assert.deepEqual(platformLinks.map((i) => i.href), ["/console"]);
  });

  console.log("moved pages, actions and APIs are guarded with their own nav key");
  const ROOT = path.join(process.cwd(), "src/app");
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const MOVED = ["users", "account", "crm", "pms", "prms", "tms", "teamchat", "portal", "careers", "chatbot"];
  const keyOf = (rel: string) => {
    const [a, b] = rel.split(path.sep);
    if (a === "users") return "company.users";
    if (a === "documents" || (a === "account" && b === "documents")) return "account.documents";
    if (a === "usage") return "company.usage";
    if (a === "backups") return "company.backups";
    if (a === "account" && b === "sessions") return "account.sessions";
    if (a === "activity-log") return "company.audit";
    return `manage.${a}.${b}`;
  };
  await check("every moved page calls requireWorkspaceAccess with the key of its own path", () => {
    let pages = 0;
    for (const d of MOVED) {
      for (const file of walk(path.join(ROOT, "workspace/(protected)", d)).filter((f) => f.endsWith("page.tsx"))) {
        const key = keyOf(path.relative(path.join(ROOT, "workspace/(protected)"), file));
        assert.ok(NAV_KEYS.includes(key), `${file}: ${key} is not a nav key`);
        assert.ok(fs.readFileSync(file, "utf8").includes(`requireWorkspaceAccess("${key}")`), `${file} must guard with ${key}`);
        pages++;
      }
    }
    assert.equal(pages, 32);
  });
  await check("every server action of a moved page calls requireWorkspaceAction with that key", () => {
    let actions = 0;
    for (const d of MOVED) {
      for (const file of walk(path.join(ROOT, "workspace/(protected)", d)).filter((f) => f.endsWith("actions.ts"))) {
        const key = keyOf(path.relative(path.join(ROOT, "workspace/(protected)"), file));
        const src = fs.readFileSync(file, "utf8");
        const exported = (src.match(/^export async function /gm) ?? []).length;
        const guarded = src.split(`requireWorkspaceAction("${key}")`).length - 1;
        assert.ok(exported > 0 && guarded === exported, `${file}: ${exported} actions, ${guarded} guards`);
        actions += exported;
      }
    }
    assert.ok(actions >= 80, `${actions} actions`);
  });
  await check("every /api/commandos route authorizes with the key of its page; no /api/admin left", () => {
    const routes = walk(path.join(ROOT, "api/commandos")).filter((f) => f.endsWith("route.ts"));
    assert.equal(routes.length, 35);
    for (const file of routes) {
      const key = keyOf(path.relative(path.join(ROOT, "api/commandos"), file));
      assert.ok(NAV_KEYS.includes(key), `${file}: ${key}`);
      const src = fs.readFileSync(file, "utf8");
      assert.ok(src.includes(`authorizeWorkspaceApi("${key}")`) && src.includes("if (!auth.ok) return auth.response;"), `${file} must authorize with ${key}`);
    }
    assert.ok(!fs.existsSync(path.join(ROOT, "admin")) && !fs.existsSync(path.join(ROOT, "api/admin")), "the admin routes are gone");
  });
  await check("each moved page key per role: super admin yes, every other role no, single grants only their own", async () => {
    for (const key of GROWTH_MANAGE_KEYS.concat("company.users")) {
      assert.equal(await runAsCompany(acme, () => checkWorkspaceAccess(admin.user, key)), true, key);
      for (const u of [hr, dev, finance, sales, noRoles]) assert.equal(await runAsCompany(acme, () => checkWorkspaceAccess(u.user, key)), false, key);
      assert.equal(await runAsCompany(acme, () => checkWorkspaceAccess(tuned.user, key)), key.startsWith("manage.pms."), key);
      assert.equal(await runAsCompany(beta, () => checkWorkspaceAccess(hr.user, key)), false, "roles of another company's user change nothing here");
    }
  });
  await check("registers of a product outside the plan or switched off are closed even to the super admin (F12)", async () => {
    for (const k of ["manage.pms.projects", "manage.crm.clients", "manage.crm.leads", "company.users", "company.audit", "account.documents"]) assert.ok((await allowed(small, smallAdmin)).has(k), k);
    for (const k of ["manage.prms.vendors", "manage.tms.students", "manage.portal.users"]) assert.equal(await runAsCompany(small, () => checkWorkspaceAccess(smallAdmin.user, k)), false, k);
    await db.collection("companies").updateOne({ _id: beta as never }, { $set: { enabledModules: ["workspace", "admin", "messenger", "hrms"] } });
    assert.equal(await runAsCompany(beta, () => checkWorkspaceAccess(betaAdmin.user, "manage.pms.projects")), false);
    assert.equal(await runAsCompany(beta, () => checkWorkspaceAccess(betaAdmin.user, "manage.teamchat.channels")), true, "core product");
    await db.collection("companies").updateOne({ _id: beta as never }, { $unset: { enabledModules: "" } });
  });
  await check("the Command Center permission opens the full analytics of every product in the plan", async () => {
    const exec = await account(acme, "exec@acme.test", preset("developer"), { permissionOverrides: { "workspace.viewCommandCenter": true } });
    const a = await allowed(acme, exec);
    for (const k of ["analytics.fms", "analytics.lms", "analytics.portal"]) assert.ok(a.has(k), k);
    assert.ok(canViewCommandCenter({ roles: exec.user.roles, permissionOverrides: exec.user.permissionOverrides ?? null }), "holds the Command Center permission");
    assert.ok(!a.has("analytics.tms") && !a.has("company.users") && !a.has("company.audit") && !a.has("account.documents"));
    assert.equal(await runAsCompany(acme, () => seesPanelNotifications(exec.user)), true);
    await runAsCompany(acme, async () => (await getDb()).collection("admin_users").deleteOne({ _id: exec._id }));
  });
  await check("a delegated user manager can't grant Super Admin, touch a Super Admin or edit overrides", async () => {
    await runAsCompany(acme, async () => {
      const delegate = { roles: preset("hr") };
      assert.equal(await delegatedManagerBlock(admin.user, { targetId: admin.user.id, roles: ["super_admin"], overrides: true }), null, "Super Admins are not limited");
      assert.match((await delegatedManagerBlock(delegate, { roles: ["employee", "super_admin"] })) ?? "", /grant the Super Admin role/);
      assert.match((await delegatedManagerBlock(delegate, { targetId: admin.user.id })) ?? "", /Super Admin's account/);
      assert.match((await delegatedManagerBlock(delegate, { targetId: dev.user.id, overrides: true })) ?? "", /permission overrides/);
      assert.equal(await delegatedManagerBlock(delegate, { targetId: dev.user.id, roles: ["pms_employee"] }), null);
    });
  });

  console.log("one company sign-in");
  const PANELS: [string, (id: ObjectId) => Promise<unknown>][] = [
    ["hrms", getHrmsUserForAccount], ["pms", getPmsUserForAccount], ["fms", getFmsUserForAccount], ["lms", getLmsUserForAccount], ["prms", getPrmsUserForAccount],
    ["tms", getTmsUserForAccount], ["ots", getOtsUserForAccount], ["sop", getSopUserForAccount], ["dlms", getDlmsUserForAccount], ["cms", getCmsUserForAccount],
    ["seo", getSeoUserForAccount], ["smms", getSmmsUserForAccount], ["aibots", getAibotsUserForAccount], ["intelligence", getIntelligenceUserForAccount], ["messenger", getChatUserForAccount],
  ];
  /** What a product's auth resolves for a request that carries only the Workspace session cookie. */
  const panelUser = (companyId: string, hubToken: string | null, load: (id: ObjectId) => Promise<unknown>) =>
    runAsCompany(companyId, async () => {
      const id = await workspaceSessionAccountId(hubToken);
      return id ? load(id) : null;
    });
  await check("the Workspace session opens all 15 products for a super admin", async () => {
    for (const [name, load] of PANELS) assert.ok(await panelUser(acme, admin.hubToken, load), name);
  });
  await check("for other roles it opens exactly the products their roles allow", async () => {
    const opens = async (u: { hubToken: string }) => (await Promise.all(PANELS.map(async ([name, load]) => ((await panelUser(acme, u.hubToken, load)) ? name : null)))).filter(Boolean);
    assert.deepEqual(await opens(hr), ["hrms", "lms", "ots", "sop", "messenger"]);
    assert.deepEqual(await opens(dev), ["hrms", "pms", "lms", "prms", "ots", "sop", "dlms", "messenger"]);
    assert.deepEqual(await opens(noRoles), ["lms"], "the CRM has no role gate; nothing else opens");
    for (const u of [hr, dev, noRoles]) {
      const nav = await allowed(acme, u);
      // The sidebar offers a product only when the product's own auth would let the account in (the plan can hide more).
      for (const [name, load] of PANELS) if (nav.has(`product.${name}`)) assert.ok(await panelUser(acme, u.hubToken, load), `${name} is listed but would refuse`);
    }
  });
  await check("another company's session, no session and a made-up token open no product", async () => {
    for (const [name, load] of PANELS) {
      assert.equal(await panelUser(beta, admin.hubToken, load), null, `${name}: other company's session`);
      assert.equal(await panelUser(acme, null, load), null, name);
      assert.equal(await panelUser(acme, "bogus", load), null, name);
    }
  });
  await check("an old admin-product session grants nothing", async () => {
    const token = randomBytes(32).toString("hex");
    await runAsCompany(acme, async () =>
      (await getDb()).collection("admin_sessions").insertOne({ tokenHash: createHash("sha256").update(token).digest("hex"), adminId: admin._id, createdAt: now, expiresAt: new Date(now.getTime() + 86_400_000) }),
    );
    assert.equal(await runAsCompany(acme, () => workspaceSessionAccountId(token)), null);
    assert.equal(await runAsCompany(acme, () => getSessionHubUser(token)), null);
    for (const [name, load] of PANELS) assert.equal(await panelUser(acme, token, load), null, name);
    const reads = walk(path.join(process.cwd(), "src")).filter((f) => /\.tsx?$/.test(f) && fs.readFileSync(f, "utf8").includes('"admin_session"'));
    assert.deepEqual(reads.map((f) => path.basename(f)), ["cross-module-sso.ts"], "the cookie is only ever deleted");
    assert.ok(!fs.existsSync(path.join(process.cwd(), "src/lib/admin-auth.ts")));
  });
  await check("losing a role closes the product and the pages for the existing session at once", async () => {
    const temp = await account(acme, "temp@acme.test", ["super_admin"]);
    assert.ok(await panelUser(acme, temp.hubToken, getFmsUserForAccount));
    await runAsCompany(acme, async () => (await getDb()).collection("admin_users").updateOne({ _id: temp._id }, { $set: { roles: preset("hr") } }));
    assert.equal(await panelUser(acme, temp.hubToken, getFmsUserForAccount), null);
    const fresh = await runAsCompany(acme, () => getSessionHubUser(temp.hubToken));
    for (const k of ["company.billing", "company.users", "company.audit", "account.documents"]) assert.equal(await runAsCompany(acme, () => checkWorkspaceAccess(fresh!, k)), false, k);
    await runAsCompany(acme, async () => (await getDb()).collection("admin_users").deleteOne({ _id: temp._id }));
  });
  await check("every product's /login is a redirect to the Workspace sign-in; no product keeps its own form", () => {
    for (const [name] of PANELS) {
      const dir = path.join(ROOT, name, "login");
      assert.deepEqual(fs.readdirSync(dir), ["page.tsx"], name);
      assert.ok(fs.readFileSync(path.join(dir, "page.tsx"), "utf8").includes(`redirect(workspaceLoginUrl("/${name}"))`), name);
    }
  });
  await check("return path after sign-in: same-origin paths only", () => {
    for (const ok of ["/talentos", "/sprintos/projects?tab=1", "/commandos/users"]) assert.equal(safeNextPath(ok), ok);
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "hrms", "", "/commandos/login", "/commandos/login?next=/x", "/a\nb", "/x?u=http://evil.example", ["/talentos"], null, undefined, "/" + "a".repeat(600)]) assert.equal(safeNextPath(bad), null, String(bad));
    assert.equal(workspaceLoginUrl("/talentos"), "/commandos/login?next=%2Fhrms");
    assert.equal(workspaceLoginUrl("//evil.example"), "/commandos/login");
  });

  console.log("one notification feed");
  await check("workspace and product notifications in one list; mark-read goes to the right store", async () => {
    await runAsCompany(acme, async () => {
      await notifyWorkspace({ to: { userId: admin.user.id }, title: "From an automation", url: "/commandos" });
      await notifyWorkspace({ to: { userId: hr.user.id }, title: "For HR", url: "/talentos" });
      await notifyPms({ recipientUserId: admin.user.id, type: "task_assigned", title: "From Projects", body: null, link: "/sprintos" } as never);
      await notifyPms({ recipientUserId: hr.user.id, type: "task_assigned", title: "HR's own PMS item", body: null, link: "/sprintos" } as never);

      const adminUser = (await getSessionHubUser(admin.hubToken))!;
      const hrUser = (await getSessionHubUser(hr.hubToken))!;
      assert.equal(await seesPanelNotifications(hrUser), false);
      const list = await listWorkspaceNotifications(adminUser);
      assert.deepEqual(list.map((n) => [n.source, n.title]).sort(), [["pms", "From Projects"], ["workspace", "From an automation"]]);
      assert.equal(await workspaceUnreadCount(adminUser), 2);
      // Without the Command Center permission: the Workspace's own notifications only.
      assert.deepEqual((await listWorkspaceNotifications(hrUser)).map((n) => n.title), ["For HR"]);
      assert.equal(await workspaceUnreadCount(hrUser), 1);

      const pmsItem = list.find((n) => n.source === "pms")!;
      await markWorkspaceNotificationRead(hrUser, "pms", pmsItem.id); // someone else's: no effect
      assert.equal(await workspaceUnreadCount(adminUser), 2);
      await markWorkspaceNotificationRead(adminUser, "pms", pmsItem.id);
      assert.equal(await workspaceUnreadCount(adminUser), 1);
      assert.equal((await listWorkspaceNotifications(adminUser)).find((n) => n.source === "pms")!.read, true);
      await markAllWorkspaceNotificationsRead(adminUser);
      assert.equal(await workspaceUnreadCount(adminUser), 0);
      assert.equal(await workspaceUnreadCount(hrUser), 1, "other people's notifications are untouched");
    });
    assert.deepEqual(await runAsCompany(beta, async () => (await listWorkspaceNotifications((await getSessionHubUser(betaAdmin.hubToken))!)).length), 0);
  });

  console.log("tenant isolation of the company pages");
  const invoice = (companyId: string, over: Record<string, unknown>) => ({
    _id: randomUUID() as never,
    kind: "invoice",
    companyId,
    financialYear: "26-27",
    status: "paid",
    paymentRef: null,
    refundRef: null,
    currency: "INR",
    total: 118000,
    taxTotal: 18000,
    issuedAt: now,
    paidAt: now,
    original: null,
    ...over,
  });
  await db.collection("saas_invoices").insertMany([
    invoice(acme, { number: "YO/26-27/00001", paymentRef: "pay_acme_1", paidAt: new Date(now.getTime() - 86_400_000) }),
    invoice(acme, { number: "YO/26-27/00002", status: "unpaid", paidAt: null }),
    invoice(acme, { number: "CN/26-27/00001", kind: "credit_note", status: "issued", refundRef: "rfnd_acme_1", total: 50000, paidAt: null, original: { id: "x", number: "YO/26-27/00001", issuedAt: now } }),
  ]);
  await runAsCompany(acme, async () => {
    await recordUsage("ai_tokens", 1234);
    await meterStorage(3 * 1024 * 1024);
    const d = await getDb();
    await d.collection("workflows").insertOne({ _id: randomUUID() as never, name: "Hook", enabled: true, trigger: "lead.created", conditions: [], actions: [{ type: "webhook", url: "https://example.com/hook" }], secret: "s", lastRun: null, createdAt: now, updatedAt: now });
    await d.collection("admin_users").updateOne({ _id: dev._id }, { $set: { mustChangePassword: true } });
    await d.collection("admin_users").updateOne({ _id: hr._id }, { $set: { lockedUntil: new Date(now.getTime() + 600_000) } });
  });
  await db.collection("company_domains").insertMany([
    { _id: "acme.localhost" as never, companyId: acme, status: "verified", verificationToken: "t", isPrimary: true, kind: "subdomain", createdAt: now, verifiedAt: now },
    { _id: "app.acme.example" as never, companyId: acme, status: "verified", verificationToken: "t", isPrimary: false, kind: "custom", createdAt: now, verifiedAt: now },
  ]);

  await check("usage: own seats, AI tokens and storage against the plan's limits", async () => {
    const u = await runAsCompany(acme, () => getCompanyUsage());
    assert.equal(u.planName, "Growth");
    assert.deepEqual([u.seats.used, u.seats.limit], [6, 50], "six accounts with roles");
    assert.deepEqual([u.aiTokens.used, u.aiTokens.limit], [1234, 1_000_000]);
    assert.deepEqual([u.storageMb.used, u.storageMb.limit], [3, 10_000]);
    const b = await runAsCompany(beta, () => getCompanyUsage());
    assert.deepEqual([b.seats.used, b.aiTokens.used, b.storageMb.used], [1, 0, 0], "the second company sees only its own usage");
    const o = await runAsCompany(owner, () => getCompanyUsage());
    assert.deepEqual([o.status, o.seats.limit, o.aiTokens.limit, o.storageMb.limit], ["internal", null, null, null]);
  });
  await check("usage levels: near and over the limit", async () => {
    await runAsCompany(small, () => recordUsage("ai_tokens", 330_000));
    assert.equal((await runAsCompany(small, () => getCompanyUsage())).aiTokens.level, "near");
    await runAsCompany(small, () => recordUsage("ai_tokens", 80_000));
    assert.equal((await runAsCompany(small, () => getCompanyUsage())).aiTokens.level, "over");
  });
  await check("payments: paid invoices and credit notes of this company only", async () => {
    const a = await runAsCompany(acme, () => getCompanyBillingHistory());
    assert.equal(a.invoices.length, 3);
    assert.deepEqual(a.payments.map((p) => [p.kind, p.documentNumber, p.reference, p.amount]), [
      ["refund", "CN/26-27/00001", "rfnd_acme_1", 50000],
      ["payment", "YO/26-27/00001", "pay_acme_1", 118000],
    ]);
    for (const other of [beta, small, owner]) {
      const b = await runAsCompany(other, () => getCompanyBillingHistory());
      assert.deepEqual([b.invoices.length, b.payments.length], [0, 0]);
    }
    assert.deepEqual(paymentsFromInvoices([]), []);
  });
  await check("integrations: status from the company's own gateway, webhooks and domains", async () => {
    const a = await runAsCompany(acme, () => listCompanyIntegrations());
    assert.deepEqual(a.map((i) => [i.key, i.connected]), [["razorpay", false], ["webhooks", true], ["domain", true]]);
    assert.deepEqual(a.map((i) => i.href), ["/commandos/settings/payments", "/commandos/settings/automations", "/commandos/settings/domains"]);
    const b = await runAsCompany(beta, () => listCompanyIntegrations());
    assert.deepEqual(b.map((i) => i.connected), [false, false, false], "the second company sees none of the first's integrations");
  });
  await check("security: own accounts and own sessions only", async () => {
    const a = await runAsCompany(acme, () => getCompanySecurity(admin.user.id));
    assert.deepEqual(a, { accounts: 6, superAdmins: 1, mustChangePassword: 1, locked: 1, ownSessions: 1 });
    const b = await runAsCompany(beta, () => getCompanySecurity(betaAdmin.user.id));
    assert.deepEqual(b, { accounts: 1, superAdmins: 1, mustChangePassword: 0, locked: 0, ownSessions: 1 });
    // Another company's user id finds no sessions here.
    assert.equal((await runAsCompany(beta, () => getCompanySecurity(admin.user.id))).ownSessions, 0);
  });


  console.log("one dashboard, one audit log, documents under Account, everything under /commandos");
  await check("the nav has one Dashboard and no Command Center; no audit item in Management; Documents in Account; Audit log in Company", async () => {
    const nav = await navOf(acme, admin);
    const items = nav.sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.key })));
    assert.equal(items.filter((i) => i.section === "dashboard").length, 1);
    assert.deepEqual(items.filter((i) => /dashboard/i.test(i.label)).map((i) => i.href), ["/commandos"]);
    assert.ok(!items.some((i) => /command center/i.test(i.label) || i.href.includes("command-center")), "no Command Center item");
    assert.ok(!NAV_KEYS.some((k) => k === "manage.command-center" || k === "manage.activity-log" || k === "manage.documents"), "old manage keys are gone");
    assert.ok(!items.filter((i) => i.section === "manage").some((i) => /audit|activity|documents/i.test(i.label)), "Management has no audit/activity/documents item");
    assert.deepEqual(items.filter((i) => i.section === "account").map((i) => [i.key, i.href]).sort(), [
      ["account.documents", "/commandos/account/documents"],
      ["account.notifications", "/commandos/notifications"],
      ["account.password", "/commandos/change-password"],
      ["account.sessions", "/commandos/account/sessions"],
    ]);
    const audit = items.filter((i) => i.section === "company" && /audit/i.test(i.label));
    assert.deepEqual(audit.map((i) => [i.key, i.label, i.href]), [["company.audit", "Audit log", "/commandos/settings/audit-log"]]);
    assert.ok(!items.some((i) => i.section === "company" && i.key === "company.activity"), "the old Company activity item is gone");
  });
  await check("every Workspace nav href (except products and the Platform link) lives under /commandos and has a page", async () => {
    const nav = await navOf(owner, ownerAdmin);
    const PROTECTED = path.join(ROOT, "workspace/(protected)");
    for (const i of nav.sections.flatMap((s) => s.items)) {
      if (i.external || i.href === "/console" || i.key.startsWith("panel.")) continue;
      assert.ok(i.href === "/commandos" || i.href.startsWith("/commandos/"), `${i.key}: ${i.href}`);
      assert.ok(!/^\/(settings|onboarding|upgrade)/.test(i.href), i.href);
      const rel = i.href.replace(/^\/workspace\/?/, "");
      const candidates = [path.join(PROTECTED, rel, "page.tsx"), path.join(ROOT, "workspace", rel, "page.tsx"), path.join(PROTECTED, rel.replace(/\/[^/]+$/, ""), "[panel]", "page.tsx"), path.join(PROTECTED, rel.replace(/\/[^/]+$/, ""), "[kind]", "page.tsx")];
      assert.ok(candidates.some((f) => fs.existsSync(f)), `${i.key}: no page for ${i.href}`);
    }
    for (const old of ["command-center", "activity-log", "documents"]) assert.ok(!fs.existsSync(path.join(PROTECTED, old)), `old page /commandos/${old} is gone`);
    for (const old of [["(platform)", "settings"], ["(platform)", "onboarding"], ["(platform)", "upgrade"]]) assert.ok(!fs.existsSync(path.join(ROOT, ...old)), `${old.join("/")} moved`);
  });
  await check("the company pages keep a server-side guard: their nav key, or the company Super Admin rule they always used", () => {
    const PROTECTED = path.join(ROOT, "workspace/(protected)");
    const nameOf = (href: string) => href.replace("/commandos/", "");
    const guards = (file: string, key: string) => {
      const src = fs.readFileSync(file, "utf8");
      return src.includes(`requireWorkspaceAccess("${key}")`) || (src.includes('roles.includes("super_admin")') && src.includes("getCurrentHubUser"));
    };
    const pages: [string, string][] = [
      ["company.setup", "onboarding"], ["company.profile", "settings/profile"], ["company.billing", "settings/billing"], ["company.invoices", "settings/billing/invoices"],
      ["company.usage", "settings/usage"], ["company.domains", "settings/domains"], ["company.branding", "settings/branding"], ["company.payments", "settings/payments"],
      ["company.integrations", "settings/integrations"], ["company.automations", "settings/automations"], ["company.import", "settings/import"], ["company.security", "settings/security"],
    ];
    for (const [key, rel] of pages) {
      assert.ok(NAV_KEYS.includes(key), key);
      assert.ok(guards(path.join(PROTECTED, rel, "page.tsx"), key), `${rel} must guard`);
    }
    assert.ok(nameOf("/commandos/settings/audit-log") === "settings/audit-log");
    assert.ok(fs.readFileSync(path.join(PROTECTED, "settings/audit-log/page.tsx"), "utf8").includes('requireWorkspaceAccess("company.audit")'));
    for (const f of ["import/run/route.ts", "import/sample/route.ts"]) assert.ok(fs.readFileSync(path.join(PROTECTED, "settings", f), "utf8").includes('"super_admin"'), f);
  });
  await check("Audit log: product activity needs the Audit log permission, workspace events the company Super Admin; the source can only narrow", async () => {
    const asCtx = (u: { user: WorkspaceUser }) => ({ roles: u.user.roles, permissionOverrides: u.user.permissionOverrides ?? null });
    const access = (u: { user: WorkspaceUser }) => ({ panels: canViewAuditLog(asCtx(u)), workspace: canViewWorkspaceEvents(asCtx(u)) });
    assert.deepEqual(access(admin), { panels: true, workspace: true });
    assert.deepEqual(allowedAuditSources(access(admin)), ["all", "workspace", "panels"]);
    assert.equal(resolveAuditSource(undefined, access(admin)), "all");
    assert.equal(resolveAuditSource("workspace", access(admin)), "workspace");
    for (const u of [hr, dev, finance, sales, noRoles]) assert.deepEqual(access(u), { panels: false, workspace: false });
    const auditor = await account(acme, "auditor@acme.test", preset("developer"), { permissionOverrides: { "workspace.viewAuditLog": true } });
    assert.deepEqual(access(auditor), { panels: true, workspace: false }, "the permission alone never opens workspace events");
    assert.deepEqual(allowedAuditSources(access(auditor)), ["panels"]);
    assert.equal(resolveAuditSource("workspace", access(auditor)), "panels", "asking for a source they may not read gives their own");
    assert.equal(resolveAuditSource("all", access(auditor)), "panels");
    assert.equal(resolveAuditSource("workspace", { panels: false, workspace: false }), null);
    assert.equal(await runAsCompany(acme, () => checkWorkspaceAccess(auditor.user, "company.audit")), true);
    assert.equal(await runAsCompany(acme, () => checkWorkspaceAccess(auditor.user, "company.billing")), false);
    await runAsCompany(acme, async () => (await getDb()).collection("admin_users").deleteOne({ _id: auditor._id }));
  });
  await check("the merged dashboard loader returns executive data only to the Command Center permission", async () => {
    const asCtx = (u: { user: WorkspaceUser }) => ({ roles: u.user.roles, permissionOverrides: u.user.permissionOverrides ?? null });
    for (const u of [hr, dev, finance, sales, noRoles, tuned]) assert.equal(await runAsCompany(acme, () => loadExecutiveOverview(asCtx(u))), null);
    const exec = await account(acme, "exec2@acme.test", preset("developer"), { permissionOverrides: { "workspace.viewCommandCenter": true } });
    const stats = await runAsCompany(acme, () => loadExecutiveOverview(asCtx(exec)));
    assert.ok(stats && typeof stats.finance.totalRevenue === "number" && Array.isArray(stats.modules), "permission holder gets the executive stats");
    const adminStats = await runAsCompany(acme, () => loadExecutiveOverview(asCtx(admin)));
    assert.ok(adminStats, "super admin gets them");
    await runAsCompany(acme, async () => (await getDb()).collection("admin_users").deleteOne({ _id: exec._id }));
  });
  await check("next.config redirects: every old URL maps permanently to its new home; /api, /platform and products are never captured", async () => {
    const cfg = (await import("../next.config")).default;
    const rules = (await cfg.redirects!()) as { source: string; destination: string; permanent: boolean }[];
    const dest = (src: string) => rules.find((r) => r.source === src);
    const expected: [string, string][] = [
      ["/settings/:path*", "/commandos/settings/:path*"], ["/onboarding", "/commandos/onboarding"], ["/upgrade", "/commandos/upgrade"],
      ["/commandos/command-center", "/commandos"], ["/commandos/documents", "/commandos/account/documents"],
      ["/settings/activity", "/commandos/settings/audit-log?source=workspace"], ["/commandos/activity-log", "/commandos/settings/audit-log?source=products"],
    ];
    for (const [src, to] of expected) {
      const r = dest(src);
      assert.ok(r, src);
      assert.equal(r!.destination, to);
      assert.equal(r!.permanent, true, `${src} is permanent`);
    }
    assert.ok(rules.findIndex((r) => r.source === "/settings/activity") < rules.findIndex((r) => r.source === "/settings/:path*"), "activity before the catch-all");
    // Moved pages in products (e.g. /cashflow-ai/audit-logs, /dealflow-ai/offers) have their own redirects; none may swallow /api, /platform or a whole product.
    for (const r of rules) assert.ok(!/^\/(api|platform)\b/.test(r.source) && !/^\/(hrms|pms|prms|tms|fms|lms|cms|portal)(\/:path\*)?$/.test(r.source), `${r.source} must not capture /api, /platform or a whole product`);
  });

  console.log(`workspace access: all ${passed} checks passed`);
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
