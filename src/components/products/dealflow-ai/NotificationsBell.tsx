import PanelBellLink from "@/components/platform/PanelBellLink";

/** The LMS bell: a live count of this person's unread LMS notifications (new leads, stale-lead and application alerts, assignments …). */
export default function NotificationsBell({ unread = 0 }: { unread?: number }) {
  return <PanelBellLink href="/dealflow-ai/notifications" unread={unread} panel="lms" />;
}
