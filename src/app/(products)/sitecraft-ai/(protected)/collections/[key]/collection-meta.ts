import { Newspaper, Briefcase, Users, Boxes } from "lucide-react";
import type { CollectionKey } from "@/lib/products/sitecraft-ai/collections/types";

/** Icon + one-line description per collection, for the CMS screens. */
export const COLLECTION_META: Record<CollectionKey, { icon: React.ComponentType<{ className?: string }>; description: string }> = {
  blog: { icon: Newspaper, description: "Blog articles — their card details, SEO fields and order. Each post's body is its page under Pages." },
  jobs: { icon: Briefcase, description: "Open roles shown on the careers page and job board. Publishing a new job also creates its page." },
  engagement: { icon: Users, description: "The resource-augmentation hiring models and their plans, pricing and FAQs." },
  products: { icon: Boxes, description: "The SaaS products shown in the product catalogue." },
};
