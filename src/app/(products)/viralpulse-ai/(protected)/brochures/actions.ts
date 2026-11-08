"use server";

import * as api from "@/lib/products/viralpulse-ai/brochure/api";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import type { BrochureSection, BrochureTheme } from "@/lib/products/viralpulse-ai/brochure/types";

/**
 * Server actions for the Brochure Builder.
 * All actions delegate to the API layer, which resolves the viewer from the
 * session cookie and re-checks permissions on every call.
 */

const idGuard = (v: unknown): string => {
  if (typeof v !== "string" || !v || v.length > 80) throw new SmmsInputError("Invalid brochure ID.");
  return v;
};

export async function createBrochureAction(input: { title: unknown; category: unknown; customCategory?: unknown }) {
  return api.createBrochureProject({
    title: input.title,
    category: input.category,
    customCategory: input.customCategory,
  });
}

export async function listBrochuresAction(opts: { q?: string; category?: string; status?: string; page?: number } = {}) {
  return api.listBrochureProjects(opts);
}

export async function getBrochureAction(id: string) {
  return api.getBrochureProject(idGuard(id));
}

export async function saveBrochureSectionsAction(id: string, sections: BrochureSection[]) {
  return api.saveBrochureSections(idGuard(id), sections as unknown[]);
}

export async function saveBrochureThemeAction(id: string, theme: BrochureTheme) {
  return api.saveBrochureTheme(idGuard(id), theme);
}

export async function saveBrochureMetaAction(id: string, meta: Record<string, unknown>) {
  return api.saveBrochureMeta(idGuard(id), meta);
}

export async function publishBrochureAction(id: string) {
  return api.publishBrochureProject(idGuard(id));
}

export async function unpublishBrochureAction(id: string) {
  return api.unpublishBrochureProject(idGuard(id));
}

export async function duplicateBrochureAction(id: string) {
  return api.duplicateBrochureProject(idGuard(id));
}

export async function deleteBrochureAction(id: string) {
  return api.deleteBrochureProject(idGuard(id));
}

export async function getBrochureLeadsAction(id: string) {
  return api.getBrochureLeadsAndAnalytics(idGuard(id));
}

export async function generateBrochureAiAction(input: import("@/lib/products/viralpulse-ai/brochure/ai").BrochureBriefInput) {
  const { run } = await import("@/lib/products/viralpulse-ai/run");
  const { generateBrochureContent } = await import("@/lib/products/viralpulse-ai/brochure/ai");
  return run(["GENERATE_AI_CONTENT"], async () => {
    const res = await generateBrochureContent(input);
    return { generated: res };
  }, { revalidate: false });
}

export async function createAiBrochureAction(input: import("@/lib/products/viralpulse-ai/brochure/ai").BrochureBriefInput) {
  const { run } = await import("@/lib/products/viralpulse-ai/run");
  const { generateBrochureContent } = await import("@/lib/products/viralpulse-ai/brochure/ai");
  const { createBrochure } = await import("@/lib/products/viralpulse-ai/brochure/store");
  const { defaultMeta } = await import("@/lib/products/viralpulse-ai/brochure/defaults");
  return run(["MANAGE_POSTS", "GENERATE_AI_CONTENT"], async (v) => {
    const gen = await generateBrochureContent(input);
    const brochure = await createBrochure(
      {
        title: gen.title,
        category: input.category,
        customCategory: input.customCategory,
        sections: gen.sections,
        theme: gen.theme,
        meta: {
          ...defaultMeta(),
          description: gen.meta.description,
          keywords: gen.meta.keywords,
          brandName: gen.meta.brandName,
        },
      },
      v.userId
    );
    return {
      brochure: {
        id: brochure._id,
        title: brochure.title,
        slug: brochure.slug,
      },
    };
  });
}

export async function aiUpdateSectionAction(input: {
  section: import("@/lib/products/viralpulse-ai/brochure/types").BrochureSection;
  prompt: string;
  brochureContext: { title: string; brandName?: string; category: string };
}) {
  const { run } = await import("@/lib/products/viralpulse-ai/run");
  const { aiUpdateSection } = await import("@/lib/products/viralpulse-ai/brochure/ai");
  return run(["GENERATE_AI_CONTENT"], async () => {
    const updated = await aiUpdateSection(input.section, input.prompt, input.brochureContext);
    return { section: updated };
  }, { revalidate: false });
}

export async function aiGenerateSectionAction(input: {
  prompt: string;
  brochureContext: { title: string; brandName?: string; category: string };
  preferredType?: import("@/lib/products/viralpulse-ai/brochure/types").BrochureSectionType;
}) {
  const { run } = await import("@/lib/products/viralpulse-ai/run");
  const { aiGenerateSection } = await import("@/lib/products/viralpulse-ai/brochure/ai");
  return run(["GENERATE_AI_CONTENT"], async () => {
    const section = await aiGenerateSection(input.prompt, input.brochureContext, input.preferredType);
    return { section };
  }, { revalidate: false });
}

export async function aiStyleThemeAction(input: {
  prompt: string;
  currentTheme: import("@/lib/products/viralpulse-ai/brochure/types").BrochureTheme;
}) {
  const { run } = await import("@/lib/products/viralpulse-ai/run");
  const { aiStyleTheme } = await import("@/lib/products/viralpulse-ai/brochure/ai");
  return run(["GENERATE_AI_CONTENT"], async () => {
    const theme = await aiStyleTheme(input.prompt, input.currentTheme);
    return { theme };
  }, { revalidate: false });
}

export async function aiChatAssistantAction(
  input: import("@/lib/products/viralpulse-ai/brochure/ai").AiChatInput
) {
  const { run } = await import("@/lib/products/viralpulse-ai/run");
  const { aiChatAssistant } = await import("@/lib/products/viralpulse-ai/brochure/ai");
  return run(
    ["GENERATE_AI_CONTENT"],
    async () => {
      const result = await aiChatAssistant(input);
      return result;
    },
    { revalidate: false }
  );
}


