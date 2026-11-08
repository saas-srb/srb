/**
 * Compatibility shim: the per-platform publishers now live in `publishers/` (one module per platform behind `PlatformPublisher`).
 * Import from "@/lib/products/viralpulse-ai/publishers/index" in new code.
 */
export * from "./publishers/index";
export { publicMediaUrl } from "./publishers/media-facts";
