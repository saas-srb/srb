import PanelBellLink from "@/components/platform/PanelBellLink";

export interface BellItem {
  _id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
}

/** Links to the product's Notifications page (the dropdown was retired). `items` is kept so topbars need no change. */
export default function TmsNotificationsBell({ unread }: { items: BellItem[]; unread: number }) {
  return <PanelBellLink href="/cohort-ai/notifications" unread={unread} />;
}
