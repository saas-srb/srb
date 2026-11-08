import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { AI_USAGE_COLLECTION } from "@/lib/platform/billing/ai-usage-log";
import { usagePeriod } from "@/lib/platform/billing/usage";
import { IMAGE_PRICES, OPENAI_MODELS } from "@/lib/platform/costs/catalog";
import { DEFAULT_SETTINGS, sanitizeSettings, unitCosts, type CostSettings } from "@/lib/platform/costs/model";

const COLLECTION = "platform_cost_settings";
const ID = "cost-calculator";

export async function loadCostSettings(): Promise<{ settings: CostSettings; saved: boolean; updatedAt: string | null; updatedBy: string | null }> {
  const doc = await (await getPlatformDb()).collection<{ _id: string; settings?: Partial<CostSettings>; updatedAt?: Date; updatedBy?: string }>(COLLECTION).findOne({ _id: ID });
  return { settings: sanitizeSettings(doc?.settings ?? DEFAULT_SETTINGS), saved: !!doc, updatedAt: doc?.updatedAt ? doc.updatedAt.toISOString() : null, updatedBy: doc?.updatedBy ?? null };
}

export async function saveCostSettings(raw: Partial<CostSettings>, actorId: string): Promise<CostSettings> {
  const settings = sanitizeSettings(raw);
  await (await getPlatformDb()).collection<{ _id: string }>(COLLECTION).updateOne({ _id: ID }, { $set: { settings, updatedAt: new Date(), updatedBy: actorId } as never }, { upsert: true });
  return settings;
}

export interface ActualCosts {
  period: string;
  /** What the platform's AI provider bills for the month so far, in rupees, from the real per-call log. */
  ai: { totalInr: number; tokens: number; calls: number; images: number; byModel: { model: string; tokens: number; calls: number; inr: number; known: boolean }[]; byCompany: { companyId: string; name: string; tokens: number; inr: number }[] };
  emails: { count: number; inr: number };
  voice: { minutes: number; inr: number };
  storage: { gb: number; inr: number };
  /** Estimated at the settings' own unit costs (emails, voice and storage are metered, not billed per item, in our own records). */
  totalInr: number;
  companies: { free: number; paying: number; total: number };
  /** What real use says, ready to replace the assumptions (null where there isn't enough use yet). */
  measured: { inputSharePct: number | null; aiMix: { model: string; pct: number }[] | null; utilization: { ai: number; storage: number; emails: number; voice: number } | null; payingSampled: number };
}

/** The month so far, across every company, priced with the official rates in the catalogue. */
export async function loadActualCosts(s: CostSettings): Promise<ActualCosts> {
  const db = await getPlatformDb();
  const period = usagePeriod();
  const start = new Date(`${period}-01T00:00:00.000Z`);
  const unit = unitCosts(s);
  const ai = db.collection(AI_USAGE_COLLECTION);
  const [byModel, byCompany, images, usage, companyDocs] = await Promise.all([
    ai.aggregate<{ _id: string; i: number; o: number; t: number; n: number }>([{ $match: { at: { $gte: start }, endpoint: { $not: /^images\./ } } }, { $group: { _id: "$model", i: { $sum: "$inputTokens" }, o: { $sum: "$outputTokens" }, t: { $sum: "$totalTokens" }, n: { $sum: 1 } } }]).toArray(),
    ai.aggregate<{ _id: string; t: number }>([{ $match: { at: { $gte: start } } }, { $group: { _id: "$companyId", t: { $sum: "$totalTokens" } } }, { $sort: { t: -1 } }, { $limit: 10 }]).toArray(),
    ai.countDocuments({ at: { $gte: start }, endpoint: /^images\./ }),
    db.collection("billing_usage").aggregate<{ _id: string; total: number }>([{ $match: { $or: [{ period }, { metric: "storage_bytes" }] } }, { $group: { _id: "$metric", total: { $sum: "$total" } } }]).toArray(),
    db.collection("companies").find({ isPlatformOwner: { $ne: true } }, { projection: { name: 1, "subscription.planId": 1 } }).toArray(),
  ]);
  const price = (id: string) => OPENAI_MODELS.find((m) => id === m.id || id.startsWith(`${m.id}-20`));
  const c = s.cachedSharePct / 100;
  const modelRows = byModel.map((r) => {
    const m = price(r._id || "");
    const inUsd = m ? ((1 - c) * m.input + c * m.cachedInput) : null;
    // Unknown models (or events logged with only a total) are priced at the blended rate from the settings.
    const usd = m && inUsd !== null && (r.i > 0 || r.o > 0) ? (r.i / 1e6) * inUsd + (r.o / 1e6) * m.output : null;
    const inr = usd !== null ? usd * s.fxRate : (r.t / 1000) * unit.aiPerThousandTokens;
    return { model: r._id || "unknown", tokens: r.t, calls: r.n, inr, known: usd !== null };
  }).sort((a, b) => b.inr - a.inr);
  const imgInr = images * (IMAGE_PRICES[s.websiteImageModel]?.low[2] ?? 0.016) * s.fxRate;
  const aiInr = modelRows.reduce((a, r) => a + r.inr, 0) + imgInr;
  const names = new Map(companyDocs.map((d) => [String(d._id), String(d.name ?? d._id)]));
  const sum = (m: string) => usage.find((u) => u._id === m)?.total ?? 0;
  const emailsN = sum("emails");
  const voiceMin = sum("voice_seconds") / 60;
  const storageGb = sum("storage_bytes") / 1024 ** 3;
  const free = companyDocs.filter((d) => ["free", undefined].includes((d as { subscription?: { planId?: string } }).subscription?.planId)).length;
  const emailsInr = emailsN * unit.perEmail, voiceInr = voiceMin * unit.perVoiceMinute, storageInr = storageGb * 1024 * unit.storagePerMbMonth;
  return {
    period,
    ai: { totalInr: aiInr, tokens: modelRows.reduce((a, r) => a + r.tokens, 0), calls: modelRows.reduce((a, r) => a + r.calls, 0), images, byModel: modelRows, byCompany: byCompany.map((r) => ({ companyId: r._id, name: names.get(r._id) ?? r._id, tokens: r.t, inr: (r.t / 1000) * unit.aiPerThousandTokens })) },
    emails: { count: emailsN, inr: emailsInr },
    voice: { minutes: voiceMin, inr: voiceInr },
    storage: { gb: storageGb, inr: storageInr },
    totalInr: aiInr + emailsInr + voiceInr + storageInr,
    companies: { free, paying: companyDocs.length - free, total: companyDocs.length },
    measured: await measure(byModel, companyDocs.map((d) => ({ id: String(d._id), planId: (d as { subscription?: { planId?: string } }).subscription?.planId ?? "free" })), period),
  };
}

