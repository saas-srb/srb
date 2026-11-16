import { notFound } from "next/navigation";
import SetupHarness from "./SetupHarness";
import { STEPS } from "@/lib/platform/setup-progress/registry";
import { buildProgress } from "@/lib/platform/setup-progress/scoring";
import { readSetupFilter } from "@/lib/platform/setup-progress/filter";
import { MODULES, ONBOARDING_STEPS } from "@/lib/platform/onboarding/catalog";
import { IDENTITY_FIELDS } from "@/lib/platform/company-identity/shared";
import type { SetupFacts } from "@/lib/platform/setup-progress/types";

/** Development-only: `?view=p0|p50|p100|na|dashboard|console&q=&show=`. Sample facts only. */
export const dynamic = "force-dynamic";

function facts(level: "p0" | "p50" | "p100" | "na"): SetupFacts {
  const full = level === "p100";
  const half = level === "p50" || level === "na";
  const c = (state: "done" | "partial" | "todo") => ({ state, detail: state === "done" ? "Using SRB" : state === "partial" ? "Saved. Press Test to confirm." : "Not set up yet." });
  const ids = ["smtp", "resend", "sendgrid", "vapid", "razorpay", "openai", "ai-chatbot", "elevenlabs", "gemini", "twilio", "whatsapp-cloud", "livekit", "turn", "storage", "google-service-account", "pagespeed", "meta", "google", "linkedin", "x", "social-accounts", "website-tracking", "webhooks", "dealflow-sync", "domains"];
  const modules = ["hrms", "pms", "lms", "fms", "cms", "smms", "lpms", "messenger"];
  const idv: Record<string, string | number> = Object.fromEntries(IDENTITY_FIELDS.map((k) => [k, full || (half && !["gstin", "pan", "cin", "phone"].includes(k)) ? (k === "fiscalYearStartMonth" ? 4 : "x") : ""]));
  const reviewed = full ? Object.fromEntries(STEPS.filter((s) => s.manual).map((s) => [s.id, { at: "2026-11-10T00:00:00Z", by: "u" }])) : {};
  return {
    failed: [], now: new Date("2026-11-16T10:00:00Z"),
    marks: { reviewed, notApplicable: level === "na" ? { "company:cin": { reason: "We are a partnership, no CIN", at: "2026-11-12T00:00:00Z", by: "u" }, "org:teams": { reason: "Flat company", at: "2026-11-12T00:00:00Z", by: "u" } } : {} },
    identity: { values: idv, saved: !!idv.legalName }, onboarding: { completedSteps: full ? ONBOARDING_STEPS.map((s) => s.key) : half ? ["profile", "structure"] : [] }, modules: { on: modules },
    org: { departments: full || half ? 4 : 0, teams: full ? 3 : 0, designations: full ? 6 : half ? 2 : 0 }, people: { active: full ? 8 : half ? 3 : 1, directors: full ? 2 : 1, pendingInvites: half ? 2 : 0, staffWithAccess: full ? 5 : half ? 1 : 0 },
    connections: Object.fromEntries(ids.map((k, i) => [k, c(full ? "done" : half ? (i % 3 === 0 ? "done" : i % 3 === 1 ? "partial" : "todo") : "todo")])), domain: { customVerified: full, customPending: half }, sender: { status: full ? "verified" : "none" }, branding: { logo: full || half },
    billing: { internal: false, status: full ? "active" : "trialing", hasPlan: true, hasBillingDetails: full, trialDaysLeft: full ? null : 9, paying: full }, security: { directors: 2, directorsWithTwoStep: full ? 2 : half ? 1 : 0, emailVerified: full || half, backups: full ? 2 : 0 },
    engagement: { pushReady: full, knowledgeItems: full ? 5 : 0 }, productSettings: Object.fromEntries(modules.map((m) => [m, full || (half && m === "pms")])), usage: Object.fromEntries(modules.map((m) => [m, full ? 3 : 0])),
    registry: Object.fromEntries(modules.map((m) => [m, ["email", "push", "openai", "ai-chatbot", "elevenlabs", "razorpay", "twilio", "livekit", "google-service-account", "meta", "website-tracking", "storage", "domains"]])),
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; show?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const view = sp.view ?? "p50";
  const level = view === "p0" ? "p0" : view === "p100" ? "p100" : view === "na" ? "na" : "p50";
  const progress = buildProgress(STEPS, facts(level));
  return <SetupHarness view={view} progress={progress} filter={readSetupFilter(sp)} names={Object.fromEntries(MODULES.map((m) => [m.key as string, m.label]))} />;
}
