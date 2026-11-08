import type { MetaClient } from "./client";
import { META_ACCOUNT_STATUS } from "./constants";
import type { MetaAccountFacts } from "./validate";

/** Ad account discovery and capabilities: everything the wizard needs to offer only real choices. */

export interface AdAccountInfo extends MetaAccountFacts {
  id: string;
  name: string;
  statusLabel: string;
  disableReason: number | null;
  timezone: string | null;
  spendCapMinor: number | null;
  amountSpentMinor: number | null;
  balanceMinor: number | null;
  isPrepay: boolean | null;
  businessId: string | null;
  hasPaymentMethod: boolean | null;
  userTasks: string[];
  taxIdStatus: number | null;
  isPersonal: boolean | null;
}

const ACCOUNT_FIELDS = "name,account_status,disable_reason,currency,timezone_name,min_daily_budget,min_campaign_group_spend_cap,spend_cap,amount_spent,balance,is_prepay_account,business,funding_source_details,default_dsa_payor,default_dsa_beneficiary,tax_id_status,user_tasks,is_personal";
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export async function getAdAccountInfo(c: MetaClient, actId: string): Promise<AdAccountInfo> {
  const r = await c.get<Record<string, unknown>>(actId, { fields: ACCOUNT_FIELDS });
  const status = num(r.account_status);
  const business = r.business as { id?: string } | undefined;
  const fs = r.funding_source_details as { id?: string; type?: number } | undefined;
  const cap = num(r.spend_cap);
  return {
    id: actId,
    name: typeof r.name === "string" ? r.name : actId,
    currency: typeof r.currency === "string" ? r.currency : "USD",
    status,
    statusLabel: status !== null ? META_ACCOUNT_STATUS[status] ?? `Status ${status}` : "Unknown",
    disableReason: num(r.disable_reason),
    timezone: typeof r.timezone_name === "string" ? r.timezone_name : null,
    minDailyBudgetMinor: num(r.min_daily_budget),
    minSpendCapMinor: num(r.min_campaign_group_spend_cap),
    spendCapMinor: cap && cap > 0 ? cap : null,
    amountSpentMinor: num(r.amount_spent),
    balanceMinor: num(r.balance),
    isPrepay: typeof r.is_prepay_account === "boolean" ? r.is_prepay_account : null,
    businessId: business?.id ?? null,
    hasPaymentMethod: r.funding_source_details === undefined ? null : Boolean(fs?.id),
    defaultDsaPayor: typeof r.default_dsa_payor === "string" ? r.default_dsa_payor : null,
    defaultDsaBeneficiary: typeof r.default_dsa_beneficiary === "string" ? r.default_dsa_beneficiary : null,
    userTasks: Array.isArray(r.user_tasks) ? r.user_tasks.map(String) : [],
    taxIdStatus: num(r.tax_id_status),
    isPersonal: typeof r.is_personal === "boolean" ? r.is_personal : null,
  };
}

export interface NamedId {
  id: string;
  name: string;
}
export interface AudienceInfo extends NamedId {
  subtype: string | null;
  sizeLower: number | null;
  sizeUpper: number | null;
  deliveryStatus: string | null;
}

export async function listPixels(c: MetaClient, actId: string): Promise<NamedId[]> {
  const rows = await c.getAll<{ id: string; name?: string }>(`${actId}/adspixels`, { fields: "id,name" }, 3);
  return rows.map((p) => ({ id: p.id, name: p.name ?? p.id }));
}

export async function listCustomAudiences(c: MetaClient, actId: string): Promise<AudienceInfo[]> {
  const rows = await c.getAll<{ id: string; name?: string; subtype?: string; approximate_count_lower_bound?: number; approximate_count_upper_bound?: number; delivery_status?: { code?: number; description?: string } }>(
    `${actId}/customaudiences`, { fields: "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status" }, 5);
  return rows.map((a) => ({ id: a.id, name: a.name ?? a.id, subtype: a.subtype ?? null, sizeLower: a.approximate_count_lower_bound ?? null, sizeUpper: a.approximate_count_upper_bound ?? null, deliveryStatus: a.delivery_status?.description ?? null }));
}

/** Lead forms belong to the Page; the call needs the Page's own access token (pages_manage_ads), so pass a client built with it. */
export async function listLeadForms(pageClient: MetaClient, pageId: string): Promise<(NamedId & { status: string | null })[]> {
  const rows = await pageClient.getAll<{ id: string; name?: string; status?: string }>(`${pageId}/leadgen_forms`, { fields: "id,name,status" }, 3);
  return rows.map((f) => ({ id: f.id, name: f.name ?? f.id, status: f.status ?? null }));
}

export async function listAdAccountInstagramAccounts(c: MetaClient, actId: string): Promise<(NamedId & { username: string | null })[]> {
  const rows = await c.getAll<{ id: string; username?: string; name?: string }>(`${actId}/instagram_accounts`, { fields: "id,username" }, 2);
  return rows.map((a) => ({ id: a.id, name: a.username ?? a.name ?? a.id, username: a.username ?? null }));
}
