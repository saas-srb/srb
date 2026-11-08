import PanelBellLink from "@/components/platform/PanelBellLink";
import type { DlmsBellItem } from "@/lib/products/cybervault/notifications";


/** Links to the product's Notifications page (the dropdown was retired). `items` is kept so topbars need no change. */
export default function DlmsNotificationsBell({ unread }: { items: DlmsBellItem[]; unread: number }) {
  return <PanelBellLink href="/cybervault/notifications" unread={unread} />;
}
