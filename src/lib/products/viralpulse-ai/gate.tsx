import "server-only";
import ProductLocked from "@/components/products/common/ProductLocked";
import { can, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";

/** A page needs one micro feature. The polite locked page for someone who types the address (menus hide it); null when allowed. */
export function lockedUnless(viewer: Pick<SmmsViewer, "subject">, key: string, label: string) {
  return can(viewer, key) ? null : <ProductLocked product="viralpulse-ai" feature={label} />;
}
