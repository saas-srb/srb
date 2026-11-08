"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { runCallAction, type ActionResult } from "@/lib/products/agentos/calls/action-run";
import { addDoNotCall, removeDoNotCall } from "@/lib/products/agentos/calls/dnc";
import { assignInboundAgent, importTwilioNumber, removePhoneNumber, type PhoneNumberView } from "@/lib/products/agentos/calls/numbers";
import { getCallSettings, saveCallSettings, savePublicCallSettings, type PublicCallSettings } from "@/lib/products/agentos/calls/settings";
import { registerWebhookWithElevenLabs, resetWebhookUrl, saveWebhookSecret, type RegisterResult } from "@/lib/products/agentos/calls/webhook";
import type { CallSettings } from "@/lib/products/agentos/calls/types";
import { AibotsInputError, type AibotsViewer } from "@/lib/products/agentos/viewer";

const manage = { permission: "VOICE_CALL_MANAGE" as const, write: true };
const PHONE_ROOT = "/commandos/settings/products/agentos/phone";
const refresh = (...paths: string[]) => paths.forEach((path) => revalidatePath(path));
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

async function runPhoneAction<T extends object>(
  action: (viewer: AibotsViewer) => Promise<ActionResult<T> | T>
): Promise<ActionResult<T>> {
  await requireWorkspaceAction("company.products");
  return runCallAction<T>(manage, action);
}

export async function importNumberAction(input: { number: string; label: string }): Promise<ActionResult<{ number: PhoneNumberView }>> {
  return runPhoneAction(async (viewer) => {
    const number = await importTwilioNumber(viewer, { number: str(input?.number, 40), label: str(input?.label, 120) });
    refresh(PHONE_ROOT, "/agentos/calls");
    return { number };
  });
}

export async function assignInboundAgentAction(numberId: string, agentId: string | null): Promise<ActionResult<{ number: PhoneNumberView }>> {
  return runPhoneAction(async (viewer) => {
    const number = await assignInboundAgent(viewer, str(numberId, 64), agentId ? str(agentId, 64) : null);
    refresh(PHONE_ROOT, "/agentos/calls");
    return { number };
  });
}

export async function removeNumberAction(numberId: string): Promise<ActionResult<{ removed: true }>> {
  return runPhoneAction(async (viewer) => {
    await removePhoneNumber(viewer, str(numberId, 64));
    refresh(PHONE_ROOT, "/agentos/calls");
    return { removed: true as const };
  });
}

export async function saveCallSettingsAction(raw: Record<string, unknown>): Promise<ActionResult<{ settings: CallSettings }>> {
  return runPhoneAction(async (viewer) => {
    const settings = await saveCallSettings(viewer, raw && typeof raw === "object" ? raw : {});
    refresh(`${PHONE_ROOT}/settings`, PHONE_ROOT, "/agentos/calls");
    return { settings };
  });
}

export async function addDoNotCallAction(phone: string, reason: string): Promise<ActionResult<{ added: true }>> {
  return runPhoneAction(async (viewer) => {
    await addDoNotCall(viewer, str(phone, 40), str(reason, 300));
    refresh(`${PHONE_ROOT}/do-not-call`, "/agentos/calls");
    return { added: true as const };
  });
}

export async function removeDoNotCallAction(entryId: string): Promise<ActionResult<{ removed: true }>> {
  return runPhoneAction(async (viewer) => {
    await removeDoNotCall(viewer, str(entryId, 64));
    refresh(`${PHONE_ROOT}/do-not-call`, "/agentos/calls");
    return { removed: true as const };
  });
}

/** Issues a new webhook address (the old one stops working) and returns it once. */
export async function resetWebhookUrlAction(): Promise<ActionResult<{ url: string }>> {
  return runPhoneAction(async (viewer) => {
    const url = await resetWebhookUrl(viewer);
    refresh(PHONE_ROOT);
    return { url };
  });
}

export async function saveWebhookSecretAction(secret: string): Promise<ActionResult<{ saved: true }>> {
  return runPhoneAction(async (viewer) => {
    await saveWebhookSecret(viewer, str(secret, 400));
    refresh(PHONE_ROOT, "/agentos/calls");
    return { saved: true as const };
  });
}

/** Tries to register the webhook in ElevenLabs. The page shows manual steps if automatic setup is unavailable. */
export async function registerWebhookAction(): Promise<ActionResult<{ result: RegisterResult }>> {
  return runPhoneAction(async (viewer) => {
    const result = await registerWebhookWithElevenLabs(viewer);
    refresh(PHONE_ROOT, "/agentos/calls");
    return { result };
  });
}

/** Switches how calls are placed (automatic, conference or direct) without touching the other calling rules. */
export async function saveCallModeAction(mode: string): Promise<ActionResult<{ callMode: CallSettings["callMode"] }>> {
  return runPhoneAction(async (viewer) => {
    if (mode !== "auto" && mode !== "conference" && mode !== "direct") throw new AibotsInputError("Pick automatic, conference or direct calling.");
    const cur = await getCallSettings();
    const settings = await saveCallSettings(viewer, { ...cur, callMode: mode });
    refresh(PHONE_ROOT, `${PHONE_ROOT}/settings`, "/agentos/calls");
    return { callMode: settings.callMode };
  });
}

/** Saves the website-call limits and the number-masking choice. */
export async function savePublicCallSettingsAction(raw: Record<string, unknown>): Promise<ActionResult<{ settings: PublicCallSettings }>> {
  return runPhoneAction(async (viewer) => {
    const settings = await savePublicCallSettings(viewer, raw && typeof raw === "object" ? raw : {});
    refresh(`${PHONE_ROOT}/settings`, "/agentos/calls");
    return { settings };
  });
}
