import UnifiedNotificationsPage from "@/components/platform/panel/UnifiedNotificationsPage";

export const dynamic = "force-dynamic";

export default function CmsNotificationsPage() {
  return <UnifiedNotificationsPage panel="cms" panelName="Content Management System" shortCode="CMS" description="Publishing, theme, offers, push notifications, chatbot visitors and site-wide changes." />;
}
