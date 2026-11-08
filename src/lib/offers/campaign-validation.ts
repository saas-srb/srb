import {
  isValidAudience,
  isValidCampaignStatus,
  isValidCampaignType,
  isValidThemePreset,
  DEFAULT_THEME_PRESET,
  type Audience,
  type CampaignStatus,
  type CampaignType,
  type CampaignThemePreset,
} from "@/lib/offers/constants";
import { validateDisplayInput, DEFAULT_DISPLAY_CONFIG, type DisplayConfigInput } from "@/lib/offers/display-validation";

export interface CampaignFaqInput {
  question: string;
  answer: string;
  audience?: Audience;
}

export interface CampaignWriteInput {
  name: string;
  slug: string;
  campaignType: CampaignType;
  themePreset: CampaignThemePreset;
  theme: {
    primaryColor?: string;
    accentColor?: string;
    bannerHeadline?: string;
    bannerSubheadline?: string;
  };
  bannerImage?: string;
  startDate: string; // ISO
  endDate: string; // ISO
  status: CampaignStatus;
  priority: number;
  targetAudience: Audience[];
  isFeatured: boolean;
  faqs: CampaignFaqInput[];
  display: DisplayConfigInput;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateCampaignInput(
  input: Partial<CampaignWriteInput>
): { valid: true; data: CampaignWriteInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) errors.name = "Name is required.";
  else if (name.length > 160) errors.name = "Name must be 160 characters or fewer.";

  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  if (!slug) errors.slug = "Slug is required.";
  else if (!SLUG_RE.test(slug)) errors.slug = "Slug must be lowercase letters, numbers and hyphens only.";

  if (!isValidCampaignType(input.campaignType)) errors.campaignType = "Choose a valid campaign type.";
  if (!isValidCampaignStatus(input.status)) errors.status = "Choose a valid status.";
  const themePreset = isValidThemePreset(input.themePreset) ? input.themePreset : DEFAULT_THEME_PRESET;

  const startDate = typeof input.startDate === "string" ? input.startDate : "";
  const endDate = typeof input.endDate === "string" ? input.endDate : "";
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!start || Number.isNaN(start.getTime())) errors.startDate = "Enter a valid start date.";
  if (!end || Number.isNaN(end.getTime())) errors.endDate = "Enter a valid end date.";
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start >= end) {
    errors.endDate = "End date must be after the start date.";
  }

  const priority = typeof input.priority === "number" ? input.priority : Number(input.priority);
  if (!Number.isFinite(priority) || priority < 0 || priority > 1000) {
    errors.priority = "Priority must be a number between 0 and 1000.";
  }

  const targetAudience = Array.isArray(input.targetAudience) ? input.targetAudience.filter(isValidAudience) : [];
  if (targetAudience.length === 0) errors.targetAudience = "Choose at least one target audience.";

  const faqs: CampaignFaqInput[] = Array.isArray(input.faqs)
    ? input.faqs
        .filter((f): f is CampaignFaqInput => !!f && typeof f.question === "string" && typeof f.answer === "string")
        .map((f) => ({ question: f.question.trim(), answer: f.answer.trim(), audience: isValidAudience(f.audience) ? f.audience : undefined }))
        .filter((f) => f.question && f.answer)
    : [];

  const displayValidation = validateDisplayInput(input.display ?? DEFAULT_DISPLAY_CONFIG);
  if (!displayValidation.valid) {
    Object.assign(errors, displayValidation.errors);
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      name,
      slug,
      campaignType: input.campaignType as CampaignType,
      themePreset,
      theme: {
        primaryColor: input.theme?.primaryColor?.trim() || undefined,
        accentColor: input.theme?.accentColor?.trim() || undefined,
        bannerHeadline: input.theme?.bannerHeadline?.trim() || undefined,
        bannerSubheadline: input.theme?.bannerSubheadline?.trim() || undefined,
      },
      bannerImage: input.bannerImage?.trim() || undefined,
      startDate,
      endDate,
      status: input.status as CampaignStatus,
      priority,
      targetAudience,
      isFeatured: Boolean(input.isFeatured),
      faqs,
      display: (displayValidation as { valid: true; data: DisplayConfigInput }).data ?? DEFAULT_DISPLAY_CONFIG,
    },
  };
}
