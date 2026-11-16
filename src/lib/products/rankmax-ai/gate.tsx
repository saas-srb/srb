import "server-only";
import ProductLocked from "@/components/products/common/ProductLocked";
import { can, type SeoViewer } from "@/lib/products/rankmax-ai/viewer";

/** A page needs one micro feature. The polite locked page for someone who types the address (menus hide it); null when allowed. */
export function lockedUnless(viewer: Pick<SeoViewer, "subject">, key: string, label: string) {
  return can(viewer, key) ? null : <ProductLocked product="rankmax-ai" feature={label} />;
}
