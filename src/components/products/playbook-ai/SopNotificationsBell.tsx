import PanelBellLink from "@/components/platform/PanelBellLink";
import type { SopBellItem } from "@/lib/products/playbook-ai/notifications";


/** Links to the product's Notifications page (the dropdown was retired). `items` is kept so topbars need no change. */
export default function SopNotificationsBell({ unread }: { items: SopBellItem[]; unread: number }) {
  return <PanelBellLink href="/playbook-ai/notifications" unread={unread} />;
}
