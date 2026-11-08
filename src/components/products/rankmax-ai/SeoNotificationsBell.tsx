import PanelBellLink from "@/components/platform/PanelBellLink";
import type { SeoBellItem } from "@/lib/products/rankmax-ai/notifications";


/** Links to the product's Notifications page (the dropdown was retired). `items` is kept so topbars need no change. */
export default function SeoNotificationsBell({ unread }: { items: SeoBellItem[]; unread: number }) {
  return <PanelBellLink href="/rankmax-ai/notifications" unread={unread} />;
}
