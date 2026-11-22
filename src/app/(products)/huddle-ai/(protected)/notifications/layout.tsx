import { requireChatPage } from "@/lib/messenger-auth";

// The menu hides this section from people without it; a typed address goes back to the Huddle home.
export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  await requireChatPage("notifications.view");
  return children;
}
