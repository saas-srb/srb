import type { SectionTypeDef, FieldSpec } from "@/lib/products/sitecraft-ai/section-registry";
import { str, objArr, record } from "@/lib/products/sitecraft-ai/parse-helpers";
import { resolveIcon } from "@/lib/products/sitecraft-ai/icon-map";
import LoginPageSection from "@/components/sections/forms/LoginPageSection";
import { RegisterHero, RegisterForm } from "@/components/sections/forms/RegisterSections";
import CareerApplySection from "@/components/sections/forms/CareerApplySection";
import { ContactHero, ContactFormSection } from "@/components/sections/forms/ContactSections";

/**
 * Section types for the form pages (/login, /register, /careers/apply,
 * /contact). Their copy is CMS content only; the forms themselves (server
 * actions, lead/application pipelines, validation) stay code. Anything the
 * form needs from the request — the ?ref code, ?position, ?category, the
 * CMS form fields — is passed by the page as runtime props
 * (`SectionRenderer`'s `runtimeProps`), never stored in config.
 */

type Copy = Record<string, string>;

/** Builds a "copy only" section type: every key of `labels` is a text field. */
function copyType<C extends Copy>(
  type: string,
  label: string,
  labels: Record<keyof C, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Renderer: SectionTypeDef<any>["Renderer"],
  long: (keyof C)[] = [],
  extra?: { parse: (r: Record<string, unknown>) => Record<string, unknown>; toProps: (c: Record<string, unknown>) => Record<string, unknown>; fields: FieldSpec[] }
): SectionTypeDef<C & Record<string, unknown>> {
  return {
    type,
    label,
    defaultConfig: Object.fromEntries(Object.keys(labels).map((k) => [k, ""])) as C,
    parse: (raw) => {
      const r = record(raw);
      const out: Record<string, unknown> = {};
      // Not trimmed: pieces around a highlight ("Log in to your ", ".") carry meaningful spaces.
      for (const k of Object.keys(labels)) out[k] = typeof r[k] === "string" ? (r[k] as string).slice(0, 2000) : "";
      return { ...(out as C), ...(extra?.parse(r) ?? {}) };
    },
    Renderer,
    toProps: (c) => ({ ...c, ...(extra?.toProps(c) ?? {}) }),
    fields: [
      ...Object.keys(labels).map((k) => ({ key: k, label: labels[k as keyof C], kind: long.includes(k as keyof C) ? "textarea" : "text" }) as FieldSpec),
      ...(extra?.fields ?? []),
    ],
  };
}

const FEATURE_FIELDS: FieldSpec[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "body", label: "Text", kind: "textarea" },
  { key: "icon", label: "Icon", kind: "icon" },
];

function featuresExtra() {
  return {
    parse: (r: Record<string, unknown>) => {
      const features = objArr(r.features, (x) => {
        const o = record(x);
        const title = str(o.title, 120);
        return title ? { title, body: str(o.body, 400), icon: str(o.icon, 60) || "Sparkles" } : null;
      }, 8);
      return { features };
    },
    toProps: (c: Record<string, unknown>) => ({
      features: (c.features as { title: string; body: string; icon: string }[]).map((f) => ({ ...f, icon: resolveIcon(f.icon) })),
    }),
    fields: [{ key: "features", label: "Feature list", kind: "items", fields: FEATURE_FIELDS } as FieldSpec],
  };
}

// ── /login ───────────────────────────────────────────────────────────────

const loginPage = copyType(
  "login-page",
  "Login Page",
  {
    badge: "Badge",
    headingLead: "Heading (before the highlight — keep the trailing space)",
    headingHighlight: "Heading highlight",
    headingTail: "Heading (after the highlight)",
    description: "Description",
    rewardsLead: "Rewards line (before the link)",
    rewardsLinkLabel: "Rewards link text",
    formTitle: "Form title",
    formSubtitle: "Form subtitle ([[brand]] = brand wordmark)",
    emailLabel: "Email label",
    emailPlaceholder: "Email placeholder",
    passwordLabel: "Password label",
    passwordPlaceholder: "Password placeholder",
    rememberLabel: "\"Remember me\" label",
    forgotLabel: "\"Forgot password\" link",
    submitLabel: "Button",
    submittingLabel: "Button while signing in",
    registerLead: "Sign-up line (before the link)",
    registerLinkLabel: "Sign-up link text",
    registerTail: "Sign-up line (after the link)",
    privacyNote: "Privacy note",
  },
  LoginPageSection,
  ["description"],
  featuresExtra()
);

// ── /register ────────────────────────────────────────────────────────────

const registerHero = copyType(
  "register-hero",
  "Sign-up Page Hero",
  { badge: "Badge", headingLead: "Heading", headingHighlight: "Heading highlight", description: "Description" },
  RegisterHero,
  ["description"]
);

