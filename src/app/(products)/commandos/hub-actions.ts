"use server";

import { getCurrentHubUser } from "@/lib/hub-auth";
import { globalSearch, type SearchHit } from "@/lib/platform/search";
import { askBusiness, type AssistantReply } from "@/lib/platform/ai/assistant";
import { isNotificationSource, listWorkspaceNotifications, markAllWorkspaceNotificationsRead, markWorkspaceNotificationRead, workspaceUnreadCount, type WorkspaceNotification } from "@/lib/products/commandos/notifications";

/** Server actions behind the Staff Hub's search palette, notification bell and "Ask about your business" box. */

export async function hubSearchAction(query: string): Promise<SearchHit[]> {
  const user = await getCurrentHubUser();
  if (!user) return [];
  return globalSearch(user, String(query ?? ""));
}

export async function hubAskAction(question: string): Promise<AssistantReply> {
  const user = await getCurrentHubUser();
  if (!user) return { ok: false, error: "Sign in again to continue." };
  return askBusiness(user, question);
}

export async function hubUnreadCountAction(): Promise<number> {
  const user = await getCurrentHubUser();
  return user ? workspaceUnreadCount(user) : 0;
}

export async function hubMarkReadAction(id: string, source: string = "workspace"): Promise<{ unread: number }> {
  const user = await getCurrentHubUser();
  if (!user || !isNotificationSource(source)) return { unread: 0 };
  await markWorkspaceNotificationRead(user, source, String(id));
  return { unread: await workspaceUnreadCount(user) };
}

export async function hubMarkAllReadAction(): Promise<{ items: WorkspaceNotification[]; unread: number }> {
  const user = await getCurrentHubUser();
  if (!user) return { items: [], unread: 0 };
  await markAllWorkspaceNotificationsRead(user);
  return { items: await listWorkspaceNotifications(user), unread: await workspaceUnreadCount(user) };
}
