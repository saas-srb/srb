import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { siteGuard } from "@/lib/webpush/api";
import { getWebPushSettings } from "@/lib/webpush/store";
import { WEB_PUSH_TOPICS, WEB_PUSH_TOPIC_META } from "@/lib/webpush/topics";
import { pushConfigured, vapidPublicKey } from "@/lib/push/vapid";

/** What the website's notification prompt needs: whether it should appear, its text, the topics and the public key. */
export const dynamic = "force-dynamic";

async function handleGET(req: Request) {
  const blocked = await siteGuard(req, "wp-config", 120);
  if (blocked) return blocked;
  const s = await getWebPushSettings();
  const enabled = s.enabled && (await pushConfigured());
  return NextResponse.json(
    {
      enabled,
      publicKey: enabled ? await vapidPublicKey() : null,
      topics: enabled ? WEB_PUSH_TOPICS.filter((t) => s.topics[t]).map((t) => ({ key: t, ...WEB_PUSH_TOPIC_META[t] })) : [],
      title: s.promptTitle,
      text: s.promptText,
      delaySeconds: s.promptDelaySeconds,
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}

export const GET = withTransport(handleGET);
