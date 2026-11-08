import { getPrompt } from "@/lib/prompts/store";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import { CATEGORIES, getSubServices } from "@/lib/categories";
import { OFFERS_COLLECTION, type Offer } from "@/lib/offers/offers";
import { formatOfferBadge } from "@/lib/offers/constants";
import { listClientOptions } from "@/lib/products/sprintos/clients";
import { getSettings, type BrandContext } from "@/lib/products/viralpulse-ai/settings";

/**
 * Assembles the brand context every AI prompt starts from. Nothing here is
 * stored by SMMS except the marketing-voice fields in settings: company
 * identity comes from HRMS company details, the service catalogue from the
 * public site, live offers from Festival Offers, and — when a campaign is run
 * for a client — the client from PMS.
 */

export interface ServiceOption {
  value: string;
  label: string;
  group: string;
}

/** The public site's service catalogue (category → sub-services), for pickers. */
export function serviceCatalogue(): ServiceOption[] {
  const out: ServiceOption[] = [];
  for (const c of CATEGORIES) {
    out.push({ value: c.label, label: c.label, group: c.label });
    for (const s of getSubServices(c.slug)) out.push({ value: `${c.label} — ${s.label}`, label: s.label, group: c.label });
  }
  return out;
}

export interface LiveOffer {
  _id: string;
  title: string;
  badge: string;
  validUntil: string;
  ctaText: string | null;
}

/** Active, in-date offers from Festival Offers (read-only). */
export async function listLiveOffers(limit = 12): Promise<LiveOffer[]> {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .collection<Offer>(OFFERS_COLLECTION)
    .find({ deletedAt: null, status: "active", validFrom: { $lte: now }, validUntil: { $gte: now } })
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit)
    .toArray()
    .catch(() => []);
  return rows.map((o) => ({ _id: o._id, title: o.title, badge: o.badgeText || formatOfferBadge(o.pricing), validUntil: o.validUntil.toISOString(), ctaText: o.ctaText ?? null }));
}

export async function listClientChoices(): Promise<{ _id: string; name: string }[]> {
  const rows = await listClientOptions().catch(() => []);
  return rows.map((c) => ({ _id: c._id, name: c.companyName }));
}

async function clientSummary(clientId: string): Promise<string | null> {
  const db = await getDb();
  const c = await db
    .collection<{ _id: string; companyName: string; industry: string | null; website: string | null; notes: string | null; deletedAt: Date | null }>("pms_clients")
    .findOne({ _id: clientId, deletedAt: null }, { projection: { companyName: 1, industry: 1, website: 1, notes: 1 } })
    .catch(() => null);
  if (!c) return null;
  return [`Client brand: ${c.companyName}`, c.industry && `Industry: ${c.industry}`, c.website && `Website: ${c.website}`, c.notes && `Notes: ${c.notes.slice(0, 600)}`].filter(Boolean).join("\n");
}

export interface BrandSnapshot {
  companyName: string;
  website: string;
  brand: BrandContext;
  offers: LiveOffer[];
}

export async function getBrandSnapshot(): Promise<BrandSnapshot> {
  const [company, settings] = await Promise.all([getCompanyDetails(), getSettings()]);
  const offers = settings.brand.includeOffers ? await listLiveOffers(8) : [];
  return { companyName: company.name, website: company.website, brand: settings.brand, offers };
}

/**
 * The brand block of every prompt. When `clientId` is set the content is for
 * that client, so the operator's own voice, services and offers are left out.
 */
export async function brandPrompt(opts: { clientId?: string | null; offerId?: string | null } = {}): Promise<string> {
  if (opts.clientId) {
    const client = await clientSummary(opts.clientId);
    if (client) return await getPrompt("smms.brand.client", { client });
  }
  const s = await getBrandSnapshot();
  const b = s.brand;
  const lines = [
    `Company: ${s.companyName}`,
    s.website && `Website: ${s.website}`,
    b.about && `About: ${b.about}`,
    b.services.length > 0 && `Services: ${b.services.join("; ")}`,
    b.products.length > 0 && `Products: ${b.products.join("; ")}`,
    b.tone && `Brand tone: ${b.tone}`,
    b.targetAudience && `Target audience: ${b.targetAudience}`,
    b.messaging && `Brand messaging: ${b.messaging}`,
    b.websiteInfo && `Website information: ${b.websiteInfo}`,
    b.sellingPoints.length > 0 && `Key selling points: ${b.sellingPoints.join("; ")}`,
    b.brandHashtags.length > 0 && `Branded hashtags: ${b.brandHashtags.join(" ")}`,
    b.avoid.length > 0 && (await getPrompt("smms.brand.avoid", { avoid: b.avoid.join("; ") })),
  ].filter(Boolean);
  let offers = s.offers;
  if (opts.offerId) offers = offers.filter((o) => o._id === opts.offerId);
  if (offers.length > 0) lines.push(await getPrompt("smms.brand.offers", { offers: offers.map((o) => `${o.title} (${o.badge}, valid until ${o.validUntil.slice(0, 10)})`).join("; ") }));
  return await getPrompt("smms.brand.company", { lines: lines.join("\n") });
}
