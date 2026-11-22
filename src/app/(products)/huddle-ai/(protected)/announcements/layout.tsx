import { requireChatPage } from "@/lib/messenger-auth";

// The menu hides this section from people without it; a typed address goes back to the Huddle home.
export default async function AnnouncementsLayout({ children }: { children: React.ReactNode }) {
  await requireChatPage("announcements.view");
  return children;
}
