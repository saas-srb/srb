import "server-only";
import { requireViewer, SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import {
  createVCard,
  listVCards,
  getVCardById,
  requireVCard,
  updateVCard,
  publishVCard,
  unpublishVCard,
  softDeleteVCard,
  duplicateVCard,
} from "./store";
import type {
  VCardDoc,
  VCardDetail,
  VCardListItem,
  VCardLayout,
  VCardColorScheme,
  VCardSection,
  VCardStyle,
  VCardContact,
  VCardBranding,
} from "./types";
import { VCARD_LAYOUTS, VCARD_COLOR_SCHEMES, DEFAULT_VCARD_STYLE } from "./types";

function toDetail(d: VCardDoc): VCardDetail {
  return {
    id: d._id,
    title: d.title,
    slug: d.slug,
    name: d.name,
    jobTitle: d.jobTitle,
    company: d.company,
    bio: d.bio,
    layout: d.layout,
    colorScheme: d.colorScheme,
    style: d.style,
    contact: d.contact,
    branding: d.branding,
    sections: d.sections,
    status: d.status,
    analytics: {
      views: d.analytics.views,
      ctaClicks: d.analytics.ctaClicks,
      shares: d.analytics.shares,
      lastViewedAt: d.analytics.lastViewedAt?.toISOString() ?? null,
    },
    meta: d.meta,
    publishedAt: d.publishedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function toListItem(d: VCardDoc): VCardListItem {
  return {
    id: d._id,
    title: d.title,
    slug: d.slug,
    name: d.name,
    jobTitle: d.jobTitle,
    company: d.company,
    layout: d.layout,
    colorScheme: d.colorScheme,
    status: d.status,
    views: d.analytics.views,
    updatedAt: d.updatedAt.toISOString(),
    publishedAt: d.publishedAt?.toISOString() ?? null,
  };
}

function parseLayout(v: unknown): VCardLayout {
  if (typeof v === "string" && (VCARD_LAYOUTS as readonly string[]).includes(v)) return v as VCardLayout;
  return "classic";
}

function parseColorScheme(v: unknown): VCardColorScheme {
  if (typeof v === "string" && (VCARD_COLOR_SCHEMES as readonly string[]).includes(v)) return v as VCardColorScheme;
  return "professional-blue";
}

function parseName(v: unknown, field = "Name"): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new SmmsInputError(`${field} is required.`);
  if (s.length > 200) throw new SmmsInputError(`${field} must be 200 characters or fewer.`);
  return s;
}

// ── API ───────────────────────────────────────────────────────────────────────

export interface CreateVCardInput {
  title: string;
  name: string;
  jobTitle: string;
  company: string;
  bio?: string;
  layout?: unknown;
  colorScheme?: unknown;
  style?: Partial<VCardStyle>;
  contact?: Partial<VCardContact>;
  branding?: Partial<VCardBranding>;
  sections?: VCardSection[];
  meta?: { description?: string; keywords?: string };
}

export async function createVCardApi(input: CreateVCardInput) {
  const viewer = await requireViewer();
  const name = parseName(input.name);
  const title = parseName(input.title || `${name}'s Visiting Card`, "Title");
  const jobTitle = typeof input.jobTitle === "string" ? input.jobTitle.trim() : "";
  const company = typeof input.company === "string" ? input.company.trim() : "";
  const layout = parseLayout(input.layout);
  const colorScheme = parseColorScheme(input.colorScheme);
  const style: VCardStyle = { ...DEFAULT_VCARD_STYLE, ...(input.style || {}) };
  const doc = await createVCard(
    {
      title,
      name,
      jobTitle,
      company,
      bio: input.bio || "",
      layout,
      colorScheme,
      style,
      contact: (input.contact as VCardContact) || {},
      branding: (input.branding as VCardBranding) || {},
      sections: input.sections || [],
      meta: input.meta,
    },
    viewer.userId
  );
  return toDetail(doc);
}

export async function listVCardsApi(opts: { status?: string } = {}) {
  await requireViewer();
  const status =
    opts.status === "draft" || opts.status === "published" ? opts.status : "all";
  const docs = await listVCards({ status });
  return docs.map(toListItem);
}

export async function getVCardDetailApi(id: string): Promise<VCardDetail> {
  await requireViewer();
  const doc = await requireVCard(id);
  return toDetail(doc);
}

export async function updateVCardFieldsApi(
  id: string,
  patch: Partial<Omit<VCardDoc, "_id" | "createdAt" | "createdBy">>
) {
  const viewer = await requireViewer();
  await requireVCard(id);
  await updateVCard(id, patch, viewer.userId);
  const updated = await getVCardById(id);
  if (!updated) throw new Error("Not found after update.");
  return toDetail(updated);
}

export async function publishVCardApi(id: string) {
  const viewer = await requireViewer();
  await requireVCard(id);
  await publishVCard(id, viewer.userId);
  const updated = await getVCardById(id);
  return toDetail(updated!);
}

export async function unpublishVCardApi(id: string) {
  const viewer = await requireViewer();
  await requireVCard(id);
  await unpublishVCard(id, viewer.userId);
  const updated = await getVCardById(id);
  return toDetail(updated!);
}

export async function deleteVCardApi(id: string) {
  const viewer = await requireViewer();
  await requireVCard(id);
  await softDeleteVCard(id, viewer.userId);
}

export async function duplicateVCardApi(id: string): Promise<VCardDetail> {
  const viewer = await requireViewer();
  await requireVCard(id);
  const copy = await duplicateVCard(id, viewer.userId);
  return toDetail(copy);
}
