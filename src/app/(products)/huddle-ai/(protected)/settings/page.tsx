import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import SettingsForm from "@/components/products/huddle-ai/SettingsForm";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { getChatUser } from "@/lib/products/huddle-ai/users";

export const dynamic = "force-dynamic";

export default async function MessengerSettingsPage() {
  const user = await getCurrentChatUser();
  if (!user) return null;
  const profile = await getChatUser(user.id);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Messenger", href: "/huddle-ai" }, { label: "Settings" }]}
          title={<>Settings</>}
        />
<div className="mx-auto max-w-xl space-y-4">
        <SettingsForm
          displayName={profile?.displayName ?? user.displayName}
          email={user.email}
          soundEnabled={profile?.soundEnabled ?? true}
          presenceDefault={profile?.presenceDefault ?? "online"}
        />
      </div>
</div>
    </div>
  );
}