const registerForm = copyType(
  "register-form",
  "Sign-up Form",
  { heading: "Heading", description: "Description", submitLabel: "Button", submittingLabel: "Button while submitting", loginLead: "Login line (before the link)", loginLinkLabel: "Login link text",
    referTitle: "Refer & earn — heading",
    referText: "Refer & earn — text",
    youEarn: "\"You earn\" label",
    friendEarns: "\"Your friend earns\" label",
    stepShareTitle: "Step 1 — title",
    stepShareText: "Step 1 — text",
    stepJoinTitle: "Step 2 — title",
    stepJoinText: "Step 2 — text",
    stepEarnTitle: "Step 3 — title",
    stepEarnText: "Step 3 — text ({event} = the qualifying event)",
    creditsNote: "Credits note (keep the trailing space)",
    earnMoreLabel: "\"Every way to earn\" link text",
    earnMoreHref: "\"Every way to earn\" link URL",
    invitedText: "Invite banner — after the referrer's name",
    welcomeLead: "Invite banner — before the bonus amount",
    welcomeTail: "Invite banner — after the bonus amount",
    codeRejectedText: "Inactive referral link message",
    accountTypeLabel: "Account type — label",
    accountTypePlaceholder: "Account type — placeholder",
    typeStudent: "Account type — student",
    typeIntern: "Account type — intern",
    typeClient: "Account type — client",
    typeJobSeeker: "Account type — job seeker",
    nameLabel: "Name — label",
    namePlaceholder: "Name — placeholder",
    emailLabel: "Email — label",
    emailPlaceholder: "Email — placeholder",
    phoneLabel: "Phone — label",
    phonePlaceholder: "Phone — placeholder",
    passwordLabel: "Password — label",
    passwordPlaceholder: "Password — placeholder",
    confirmLabel: "Confirm password — label",
    confirmPlaceholder: "Confirm password — placeholder",
    referralLabel: "Referral code — label",
    referralOptional: "Referral code — \"optional\" note",
    referralPlaceholder: "Referral code — placeholder",
    termsLead: "Terms line — before the Terms link",
    termsLinkLabel: "Terms link text",
    termsHref: "Terms link URL",
    termsJoin: "Terms line — between the links",
    privacyLinkLabel: "Privacy link text",
    privacyHref: "Privacy link URL",
    termsTail: "Terms line — after the Privacy link",
  },
  RegisterForm,
  ["description"],
  featuresExtra()
);

// ── /careers/apply ───────────────────────────────────────────────────────

const careerApply = copyType(
  "career-apply",
  "Job Application Form",
  {
    badge: "Badge",
    generalHeadingLead: "Heading, general application (before the highlight)",
    generalHeadingHighlight: "Heading highlight",
    generalHeadingTail: "Heading (after the highlight)",
    roleHeadingLead: "Heading when a role is chosen (before the role name)",
    description: "Description",
    successTitle: "Success title",
    successDescription: "Success message",
    submitLabel: "Button",
    submittingLabel: "Button while sending",
    positionLabel: "Position — label",
    generalOption: "Position — general application option",
    nameLabel: "Name — label",
    namePlaceholder: "Name — placeholder",
    emailLabel: "Email — label",
    emailPlaceholder: "Email — placeholder",
    phoneLabel: "Phone — label",
    phonePlaceholder: "Phone — placeholder",
    resumeLabel: "Resume — label",
    coverNoteLabel: "Cover note — label",
    coverNotePlaceholder: "Cover note — placeholder",
    consentLead: "Consent line (before the link — keep the trailing space)",
    consentLinkLabel: "Consent link text",
    consentHref: "Consent link URL",
    consentTail: "Consent line (after the link)",
  },
  CareerApplySection,
  ["description", "successDescription"]
);

// ── /contact ─────────────────────────────────────────────────────────────

const contactHero = copyType(
  "contact-hero",
  "Contact Page Hero",
  {
    badge: "Badge",
    headingLead: "Heading (before the highlight)",
    headingHighlight: "Heading highlight",
    headingTail: "Heading (after the highlight)",
    description: "Description",
    backgroundImage: "Background image URL",
    cardImage: "Card image URL",
    badgeOneTitle: "Floating badge 1 — title",
    badgeOneSubtitle: "Floating badge 1 — subtitle",
    badgeTwoTitle: "Floating badge 2 — title",
    badgeTwoSubtitle: "Floating badge 2 — subtitle",
  },
  ContactHero,
  ["description"]
);

const contactForm = copyType(
  "contact-form",
  "Contact Form & Details",
  {
    heading: "Heading",
    intro: "Intro",
    emailTitle: "Email card — title",
    emailText: "Email card — text",
    callTitle: "Phone card — title",
    callText: "Phone card — text",
    whatsappTitle: "WhatsApp card — title",
    whatsappText: "WhatsApp card — text",
    visitTitle: "Address card — title",
    successDescription: "Success message",
    submitLabel: "Button",
    submittingLabel: "Button while sending",
    interestLabel: "Service category — label",
    subServiceLabel: "Specific service — label",
    resumeLabel: "Resume — label (resume-accepting services)",
    consentLead: "Consent line (before the link — keep the trailing space)",
    consentLinkLabel: "Consent link text",
    consentHref: "Consent link URL",
    consentTail: "Consent line (after the link)",
  },
  ContactFormSection,
  ["intro", "successDescription"]
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous config types, same as SECTION_REGISTRY
export const FORM_SECTION_TYPES: SectionTypeDef<any>[] = [loginPage, registerHero, registerForm, careerApply, contactHero, contactForm];