/** Input share, model mix and how much of their limits paying companies really use — from this month's records. */
async function measure(byModel: { _id: string; i: number; o: number; t: number }[], companies: { id: string; planId: string }[], period: string): Promise<ActualCosts["measured"]> {
  const known = byModel.map((r) => ({ id: OPENAI_MODELS.find((m) => r._id === m.id || (r._id || "").startsWith(`${m.id}-20`))?.id ?? null, i: r.i, o: r.o, t: r.t })).filter((r) => r.id);
  const inOut = known.reduce((a, r) => a + r.i + r.o, 0);
  const inputSharePct = inOut > 2_000 ? Math.round((known.reduce((a, r) => a + r.i, 0) / inOut) * 100) : null;
  const tokens = known.reduce((a, r) => a + r.t, 0);
  const aiMix = tokens > 2_000 ? [...new Set(known.map((r) => r.id as string))].map((id) => ({ model: id, pct: Math.round((known.filter((r) => r.id === id).reduce((a, r) => a + r.t, 0) / tokens) * 100) })) : null;

  const db = await getPlatformDb();
  const plans = await db.collection<{ _id: string; limits: Record<string, number | null> }>("billing_plans").find({}).toArray();
  const limitsOf = new Map(plans.map((p) => [String(p._id), p.limits]));
  const paying = companies.filter((c) => c.planId !== "free" && limitsOf.has(c.planId));
  let utilization: { ai: number; storage: number; emails: number; voice: number } | null = null;
  if (paying.length > 0) {
    const ids = new Set(paying.map((c) => c.id));
    const docs = await db.collection("billing_usage").find({ $or: [{ period }, { metric: "storage_bytes" }] }).toArray();
    const sum: Record<string, number> = { ai_tokens: 0, emails: 0, voice_seconds: 0, storage_bytes: 0 };
    for (const d of docs) {
      const cid = String(d._id).split("::")[0];
      if (ids.has(cid) && String(d.metric) in sum) sum[String(d.metric)] += Number(d.total) || 0;
    }
    const cap = (key: string) => paying.reduce((a, c) => a + (limitsOf.get(c.planId)?.[key] ?? 0), 0);
    const pct = (used: number, limit: number) => (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);
    utilization = { ai: pct(sum.ai_tokens, cap("aiTokensPerMonth")), storage: pct(sum.storage_bytes / 1024 ** 2, cap("storageMb")), emails: pct(sum.emails, cap("emailsPerMonth")), voice: pct(sum.voice_seconds / 60, cap("voiceMinutesPerMonth")) };
  }
  return { inputSharePct, aiMix, utilization, payingSampled: paying.length };
}
