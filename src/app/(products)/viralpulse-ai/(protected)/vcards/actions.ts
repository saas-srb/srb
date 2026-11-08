"use server";

import { run } from "@/lib/products/viralpulse-ai/run";
import type { VCardDoc } from "@/lib/products/viralpulse-ai/vcard/types";

// ── CRUD Actions ─────────────────────────────────────────────────────────────

export async function createVCardAction(input: {
  title: string;
  name: string;
  jobTitle: string;
  company: string;
  bio?: string;
  layout?: string;
  colorScheme?: string;
  sections?: import("@/lib/products/viralpulse-ai/vcard/types").VCardSection[];
  style?: import("@/lib/products/viralpulse-ai/vcard/types").VCardStyle;
  contact?: import("@/lib/products/viralpulse-ai/vcard/types").VCardContact;
  branding?: import("@/lib/products/viralpulse-ai/vcard/types").VCardBranding;
  meta?: { description?: string; keywords?: string };
}) {
  const { createVCardApi } = await import("@/lib/products/viralpulse-ai/vcard/api");
  return run(["GENERATE_AI_CONTENT"], async () => {
    const card = await createVCardApi(input);
    return card;
  });
}

export async function listVCardsAction(opts: { status?: string } = {}) {
  const { listVCardsApi } = await import("@/lib/products/viralpulse-ai/vcard/api");
  return run(["GENERATE_AI_CONTENT"], async () => {
    return listVCardsApi(opts);
  });
}

export async function getVCardAction(id: string) {
  const { getVCardDetailApi } = await import("@/lib/products/viralpulse-ai/vcard/api");
  return run(["GENERATE_AI_CONTENT"], async () => {
    return getVCardDetailApi(id);
  });
}

export async function saveVCardAction(
  id: string,
  patch: Partial<Omit<VCardDoc, "_id" | "tenantId" | "userId" | "createdAt">>
) {
  const { updateVCardFieldsApi } = await import("@/lib/products/viralpulse-ai/vcard/api");
  return run(["GENERATE_AI_CONTENT"], async () => {
    return updateVCardFieldsApi(id, patch);
  }, { revalidate: false });
}

export async function publishVCardAction(id: string) {
  const { publishVCardApi } = await import("@/lib/products/viralpulse-ai/vcard/api");
  return run(["GENERATE_AI_CONTENT"], async () => {
    return publishVCardApi(id);
  });
}

export async function unpublishVCardAction(id: string) {
  const { unpublishVCardApi } = await import("@/lib/products/viralpulse-ai/vcard/api");
  return run(["GENERATE_AI_CONTENT"], async () => {
    return unpublishVCardApi(id);
  });
}

export async function deleteVCardAction(id: string) {
  const { deleteVCardApi } = await import("@/lib/products/viralpulse-ai/vcard/api");
  return run(["GENERATE_AI_CONTENT"], async () => {
    await deleteVCardApi(id);
    return { deleted: true };
  });
}

export async function duplicateVCardAction(id: string) {
  const { duplicateVCardApi } = await import("@/lib/products/viralpulse-ai/vcard/api");
  return run(["GENERATE_AI_CONTENT"], async () => {
    return duplicateVCardApi(id);
  });
}

// ── AI Actions ───────────────────────────────────────────────────────────────

export async function aiGenerateVCardAction(input: import("@/lib/products/viralpulse-ai/vcard/ai").VCardBriefInput) {
  const { generateVCardContent } = await import("@/lib/products/viralpulse-ai/vcard/ai");
  return run(["GENERATE_AI_CONTENT"], async () => {
    return generateVCardContent(input);
  }, { revalidate: false });
}

export async function aiUpdateFieldAction(input: {
  field: string;
  currentValue: string;
  prompt: string;
  context: import("@/lib/products/viralpulse-ai/vcard/ai").VCardContext;
}) {
  const { aiUpdateVCardField } = await import("@/lib/products/viralpulse-ai/vcard/ai");
  return run(["GENERATE_AI_CONTENT"], async () => {
    const newValue = await aiUpdateVCardField(input.field, input.currentValue, input.prompt, input.context);
    return { newValue };
  }, { revalidate: false });
}

export async function aiSuggestLayoutAction(context: import("@/lib/products/viralpulse-ai/vcard/ai").VCardContext) {
  const { aiSuggestLayout } = await import("@/lib/products/viralpulse-ai/vcard/ai");
  return run(["GENERATE_AI_CONTENT"], async () => {
    return aiSuggestLayout(context);
  }, { revalidate: false });
}

export async function aiChatVCardAction(input: {
  message: string;
  vcard: import("@/lib/products/viralpulse-ai/vcard/types").VCardDetail;
  history: Array<{ role: string; content: string }>;
}) {
  const { aiChatVCard } = await import("@/lib/products/viralpulse-ai/vcard/ai");
  return run(["GENERATE_AI_CONTENT"], async () => {
    return aiChatVCard(input.message, input.vcard, input.history);
  }, { revalidate: false });
}
