import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { countSeatsUsed, storageUsedBytes } from "@/lib/platform/billing/enforce";
import { getUsage } from "@/lib/platform/billing/usage";
import { meterLevel, type UsageMeter } from "@/lib/platform/billing/usage-report";
import { listCompanySaasInvoices, type SaasInvoice } from "@/lib/platform/billing/invoices";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getPaymentAccountView } from "@/lib/platform/integrations/payments";
import { listCompanyDomains } from "@/lib/platform/domains/custom";
import { listWorkflows } from "@/lib/platform/workflows";
import type { SubscriptionStatus } from "@/lib/platform/billing/types";

/**
 * Read-only loaders for the Workspace's company pages (usage, payments,
 * integrations, security). Each reads ONLY the current company: through
 * `getDb()` (company-scoped) or a platform helper that is keyed by
 * `currentCompanyId()`. No new collections — these are views over existing data.
 */

const meter = (used: number, limit: number | null): UsageMeter => ({ used, limit, level: meterLevel(used, limit) });

export interface CompanyUsage {
  planName: string | null;
  status: SubscriptionStatus;
  seats: UsageMeter;
  aiTokens: UsageMeter;
  /** Megabytes, rounded up to 0.01. */
  storageMb: UsageMeter;
}

/** This company's seats, AI tokens this month and storage against its effective limits (plan + add-ons). */
export async function getCompanyUsage(): Promise<CompanyUsage> {
  const [e, seats, ai, bytes] = await Promise.all([getEntitlements(), countSeatsUsed(), getUsage("ai_tokens"), storageUsedBytes()]);
  return {
    planName: e.planName,
    status: e.status,
    seats: meter(seats, e.limits.seats),
    aiTokens: meter(ai, e.limits.aiTokensPerMonth),
    storageMb: meter(Math.ceil((bytes / (1024 * 1024)) * 100) / 100, e.limits.storageMb),
  };
}

export interface SaasPayment {
  /** `payment` = a paid invoice; `refund` = a credit note. */
  kind: "payment" | "refund";
  /** Minor units (paise), always positive. */
  amount: number;
  currency: string;
  at: Date;
  /** Provider payment / refund id, when there is one. */
  reference: string | null;
  documentId: string;
  documentNumber: string;
}

/** Pure: the money movements recorded on a company's invoices and credit notes, newest first. */
export function paymentsFromInvoices(invoices: SaasInvoice[]): SaasPayment[] {
  const out: SaasPayment[] = [];
  for (const inv of invoices) {
    if (!inv.number) continue;
    if (inv.kind === "credit_note") out.push({ kind: "refund", amount: inv.total, currency: inv.currency, at: inv.issuedAt, reference: inv.refundRef, documentId: inv._id, documentNumber: inv.number });
    else if (inv.paidAt) out.push({ kind: "payment", amount: inv.total, currency: inv.currency, at: inv.paidAt, reference: inv.paymentRef, documentId: inv._id, documentNumber: inv.number });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** This company's SaaS invoices, credit notes and the payments derived from them. */
export async function getCompanyBillingHistory(): Promise<{ invoices: SaasInvoice[]; payments: SaasPayment[] }> {
  const invoices = await listCompanySaasInvoices(await currentCompanyId());
  return { invoices, payments: paymentsFromInvoices(invoices) };
}

export interface CompanyIntegration {
  key: "razorpay" | "webhooks" | "domain";
  name: string;
  description: string;
  connected: boolean;
  status: string;
  href: string;
}

/** What this company has connected — only integrations that already exist. */
export async function listCompanyIntegrations(): Promise<CompanyIntegration[]> {
  const [account, domains, workflows] = await Promise.all([getPaymentAccountView(), listCompanyDomains(), listWorkflows()]);
  const custom = domains.filter((d) => d.kind === "custom");
  const verified = custom.filter((d) => d.status === "verified");
  const hooks = workflows.filter((w) => w.actions.some((a) => a.type === "webhook"));
  const hooksOn = hooks.filter((w) => w.enabled);
  return [
    {
      key: "razorpay",
      name: "Razorpay (your own account)",
      description: "Collect invoice payments, pay salaries and manage the company bank accounts used for payouts and government dues.",
      connected: account.status === "connected",
      status: account.status === "connected" ? `Connected · ${account.mode === "live" ? "Live" : "Test"} mode${account.payoutsEnabled ? " · payouts on" : ""}` : account.status === "unreadable" ? "Saved keys can't be read — reconnect" : "Not connected",
      href: "/commandos/settings/payments",
    },
    {
      key: "webhooks",
      name: "Outgoing webhooks",
      description: "Signed HTTPS calls to your own systems when something happens, set up as an automation action.",
      connected: hooksOn.length > 0,
      status: hooks.length === 0 ? "No webhook automations" : `${hooksOn.length} active${hooks.length > hooksOn.length ? ` · ${hooks.length - hooksOn.length} paused` : ""}`,
      href: "/commandos/settings/automations",
    },
    {
      key: "domain",
      name: "Your own domain",
      description: "Serve your workspace and website from a domain you own, with automatic SSL.",
      connected: verified.length > 0,
      status: custom.length === 0 ? "Using the workspace address" : `${verified.length} verified${custom.length > verified.length ? ` · ${custom.length - verified.length} pending` : ""}`,
      href: "/commandos/settings/domains",
    },
  ];
}

export interface CompanySecurity {
  accounts: number;
  superAdmins: number;
  /** Accounts that must set a new password at next sign-in. */
  mustChangePassword: number;
  /** Accounts locked right now after repeated failed sign-ins. */
  locked: number;
  /** The viewer's own open Workspace sessions (this one included). */
  ownSessions: number;
}

/** Sign-in facts for this company's accounts, from `admin_users` and `hub_sessions` as they are. */
export async function getCompanySecurity(viewerId: string): Promise<CompanySecurity> {
  const db = await getDb();
  const users = db.collection("admin_users");
  const now = new Date();
  const [accounts, superAdmins, mustChangePassword, locked, ownSessions] = await Promise.all([
    users.countDocuments({ "roles.0": { $exists: true } }),
    users.countDocuments({ roles: "super_admin" }),
    users.countDocuments({ mustChangePassword: true, "roles.0": { $exists: true } }),
    users.countDocuments({ lockedUntil: { $gt: now } }),
    ObjectId.isValid(viewerId) ? db.collection("hub_sessions").countDocuments({ adminId: new ObjectId(viewerId), expiresAt: { $gt: now } }) : Promise.resolve(0),
  ]);
  return { accounts, superAdmins, mustChangePassword, locked, ownSessions };
}
