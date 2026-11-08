import PanelBellLink from "@/components/platform/PanelBellLink";
import type { SmmsBellItem } from "@/lib/products/viralpulse-ai/notifications";


/** Links to the product's Notifications page (the dropdown was retired). `items` is kept so topbars need no change. */
export default function SmmsNotificationsBell({ unread }: { items: SmmsBellItem[]; unread: number }) {
  return <PanelBellLink href="/viralpulse-ai/notifications" unread={unread} />;
}
