import "server-only";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import * as api from "@/lib/products/viralpulse-ai/ugc/api";
import type { UgcConnections } from "@/lib/products/viralpulse-ai/ugc/api";
import type { UgcSettings } from "@/lib/products/viralpulse-ai/ugc/store";

/** What the wizard and the detail screen both need from the server: permissions, limits, spend so far and what is connected. */
export async function loadWizardContext(): Promise<
  | { ok: false; redirect: string }
  | { ok: true; props: { settings: UgcSettings; spentTodayUsd: number; connections: UgcConnections; canApprove: boolean; canUpload: boolean; canIntegrations: boolean } }
> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, redirect: "/viralpulse-ai/login" };
  if (!can(viewer, "GENERATE_AI_CONTENT")) return { ok: false, redirect: "/viralpulse-ai/ugc" };
  const [ov, conn] = await Promise.all([api.overview(), api.connections()]);
  if (!ov.ok || !conn.ok) return { ok: false, redirect: "/viralpulse-ai/ugc" };
  return {
    ok: true,
    props: {
      settings: ov.overview.settings,
      spentTodayUsd: ov.overview.spentTodayUsd,
      connections: conn.connections,
      canApprove: can(viewer, "PUBLISH_CONTENT"),
      canUpload: can(viewer, "MANAGE_MEDIA") || can(viewer, "MANAGE_POSTS"),
      canIntegrations: can(viewer, "MANAGE_INTEGRATIONS"),
    },
  };
}
