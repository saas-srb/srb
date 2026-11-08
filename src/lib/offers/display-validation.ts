import {
  isValidCtaActionType,
  isValidPopupTemplate,
  isValidPopupTriggerType,
  isValidPopupFrequency,
  isValidPageTargetingMode,
  DEFAULT_POPUP_FREQUENCY,
  type CtaActionType,
  type PopupTemplate,
  type PopupTriggerType,
  type PopupFrequency,
  type PageTargetingMode,
} from "@/lib/offers/constants";

export interface StripConfigInput {
  enabled: boolean;
  message: string;
  discountText: string;
  ctaText: string;
  ctaActionType: CtaActionType;
  ctaActionValue: string;
  showCountdown: boolean;
  allowClose: boolean;
}

export interface PopupConfigInput {
  enabled: boolean;
  template: PopupTemplate;
  ctaText: string;
  ctaActionType: CtaActionType;
  ctaActionValue: string;
  showCountdown: boolean;
  triggerType: PopupTriggerType;
  triggerValue: number; // seconds for delay, % for scroll, ignored otherwise
  frequency: PopupFrequency;
}

export interface DisplayConfigInput {
  strip: StripConfigInput;
  popup: PopupConfigInput;
  pageTargeting: { mode: PageTargetingMode; pages: string[] };
}

/** Fallback for documents written before the display/promotions feature existed — both surfaces default to off. */
export const DEFAULT_DISPLAY_CONFIG: DisplayConfigInput = {
  strip: { enabled: false, message: "", discountText: "", ctaText: "Claim Offer", ctaActionType: "url", ctaActionValue: "/offers", showCountdown: true, allowClose: true },
  popup: { enabled: false, template: "festival", ctaText: "Claim Offer", ctaActionType: "url", ctaActionValue: "/offers", showCountdown: true, triggerType: "delay", triggerValue: 10, frequency: DEFAULT_POPUP_FREQUENCY },
  pageTargeting: { mode: "all", pages: [] },
};

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function validateDisplayInput(
  input: Partial<DisplayConfigInput> | undefined
): { valid: true; data: DisplayConfigInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const stripCtaType = isValidCtaActionType(input?.strip?.ctaActionType) ? input!.strip!.ctaActionType : "url";
  const strip: StripConfigInput = {
    enabled: Boolean(input?.strip?.enabled),
    message: str(input?.strip?.message, 200),
    discountText: str(input?.strip?.discountText, 60),
    ctaText: str(input?.strip?.ctaText, 40) || "Claim Offer",
    ctaActionType: stripCtaType,
    ctaActionValue: str(input?.strip?.ctaActionValue, 300) || "/offers",
    showCountdown: Boolean(input?.strip?.showCountdown),
    allowClose: input?.strip?.allowClose !== false,
  };
  if (strip.enabled && !strip.message && !strip.discountText) {
    errors.stripMessage = "Enter a message or discount text for the strip.";
  }

  const popupTemplate = isValidPopupTemplate(input?.popup?.template) ? input!.popup!.template : "festival";
  const popupCtaType = isValidCtaActionType(input?.popup?.ctaActionType) ? input!.popup!.ctaActionType : "url";
  const triggerType = isValidPopupTriggerType(input?.popup?.triggerType) ? input!.popup!.triggerType : "delay";
  const frequency = isValidPopupFrequency(input?.popup?.frequency) ? input!.popup!.frequency : DEFAULT_POPUP_FREQUENCY;

  let triggerValue = typeof input?.popup?.triggerValue === "number" ? input.popup.triggerValue : Number(input?.popup?.triggerValue ?? 0);
  if (!Number.isFinite(triggerValue) || triggerValue < 0) triggerValue = 0;
  if (triggerType === "delay") triggerValue = Math.min(Math.round(triggerValue), 300);
  if (triggerType === "scroll") triggerValue = Math.min(Math.max(Math.round(triggerValue), 1), 100);

  const popup: PopupConfigInput = {
    enabled: Boolean(input?.popup?.enabled),
    template: popupTemplate,
    ctaText: str(input?.popup?.ctaText, 40) || "Claim Offer",
    ctaActionType: popupCtaType,
    ctaActionValue: str(input?.popup?.ctaActionValue, 300) || "/offers",
    showCountdown: Boolean(input?.popup?.showCountdown),
    triggerType,
    triggerValue,
    frequency,
  };

  const pageTargetingMode = isValidPageTargetingMode(input?.pageTargeting?.mode) ? input!.pageTargeting!.mode : "all";
  const pages = Array.isArray(input?.pageTargeting?.pages) ? input!.pageTargeting!.pages.filter((p): p is string => typeof p === "string") : [];
  if (pageTargetingMode === "selected" && pages.length === 0) {
    errors.pageTargeting = "Select at least one page, or switch to \"All public pages\".";
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: { strip, popup, pageTargeting: { mode: pageTargetingMode, pages } },
  };
}
