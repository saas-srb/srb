"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { setEventChannel, setSectionEnabled, type ControlChannel, type ControlResult } from "@/lib/platform/feature-controls";
import { eventCatalog } from "@/lib/notify/center/store";

const done = <T>(res: T) => {
  revalidatePath("/console/notification-center");
  return res;
};
const CHANNELS = ["inApp", "push", "email"] as const;

/** Show or hide the Notification center page for every company (their notifications keep being delivered either way). */
export async function setNotificationCenterEnabledAction(enabled: boolean): Promise<ControlResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await setSectionEnabled("notificationCenter", enabled === true, { id: user.id, email: user.email }));
}

/** Turn one channel of one notification event on or off for every company. */
export async function setEventChannelAction(key: string, channel: ControlChannel, enabled: boolean): Promise<ControlResult> {
  const user = await requirePlatformPermission("settings.manage");
  if (!(CHANNELS as readonly string[]).includes(channel)) return { ok: false, error: "Unknown channel." };
  const event = eventCatalog().find((e) => e.key === String(key ?? ""));
  return done(await setEventChannel(String(key ?? ""), channel, enabled === true, { id: user.id, email: user.email }, { exists: !!event, locked: event?.locked ?? false, channels: event?.channels ?? [] }));
}
