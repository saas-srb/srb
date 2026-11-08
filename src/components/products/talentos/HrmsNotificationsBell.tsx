import PanelBellLink from "@/components/platform/PanelBellLink";

export interface BellItem {
  _id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

/** Links to the product's Notifications page (the dropdown was retired). `items` is kept so topbars need no change. */
export default function HrmsNotificationsBell({ unread, basePath }: { items: BellItem[]; unread: number; basePath: string }) {
  return <PanelBellLink href={`${basePath}/notifications`} unread={unread} />;
}
