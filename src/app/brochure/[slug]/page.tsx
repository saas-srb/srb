import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBrochureBySlug } from "@/lib/products/viralpulse-ai/brochure/store";
import PublicBrochureClient from "@/components/products/viralpulse-ai/brochure/PublicBrochureClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brochure = await getBrochureBySlug(slug);

  if (!brochure) {
    return {
      title: "Brochure Not Found",
      robots: { index: false, follow: false },
    };
  }

  const title = brochure.title;
  const description =
    brochure.meta.description ||
    `Official digital brochure for ${brochure.meta.brandName || brochure.title}. Explore services, product specifications, and business inquiries.`;

  return {
    title: `${title} | Digital Brochure`,
    description,
    keywords: brochure.meta.keywords ? brochure.meta.keywords.split(",").map((s) => s.trim()) : undefined,
    openGraph: {
      title: `${title} | Digital Brochure`,
      description,
      type: "website",
      images: brochure.meta.ogImage ? [{ url: brochure.meta.ogImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: brochure.meta.ogImage ? [brochure.meta.ogImage] : undefined,
    },
  };
}

export default async function PublicBrochurePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brochure = await getBrochureBySlug(slug);

  if (!brochure) {
    notFound();
  }

  // JSON-LD Structured Data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: brochure.title,
    description: brochure.meta.description,
    publisher: {
      "@type": "Organization",
      name: brochure.meta.brandName || brochure.title,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicBrochureClient
        brochure={{
          id: brochure._id,
          title: brochure.title,
          slug: brochure.slug,
          category: brochure.category,
          sections: brochure.sections,
          theme: brochure.theme,
          meta: brochure.meta,
        }}
      />
    </>
  );
}
