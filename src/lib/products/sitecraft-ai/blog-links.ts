import type { BlogPostMeta } from "@/types/content";

/** Related posts of `slug`, resolved within `posts` (the published blog collection). */
export function relatedPostsIn(posts: BlogPostMeta[], slug: string): BlogPostMeta[] {
  const post = posts.find((p) => p.slug === slug);
  if (!post) return [];
  return post.related
    .map((relatedSlug) => posts.find((p) => p.slug === relatedSlug))
    .filter((p): p is BlogPostMeta => Boolean(p));
}

/** The next post after `slug` in `posts` order, wrapping around to the first post after the last. */
export function nextPostIn(posts: BlogPostMeta[], slug: string): BlogPostMeta {
  const index = posts.findIndex((post) => post.slug === slug);
  return posts[(index + 1) % posts.length];
}
