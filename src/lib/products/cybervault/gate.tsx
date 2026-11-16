import "server-only";
import ProductLocked from "@/components/products/common/ProductLocked";
import { can, type DlmsViewer } from "@/lib/products/cybervault/viewer";

/**
 * A page needs one micro feature. Returns the polite locked page (the server has already refused to load anything) when the person lacks it,
 * or null when they may continue. Menus hide what a person cannot use; this is only for someone who types the address.
 */
export function lockedUnless(viewer: Pick<DlmsViewer, "subject">, key: string, label: string) {
  return can(viewer, key) ? null : <ProductLocked product="cybervault" feature={label} />;
}
