import { createElement } from "react";
import { resolveIcon } from "@/lib/products/sitecraft-ai/icon-map";

/** An icon chosen by CMS key (see icon-map.ts), e.g. a blog post's category icon. */
export default function DynamicIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  return createElement(resolveIcon(name), { className });
}
