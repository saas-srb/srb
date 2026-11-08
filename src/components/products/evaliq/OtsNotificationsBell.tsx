import PanelBellLink from "@/components/platform/PanelBellLink";
import type { OtsBellItem } from "@/lib/products/evaliq/notifications";


/** Links to the product's Notifications page (the dropdown was retired). `items` is kept so topbars need no change. */
export default function OtsNotificationsBell({ unread }: { items: OtsBellItem[]; unread: number }) {
  return <PanelBellLink href="/evaliq/notifications" unread={unread} />;
}
