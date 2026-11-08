import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getVCard } from "@/lib/products/viralpulse-ai/vcard/store";
import PublicVCardClient from "@/components/products/viralpulse-ai/vcard/PublicVCardClient";
import type { VCardDetail } from "@/lib/products/viralpulse-ai/vcard/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getVCard(slug).catch(() => null);
  if (!doc) return { title: "Visiting Card" };
  return {
    title: `${doc.name} — ${doc.jobTitle} at ${doc.company}`,
    description: doc.meta?.description || doc.bio || `Connect with ${doc.name}`,
    openGraph: {
      title: `${doc.name} · ${doc.jobTitle}`,
      description: doc.meta?.description || doc.bio || undefined,
      type: "profile",
    },
  };
}

function toDetail(doc: Awaited<ReturnType<typeof getVCard>>): VCardDetail {
  if (!doc) throw new Error();
  return {
    id: doc._id,
    title: doc.title,
    slug: doc.slug,
    name: doc.name,
    jobTitle: doc.jobTitle,
    company: doc.company,
    bio: doc.bio,
    layout: doc.layout,
    colorScheme: doc.colorScheme,
    style: doc.style,
    contact: doc.contact,
    branding: doc.branding,
    sections: doc.sections,
    status: doc.status,
    analytics: {
      views: doc.analytics.views,
      ctaClicks: doc.analytics.ctaClicks,
      shares: doc.analytics.shares,
      lastViewedAt: doc.analytics.lastViewedAt?.toISOString() ?? null,
    },
    meta: doc.meta,
    publishedAt: doc.publishedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export default async function PublicVCardPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = await getVCard(slug).catch(() => null);
  if (!doc || doc.status !== "published") notFound();

  const card = toDetail(doc);
  return <PublicVCardClient card={card} />;
}
