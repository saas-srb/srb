import "server-only";
import type { CampaignPlatform } from "@/lib/utm";
import { campaignKeyFor } from "@/lib/utm";
import { normalizeDeliveryStatus, type CampaignDeliveryStatus, type ImportKind } from "@/lib/campaign-platforms";

/* -------------------------------------------------------------------------- */
/*  RFC 4180 CSV parser (matches the hand-rolled writer in src/lib/csv.ts)     */
/* -------------------------------------------------------------------------- */

export interface ParsedCsv {
  headers: string[];
  /** One record per data row, keyed by the raw header text. */
  records: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  const src = text.replace(/^﻿/, ""); // strip BOM
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let sawAny = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; sawAny = true; continue; }
    if (ch === ",") { row.push(field); field = ""; sawAny = true; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; sawAny = false; continue; }
    field += ch;
    sawAny = true;
  }
  if (sawAny || field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], records: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  const records = nonEmpty.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => { rec[h] = (r[idx] ?? "").trim(); });
    return rec;
  });
  return { headers, records };
}

/* -------------------------------------------------------------------------- */
/*  Value parsing helpers                                                      */
/* -------------------------------------------------------------------------- */

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Return the actual header from `headers` matching any of `candidates` (loosely). */
function resolveHeader(headers: string[], candidates: string[]): string | null {
  const wanted = candidates.map(normKey);
  for (const h of headers) {
    if (wanted.includes(normKey(h))) return h;
  }
  // contains-match fallback (e.g. "Amount spent (INR)" for candidate "amount spent")
  for (const h of headers) {
    const hk = normKey(h);
    if (wanted.some((w) => w.length >= 4 && hk.includes(w))) return h;
  }
  return null;
}

export function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || /^(n\/?a|-|--|—)$/i.test(trimmed)) return 0;
  const cleaned = trimmed.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse a date cell to a UTC-midnight Date. Accepts ISO `YYYY-MM-DD`, `MM/DD/YYYY`, `DD/MM/YYYY`. */
