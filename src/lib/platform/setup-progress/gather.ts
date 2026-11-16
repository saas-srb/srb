import "server-only";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { getOnboarding, enabledModules } from "@/lib/platform/onboarding/state";
import { getCompanyIdentityView } from "@/lib/platform/company-identity";
import { listDepartments, listDesignations, listTeams } from "@/lib/platform/organization";
import { listPendingInvitations } from "@/lib/platform/invitations";
import { entitlementsFor } from "@/lib/platform/billing/entitlements";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { listPanels, unavailablePanelKeys } from "@/lib/platform/panels/store";
import { listConnectionViews } from "@/lib/platform/connections/store";
import { CONNECTION_PROVIDERS, HIDDEN_FROM_COMPANIES, providerByKey } from "@/lib/platform/connections/catalog";
import { connectionStatus } from "@/lib/platform/connections/summary";
import { listCompanyIntegrations } from "@/lib/products/commandos/company";
import { listCompanyDomains } from "@/lib/platform/domains/custom";
import { getCompanySender } from "@/lib/platform/email/sender";
import { getCompanyBrand } from "@/lib/platform/branding";
import { listBackups } from "@/lib/products/commandos/backups";
import { platformServiceReady } from "@/lib/platform/connections/platform-services";
import { getPdfKbSummary } from "@/lib/kb-pdf";
import { getWebsiteKbSummary } from "@/lib/kb-website";
import { LEAD_RECORDS_COLLECTION } from "@/lib/lead-management/records";
import { connectionState } from "@/lib/platform/setup-progress/connection-state";
import { getMarks } from "@/lib/platform/setup-progress/store";
import type { ConnState, FactGroup, SetupFacts } from "@/lib/platform/setup-progress/types";

/** Where a product's settings are saved: a person saving them sets `updatedBy` (a default document created by reading has none). */
const SETTINGS_DOCS: Record<string, string[]> = {
  hrms: ["hrms_settings", "hrms_payroll_config"], pms: ["pms_settings"], tms: ["training_settings"], fms: ["fms_accrual_settings"], prms: ["prms_settings"],
  aibots: ["aibots_settings"], ots: ["ots_settings"], smms: ["smms_settings"], seo: ["seo_settings"], dlms: ["dlms_settings"], sop: ["pb_settings"], cms: ["cms_settings"],
};
const USAGE: Record<string, string> = { hrms: "hrms_employees", pms: "pms_clients", prms: "prms_vendors", lms: LEAD_RECORDS_COLLECTION, sop: "pb_documents", fms: "fms_transactions" };

/**
 * Reads everything the setup checks need, in a few batched queries, each group on its own: a group that fails is reported in `failed` and only its
 * steps show "could not check". Company-scoped (every query runs in the current company's context).
 */
