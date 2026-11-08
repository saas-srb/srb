import { BellRing } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import WebPushManager from "@/components/products/commandos/WebPushManager";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { getWebPushSettings, listBroadcasts, subscriberStats } from "@/lib/webpush/store";
import { pushConfigured } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function WebsitePushPage() {
  await requireWorkspaceAccess("manage.push");
  const [settings, stats, broadcasts, serverReady] = await Promise.all([
    getWebPushSettings(),
    subscriberStats(),
    listBroadcasts(25),
    pushConfigured(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        title="Website push notifications"
        description={<>Notify your website visitors about offers, credits and rewards, and news, even when they aren&apos;t on your site.</>}
        leading={<BellRing className="size-8 text-primary" aria-hidden />}
      />
      <WebPushManager
        serverReady={serverReady}
        initialSettings={settings}
        stats={stats}
        broadcasts={broadcasts.map((b) => ({ id: b._id, topic: b.topic, title: b.title, body: b.body, url: b.url, trigger: b.trigger, status: b.status, note: b.note, targeted: b.targeted, sent: b.sent, failed: b.failed, clicks: b.clicks, createdAt: b.createdAt.toISOString() }))}
      />
    </div>
  );
}