export function parseDateCell(raw: string | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (m) {
    const [, y, mo, d] = m;
    return utcDate(+y, +mo, +d);
  }
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (m) {
    let mo = +m[1];
    let d = +m[2];
    const y = +m[3];
    if (mo > 12 && d <= 12) [mo, d] = [d, mo]; // clearly DD/MM
    return utcDate(y, mo, d);
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return utcDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
  return null;
}

function utcDate(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function normalizePhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : undefined;
}

export function normalizeEmail(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined;
}

/* -------------------------------------------------------------------------- */
/*  Per-platform column schemas                                                */
/* -------------------------------------------------------------------------- */

interface MetricColumns {
  campaignName: string[];
  campaignId?: string[];
  date: string[];
  spend: string[];
  impressions: string[];
  clicks: string[];
  linkClicks?: string[];
  leadsReported?: string[];
  status?: string[];
  objective?: string[];
  breakdown?: string[];
}

interface LeadColumns {
  fullName?: string[];
  firstName?: string[];
  lastName?: string[];
  email: string[];
  phone: string[];
  campaignName: string[];
  createdAt?: string[];
}

const METRIC_SCHEMAS: Record<CampaignPlatform, { columns: MetricColumns; required: (keyof MetricColumns)[]; defaultCurrency: string; templateHeaders: string[] }> = {
  meta: {
    columns: {
      campaignName: ["Campaign name", "Campaign"],
      campaignId: ["Campaign ID"],
      date: ["Day", "Date", "Reporting starts"],
      spend: ["Amount spent (INR)", "Amount spent (USD)", "Amount spent", "Spend"],
      impressions: ["Impressions"],
      clicks: ["Clicks (all)", "Clicks"],
      linkClicks: ["Link clicks"],
      leadsReported: ["Leads", "Results", "Website leads", "On-Facebook leads"],
      status: ["Delivery", "Ad set delivery", "Campaign delivery"],
      objective: ["Objective"],
      breakdown: ["Platform", "Placement"],
    },
    required: ["campaignName", "date", "spend", "impressions"],
    defaultCurrency: "INR",
    templateHeaders: ["Campaign name", "Campaign ID", "Day", "Amount spent (INR)", "Impressions", "Link clicks", "Results", "Delivery", "Objective"],
  },
  google: {
    columns: {
      campaignName: ["Campaign"],
      campaignId: ["Campaign ID"],
      date: ["Day", "Date"],
      spend: ["Cost"],
      impressions: ["Impr.", "Impressions"],
      clicks: ["Clicks"],
      leadsReported: ["Conversions", "Conv.", "Leads"],
      status: ["Campaign state", "Campaign status"],
    },
    required: ["campaignName", "date", "spend", "impressions"],
    defaultCurrency: "INR",
    templateHeaders: ["Campaign", "Campaign ID", "Day", "Cost", "Impr.", "Clicks", "Conversions", "Campaign state"],
  },
  linkedin: {
    columns: {
      campaignName: ["Campaign Name", "Campaign"],
      campaignId: ["Campaign ID"],
      date: ["Start Date (in UTC)", "Date", "Day"],
      spend: ["Total Spent", "Amount Spent", "Spent"],
      impressions: ["Impressions"],
      clicks: ["Clicks"],
      leadsReported: ["Leads", "Total Leads"],
      status: ["Campaign Status", "Status"],
    },
    required: ["campaignName", "date", "spend", "impressions"],
    defaultCurrency: "INR",
    templateHeaders: ["Campaign Name", "Campaign ID", "Start Date (in UTC)", "Total Spent", "Impressions", "Clicks", "Leads", "Campaign Status"],
  },
};

const LEAD_SCHEMAS: Record<CampaignPlatform, { columns: LeadColumns; templateHeaders: string[] }> = {
  meta: {
    columns: {
      fullName: ["full_name", "full name", "name"],
      firstName: ["first_name", "first name"],
      lastName: ["last_name", "last name"],
      email: ["email", "email address", "work_email"],
      phone: ["phone_number", "phone number", "phone"],
      campaignName: ["campaign_name", "campaign name", "campaign"],
      createdAt: ["created_time", "created time", "date"],
    },
    templateHeaders: ["full_name", "email", "phone_number", "campaign_name", "created_time"],
  },
  google: {
    columns: {
      fullName: ["Full name", "Name", "Lead name"],
      firstName: ["First name"],
      lastName: ["Last name"],
      email: ["Email", "Email address", "User email"],
      phone: ["Phone", "Phone number"],
      campaignName: ["Campaign", "Campaign name"],
      createdAt: ["Lead created", "Date", "Timestamp"],
    },
    templateHeaders: ["Full name", "Email", "Phone", "Campaign", "Lead created"],
  },
  linkedin: {
    columns: {
      fullName: ["Full Name", "Name"],
      firstName: ["First Name"],
      lastName: ["Last Name"],
      email: ["Email Address", "Email", "Work Email"],
      phone: ["Phone Number", "Phone"],
      campaignName: ["Campaign Name", "Campaign"],
      createdAt: ["Date", "Submitted On", "Lead Date"],
    },
    templateHeaders: ["Campaign Name", "First Name", "Last Name", "Email Address", "Phone Number", "Date"],
  },
};

export function templateHeadersFor(platform: CampaignPlatform, kind: ImportKind): string[] {
  return kind === "performance" ? METRIC_SCHEMAS[platform].templateHeaders : LEAD_SCHEMAS[platform].templateHeaders;
}

export function describeSchema(platform: CampaignPlatform, kind: ImportKind): { required: string[]; optional: string[] } {
  if (kind === "performance") {
    const s = METRIC_SCHEMAS[platform];
    const req = s.required.map((k) => s.columns[k]![0]);
    const opt = (Object.keys(s.columns) as (keyof MetricColumns)[])
      .filter((k) => !s.required.includes(k))
      .map((k) => s.columns[k]![0]);
    return { required: req, optional: opt };
  }
  const s = LEAD_SCHEMAS[platform];
  return {
    required: ["email or phone", s.columns.campaignName[0]],
    optional: [s.columns.fullName?.[0] ?? "name", s.columns.createdAt?.[0] ?? "created time"],
  };
}

/* -------------------------------------------------------------------------- */
/*  Canonical row shapes + validation                                          */
/* -------------------------------------------------------------------------- */

export interface CanonicalMetricRow {
  campaignName: string;
  campaignKey: string;
  externalId?: string;
  date: Date;
  breakdown: string;
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
  linkClicks?: number;
  leadsReported?: number;
  status: CampaignDeliveryStatus;
  objective?: string;
}

export interface CanonicalLeadRow {
  name?: string;
  email?: string;
  phone?: string;
  campaignName: string;
  campaignKey: string;
  createdAt?: Date;
}

export interface CsvValidationResult<T> {
  valid: T[];
  errors: { row: number; message: string }[];
  rowsTotal: number;
  /** Single reporting currency detected across the file (performance only). */
  currency?: string;
}

const BREAKDOWN_MAP: Record<string, string> = {
  facebook: "facebook",
  instagram: "instagram",
  "audience network": "audience_network",
  audiencenetwork: "audience_network",
  messenger: "messenger",
  "all": "all",
};

export function validateMetricCsv(platform: CampaignPlatform, parsed: ParsedCsv): CsvValidationResult<CanonicalMetricRow> {
  const schema = METRIC_SCHEMAS[platform];
  const { headers, records } = parsed;
  const errors: { row: number; message: string }[] = [];

  if (headers.length === 0) {
    return { valid: [], errors: [{ row: 1, message: "The file is empty." }], rowsTotal: 0 };
  }

  const resolved: Partial<Record<keyof MetricColumns, string>> = {};
  for (const key of Object.keys(schema.columns) as (keyof MetricColumns)[]) {
    const found = resolveHeader(headers, schema.columns[key]!);
    if (found) resolved[key] = found;
  }

  const missing = schema.required.filter((k) => !resolved[k]);
  if (missing.length > 0) {
    return {
      valid: [],
      errors: [{
        row: 1,
        message: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.map((k) => schema.columns[k]![0]).join(", ")}. Expected a ${platform} performance report — download the template for the exact columns.`,
      }],
      rowsTotal: records.length,
    };
  }

  const valid: CanonicalMetricRow[] = [];
  const currencies = new Set<string>();
  // Currency from the spend header itself, e.g. "Amount spent (INR)".
  const spendHeaderCurrency = resolved.spend ? /\(([A-Za-z]{3})\)/.exec(resolved.spend)?.[1]?.toUpperCase() : undefined;

  records.forEach((rec, idx) => {
    const line = idx + 2; // 1-based file line (header is line 1)
    const campaignName = (resolved.campaignName ? rec[resolved.campaignName] : "").trim();
    if (!campaignName) { errors.push({ row: line, message: "Blank campaign name." }); return; }

    const date = parseDateCell(resolved.date ? rec[resolved.date] : undefined);
    if (!date) { errors.push({ row: line, message: `Unrecognized date "${resolved.date ? rec[resolved.date] : ""}".` }); return; }

    const spend = parseNumber(resolved.spend ? rec[resolved.spend] : undefined);
    if (spend == null) { errors.push({ row: line, message: `Invalid spend "${resolved.spend ? rec[resolved.spend] : ""}".` }); return; }

    const impressions = parseNumber(resolved.impressions ? rec[resolved.impressions] : undefined);
    if (impressions == null) { errors.push({ row: line, message: "Invalid impressions." }); return; }

    const clicks = resolved.clicks ? parseNumber(rec[resolved.clicks]) : 0;
    const linkClicks = resolved.linkClicks ? parseNumber(rec[resolved.linkClicks]) : null;
    const leadsReported = resolved.leadsReported ? parseNumber(rec[resolved.leadsReported]) : null;

    const currency = spendHeaderCurrency ?? schema.defaultCurrency;
    currencies.add(currency);

    let breakdown = "all";
    if (resolved.breakdown) {
      const b = normKey(rec[resolved.breakdown] ?? "");
      breakdown = BREAKDOWN_MAP[b] ?? BREAKDOWN_MAP[(rec[resolved.breakdown] ?? "").trim().toLowerCase()] ?? (b ? b : "all");
    }

    valid.push({
      campaignName,
      campaignKey: campaignKeyFor(campaignName)!,
      externalId: resolved.campaignId ? rec[resolved.campaignId]?.trim() || undefined : undefined,
      date,
      breakdown,
      spend: Math.max(0, Math.round(spend * 100) / 100),
      currency,
      impressions: Math.max(0, Math.round(impressions)),
      clicks: Math.max(0, Math.round(clicks ?? 0)),
      linkClicks: linkClicks == null ? undefined : Math.max(0, Math.round(linkClicks)),
      leadsReported: leadsReported == null ? undefined : Math.max(0, Math.round(leadsReported)),
      status: resolved.status ? normalizeDeliveryStatus(rec[resolved.status]) : "unknown",
      objective: resolved.objective ? rec[resolved.objective]?.trim() || undefined : undefined,
    });
  });

  if (currencies.size > 1) {
    return {
      valid: [],
      errors: [{ row: 1, message: `The file mixes currencies (${[...currencies].join(", ")}). Export one currency per file.` }],
      rowsTotal: records.length,
    };
  }

  return { valid, errors, rowsTotal: records.length, currency: [...currencies][0] };
}

export function validateLeadCsv(platform: CampaignPlatform, parsed: ParsedCsv): CsvValidationResult<CanonicalLeadRow> {
  const schema = LEAD_SCHEMAS[platform];
  const { headers, records } = parsed;
  const errors: { row: number; message: string }[] = [];

  if (headers.length === 0) {
    return { valid: [], errors: [{ row: 1, message: "The file is empty." }], rowsTotal: 0 };
  }

  const emailH = resolveHeader(headers, schema.columns.email);
  const phoneH = resolveHeader(headers, schema.columns.phone);
  const campaignH = resolveHeader(headers, schema.columns.campaignName);
  const fullNameH = schema.columns.fullName ? resolveHeader(headers, schema.columns.fullName) : null;
  const firstH = schema.columns.firstName ? resolveHeader(headers, schema.columns.firstName) : null;
  const lastH = schema.columns.lastName ? resolveHeader(headers, schema.columns.lastName) : null;
  const createdH = schema.columns.createdAt ? resolveHeader(headers, schema.columns.createdAt) : null;

  if (!emailH && !phoneH) {
    return { valid: [], errors: [{ row: 1, message: "Need an email or phone column to match leads. Download the template for the expected columns." }], rowsTotal: records.length };
  }
  if (!campaignH) {
    return { valid: [], errors: [{ row: 1, message: `Missing the campaign column (${schema.columns.campaignName[0]}).` }], rowsTotal: records.length };
  }

  const valid: CanonicalLeadRow[] = [];
  records.forEach((rec, idx) => {
    const line = idx + 2;
    const campaignName = (rec[campaignH] ?? "").trim();
    if (!campaignName) { errors.push({ row: line, message: "Blank campaign name." }); return; }

    const email = normalizeEmail(emailH ? rec[emailH] : undefined);
    const phone = normalizePhone(phoneH ? rec[phoneH] : undefined);
    if (!email && !phone) { errors.push({ row: line, message: "No usable email or phone." }); return; }

    let name = fullNameH ? rec[fullNameH]?.trim() : "";
    if (!name && (firstH || lastH)) name = [firstH ? rec[firstH] : "", lastH ? rec[lastH] : ""].join(" ").trim();

    valid.push({
      name: name || undefined,
      email,
      phone,
      campaignName,
      campaignKey: campaignKeyFor(campaignName)!,
      createdAt: createdH ? parseDateCell(rec[createdH]) ?? undefined : undefined,
    });
  });

  return { valid, errors, rowsTotal: records.length };
}