export async function gatherFacts(): Promise<SetupFacts> {
  const failed: FactGroup[] = [];
  const f: SetupFacts = { failed, now: new Date(), marks: { reviewed: {}, notApplicable: {} } };
  const group = async <T,>(g: FactGroup, fn: () => Promise<T>, set: (v: T) => void) => { try { set(await fn()); } catch (err) { failed.push(g); console.error(`[setup-progress] ${g}`, err instanceof Error ? err.message : err); } };
  const companyId = await currentCompanyId();
  const db = await getDb();
  f.marks = await getMarks().catch(() => f.marks);

  await Promise.all([
    group("identity", async () => { const v = await getCompanyIdentityView(); return { values: v.identity as unknown as Record<string, string | number>, saved: v.saved }; }, (v) => (f.identity = v)),
    group("onboarding", async () => ({ completedSteps: [...(await getOnboarding()).state.completedSteps] as string[] }), (v) => (f.onboarding = v)),
    group("modules", async () => {
      const [enabled, ent, off] = await Promise.all([enabledModules(), entitlementsFor(companyId), unavailablePanelKeys(companyId)]);
      const on = MODULES.map((m) => m.key as string).filter((k) => (enabled === null || enabled.has(k) || MODULES.find((m) => m.key === k)?.core) && (ent.modules === null || ent.modules.has(k)) && !off.has(k));
      return { on };
    }, (v) => (f.modules = v)),
    group("org", async () => { const [d, t, g] = await Promise.all([listDepartments(), listTeams(), listDesignations()]); return { departments: d.length, teams: t.length, designations: g.length }; }, (v) => (f.org = v)),
    group("people", async () => {
      const users = await db.collection<{ roles?: string[]; access?: Record<string, unknown> }>("admin_users").find({ status: { $nin: BLOCKED_STATUSES } } as never, { projection: { roles: 1, access: 1 } }).toArray();
      const isDir = (u: { roles?: string[] }) => (u.roles ?? []).includes("super_admin");
      return {
        active: users.length, directors: users.filter(isDir).length, pendingInvites: (await listPendingInvitations()).length,
        staffWithAccess: users.filter((u) => !isDir(u) && ((u.roles ?? []).length > 0 || Object.keys(u.access ?? {}).length > 0)).length,
      };
    }, (v) => (f.people = v)),
    group("registry", async () => Object.fromEntries((await listPanels()).map((p) => [p.key, p.connections ?? []])), (v) => (f.registry = v)),
    group("connections", async () => {
      const [views, managed] = await Promise.all([listConnectionViews(), listCompanyIntegrations().catch(() => [])]);
      const out: Record<string, { state: ConnState; detail: string }> = {};
      for (const p of CONNECTION_PROVIDERS.filter((x) => !HIDDEN_FROM_COMPANIES.includes(x.key) && x.fields.length > 0)) {
        const { status } = await connectionStatus(p.key, views[p.key] ?? null);
        out[p.key] = connectionState(status, { testable: p.testable, lastTestOk: views[p.key]?.lastTest ? views[p.key].lastTest!.ok : null });
      }
      const m = new Map(managed.map((x) => [x.key, x]));
      out.razorpay = m.get("razorpay")?.connected ? { state: "done", detail: "Razorpay is connected." } : { state: "todo", detail: "Razorpay is not connected." };
      out.webhooks = m.get("webhooks")?.connected ? { state: "done", detail: "A webhook automation is active." } : { state: "todo", detail: "No webhook automation yet." };
      out.storage = { state: "done", detail: "SRB's storage is used. Nothing to set up." };
      out["dealflow-sync"] = { state: "done", detail: "The lead inbox and careers page are built in." };
      out["ai-chatbot"] = out.openai ?? { state: "todo", detail: "Connect an AI account first." };
      out["social-accounts"] = ["meta", "google", "linkedin", "x"].some((k) => out[k]?.state === "done") ? { state: "done", detail: "A social app is connected." } : { state: "todo", detail: "No social app is connected." };
      out["website-tracking"] = (await db.collection("cms_settings").findOne({ updatedBy: { $nin: [null, ""] } } as never)) ? { state: "done", detail: "Website settings have been saved." } : { state: "todo", detail: "No tracking added yet." };
      out.domains = (await listCompanyDomains()).some((d) => d.kind === "custom" && d.status === "verified") ? { state: "done", detail: "Your domain is verified." } : { state: "todo", detail: "Using the default address." };
      void providerByKey;
      return out;
    }, (v) => (f.connections = v)),
    group("domain", async () => { const d = (await listCompanyDomains()).filter((x) => x.kind === "custom"); return { customVerified: d.some((x) => x.status === "verified"), customPending: d.some((x) => x.status !== "verified") }; }, (v) => (f.domain = v)),
    group("sender", async () => { const s = await getCompanySender(); return { status: (s ? (s.status === "verified" ? "verified" : s.status === "failed" ? "failed" : "pending") : "none") as "none" | "pending" | "verified" | "failed" }; }, (v) => (f.sender = v)),
    group("branding", async () => ({ logo: Boolean((await getCompanyBrand()).logoUrl) }), (v) => (f.branding = v)),
    group("billing", async () => {
      const sub = await getCompanySubscription(companyId);
      const internal = !sub || sub.status === "internal";
      return { internal, status: sub?.status ?? "internal", hasPlan: Boolean(sub?.planId), hasBillingDetails: Boolean(sub?.billingDetails?.legalName), trialDaysLeft: sub?.status === "trialing" && sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null, paying: sub?.status === "active" };
    }, (v) => (f.billing = v)),
    group("security", async () => {
      const dirs = await db.collection<{ roles?: string[]; twoFactor?: unknown; twoFactorEmail?: unknown; emailVerified?: boolean }>("admin_users").find({ roles: "super_admin", status: { $nin: BLOCKED_STATUSES } } as never).toArray();
      return { directors: dirs.length, directorsWithTwoStep: dirs.filter((d) => Boolean(d.twoFactor) || Boolean(d.twoFactorEmail)).length, emailVerified: dirs.length > 0 && dirs.every((d) => d.emailVerified !== false), backups: (await listBackups(1)).length };
    }, (v) => (f.security = v)),
    group("engagement", async () => {
      const [pushReady, pdf, site] = await Promise.all([platformServiceReady("vapid"), getPdfKbSummary().catch(() => ({ totalDocs: 0 })), getWebsiteKbSummary().catch(() => ({ totalPages: 0 }))]);
      const own = (await listConnectionViews())["vapid"];
      return { pushReady: pushReady || Boolean(own?.saved), knowledgeItems: ((pdf as { totalDocs: number }).totalDocs ?? 0) + ((site as { totalPages: number }).totalPages ?? 0) };
    }, (v) => (f.engagement = v)),
    group("productSettings", async () => {
      const out: Record<string, boolean> = {};
      await Promise.all(Object.entries(SETTINGS_DOCS).map(async ([mod, cols]) => { out[mod] = (await Promise.all(cols.map((c) => db.collection(c).findOne({ updatedBy: { $nin: [null, ""] } } as never, { projection: { _id: 1 } })))).some(Boolean); }));
      return out;
    }, (v) => (f.productSettings = v)),
    group("usage", async () => {
      const out: Record<string, number> = {};
      await Promise.all(Object.entries(USAGE).map(async ([mod, c]) => { out[mod] = await db.collection(c).countDocuments({}, { limit: 1 }); }));
      return out;
    }, (v) => (f.usage = v)),
  ]);
  return f;
}
