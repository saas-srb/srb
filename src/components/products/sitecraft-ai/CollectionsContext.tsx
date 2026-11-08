"use client";

import { createContext, useContext, useMemo } from "react";
import { SITE_COLLECTIONS } from "@/lib/products/sitecraft-ai/collections/defs";
import type { CollectionDef, CollectionKey, CollectionsSnapshot } from "@/lib/products/sitecraft-ai/collections/types";
import type { BlogPostMeta } from "@/types/content";
import type { Job } from "@/types/content";
import type { EngagementCategory } from "@/types/content";

/**
 * The published CMS collection records, provided once by `(site)/layout.tsx`
 * so client components — listings, cards, the section renderer — read the
 * same records the server used for metadata. Without a provider there are no
 * records (every renderer of the site is inside one).
 */
const CollectionsContext = createContext<CollectionsSnapshot>({});

export function CollectionsProvider({ snapshot, children }: { snapshot: CollectionsSnapshot; children: React.ReactNode }) {
  const parent = useContext(CollectionsContext);
  // Nested providers (e.g. a page adding `products`) extend rather than replace the layout's.
  const value = useMemo(() => ({ ...parent, ...snapshot }), [parent, snapshot]);
  return <CollectionsContext.Provider value={value}>{children}</CollectionsContext.Provider>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous record types
export function useRuntime<T>(key: CollectionKey, def: CollectionDef<any, any>): T[] {
  const snapshot = useContext(CollectionsContext);
  const stored = snapshot[key];
  return useMemo(() => (stored ?? []).map((r) => def.toRuntime(r) as T), [def, stored]);
}

export const useBlogPosts = () => useRuntime<BlogPostMeta>("blog", SITE_COLLECTIONS.blog);
export const useJobs = () => useRuntime<Job>("jobs", SITE_COLLECTIONS.jobs);
export const useEngagementModels = () => useRuntime<EngagementCategory>("engagement", SITE_COLLECTIONS.engagement);

/** For non-hook callers that were handed the runtime lists (e.g. section toProps). */
export interface CollectionsRuntime {
  blog: BlogPostMeta[];
  jobs: Job[];
  engagement: EngagementCategory[];
}

export function useCollectionsRuntime(): CollectionsRuntime {
  return { blog: useBlogPosts(), jobs: useJobs(), engagement: useEngagementModels() };
}

