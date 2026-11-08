"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { deletePanel, savePanel, seedPanels, setCompanyPanelActive, setPanelActive, type PanelInput } from "@/lib/platform/panels/store";

type Result = { ok: true; message?: string } | { ok: false; error: string };

// Every page that lists products reads the registry; the root layout carries it to every header, so refresh them all.
function refresh(companyId?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/console/products");
  if (companyId) revalidatePath(`/console/companies/${companyId}`);
}

export async function savePanelAction(mode: "create" | "update", input: PanelInput): Promise<Result> {
  const auth = await checkPlatformPermission("panels.manage");
  if (!auth.ok) return auth;
  const res = await savePanel(input, mode);
  if (!res.ok) return res;
  await recordPlatformAudit({ actorId: auth.user.id, action: mode === "create" ? "panel.create" : "panel.update", target: { type: "panel", id: res.panel.key }, details: { name: res.panel.name, active: res.panel.active } });
  refresh();
  return { ok: true, message: mode === "create" ? "Product added." : "Product saved." };
}

/** Global switch: affects every company. */
export async function setPanelActiveAction(key: string, active: boolean): Promise<Result> {
  const auth = await checkPlatformPermission("panels.manage");
  if (!auth.ok) return auth;
  const res = await setPanelActive(String(key), active === true);
  if (!res.ok) return res;
  await recordPlatformAudit({ actorId: auth.user.id, action: active ? "panel.activate" : "panel.deactivate", target: { type: "panel", id: String(key) }, details: { scope: "global" } });
  refresh();
  return { ok: true, message: active ? "Product activated for every company." : "Product deactivated for every company." };
}

export async function deletePanelAction(key: string): Promise<Result> {
  const auth = await checkPlatformPermission("panels.manage");
  if (!auth.ok) return auth;
  const res = await deletePanel(String(key));
  if (!res.ok) return res;
  await recordPlatformAudit({ actorId: auth.user.id, action: "panel.delete", target: { type: "panel", id: String(key) } });
  refresh();
  return { ok: true, message: "Product deleted." };
}

/** Company-specific switch: affects only that company. */
export async function setCompanyPanelActiveAction(companyId: string, key: string, active: boolean): Promise<Result> {
  const auth = await checkPlatformPermission("panels.manage");
  if (!auth.ok) return auth;
  const res = await setCompanyPanelActive(String(companyId), String(key), active === true);
  if (!res.ok) return res;
  await recordPlatformAudit({ actorId: auth.user.id, action: active ? "panel.activate" : "panel.deactivate", target: { type: "panel", id: String(key) }, companyId: String(companyId), details: { scope: "company" } });
  refresh(String(companyId));
  return { ok: true, message: active ? "Product activated for this company." : "Product deactivated for this company." };
}

/** Writes any missing default products; `reset` also restores the defaults for existing ones. */
export async function seedPanelsAction(reset: boolean): Promise<Result> {
  const auth = await checkPlatformPermission("panels.manage");
  if (!auth.ok) return auth;
  const r = await seedPanels({ reset: reset === true });
  await recordPlatformAudit({ actorId: auth.user.id, action: "panel.seed", target: { type: "panel", id: "*" }, details: { ...r, reset } });
  refresh();
  return { ok: true, message: `Added ${r.inserted}, restored ${r.reset}, kept ${r.kept}.` };
}
