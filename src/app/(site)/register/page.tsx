import CmsPageView from "@/components/products/sitecraft-ai/CmsPageView";
import { cmsPageMetadata } from "@/lib/products/sitecraft-ai/page-route";
import { getPublicPage, type PublicPage } from "@/lib/products/sitecraft-ai/public";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getCompanyBrand } from "@/lib/platform/branding";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { resolveReferralCode } from "@/lib/wallet/referral-capture";
import { getReferralPreview } from "@/lib/wallet/referrals";
import { listRewardRules } from "@/lib/wallet/reward-rules";
import { REFERRAL_QUALIFYING_EVENT_LABELS } from "@/lib/wallet/constants";
import { resolveCampaign, DEFAULT_CAMPAIGN_SETTINGS } from "@/lib/wallet/campaigns";

export async function generateMetadata(): Promise<Metadata> {
  const meta = await cmsPageMetadata("/register").catch(() => ({} as Partial<import("next").Metadata>));
  if (meta && "title" in meta && meta.title) return meta as import("next").Metadata;
  return brandedMetadata("Create Account · {brand}");
}

export const dynamic = "force-dynamic";

/** The company's own /register page (CMS → Pages) wins. The wording about courses, interns and job seekers is the platform operator's only. */
function buildDefaultRegisterPage(name: string, operator: boolean): PublicPage {
  return {
    path: "/register",
    title: "Create Account",
    themeKey: "default",
    frame: "accent",
    jsonLd: [],
    seo: { title: `Create Account | ${name}`, description: `Create an account to get started with ${name}.` },
    sections: [
      {
        id: "register-hero-1024",
        type: "register-hero",
        orderKey: 1024,
        enabled: true,
        config: {
          badge: "Create an Account",
          headingLead: "Start your journey with",
          headingHighlight: name,
          description: operator ? `Join ${name} to access projects, courses, online tests, and career opportunities.` : `Create your ${name} account.`,
        },
      },
      {
        id: "register-form-2048",
        type: "register-form",
        orderKey: 2048,
        enabled: true,
        config: {
          heading: "Create your account",
          description: "Fill in your details below to get started.",
          submitLabel: "Create Account",
          submittingLabel: "Creating account...",
          loginLead: "Already have an account? ",
          loginLinkLabel: "Sign in here",
          referTitle: "Refer & Earn",
          referText: "Invite friends and earn reward credits when they join and complete milestones.",
          youEarn: "You earn",
          friendEarns: "Friend earns",
          stepShareTitle: "Share your link",
          stepShareText: "Send your unique referral code to friends and colleagues.",
          stepJoinTitle: "They join",
          stepJoinText: "They sign up with your code and get a welcome bonus.",
          stepEarnTitle: "You both earn",
          stepEarnText: "Get reward credits directly to your wallet.",
          creditsNote: "Credits can be redeemed for discounts and rewards.",
          earnMoreLabel: operator ? "Learn more about rewards" : "",
          earnMoreHref: operator ? "/rewards" : "",
          invitedText: "has invited you to join!",
          welcomeLead: "You'll receive a welcome bonus of",
          welcomeTail: "credits upon registration.",
          codeRejectedText: "This referral code is invalid or expired.",
          accountTypeLabel: "I am a",
          accountTypePlaceholder: "Select account type",
          typeStudent: operator ? "Student" : "",
          typeIntern: operator ? "Intern" : "",
          typeClient: "Client",
          typeJobSeeker: operator ? "Job Seeker" : "",
          nameLabel: "Full Name",
          namePlaceholder: "John Doe",
          emailLabel: "Email Address",
          emailPlaceholder: "john@example.com",
          phoneLabel: "Phone Number",
          phonePlaceholder: "+1 (555) 000-0000",
          passwordLabel: "Password",
          passwordPlaceholder: "••••••••",
          confirmLabel: "Confirm Password",
          confirmPlaceholder: "••••••••",
          referralLabel: "Referral Code (Optional)",
          referralOptional: "Optional",
          referralPlaceholder: "Enter referral code",
          termsLead: "By signing up, you agree to our ",
          termsLinkLabel: "Terms of Service",
          termsHref: "/privacy-policy",
          termsJoin: " and ",
          privacyLinkLabel: "Privacy Policy",
          privacyHref: "/privacy-policy",
          termsTail: ".",
        },
      },
    ],
  };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  if (await getCurrentPortalUser()) redirect("/clientos");
  const { ref } = await searchParams;
  const code = await resolveReferralCode(ref);
  const preview = code ? await getReferralPreview(code) : null;

  // Refer & earn amounts as currently configured (any account type without its own rule falls back to "ALL").
  const rules = (await listRewardRules().catch(() => [])).filter((r) => r.isActive && r.amount > 0 && r.appliesToRole === "ALL" && !r.subKey);
  const amount = (t: string) => rules.find((r) => r.type === t)?.amount ?? 0;
  const resolution = await resolveCampaign("client");
  // The refer-and-earn explainer shows only when the company really pays out something (both amounts zero = nothing to explain).
  const referral =
    resolution.state === "inactive" || (amount("referral_referrer") <= 0 && amount("referral_referee") <= 0)
      ? null
      : {
          referrer: amount("referral_referrer"),
          referee: amount("referral_referee"),
          event: REFERRAL_QUALIFYING_EVENT_LABELS[resolution.state === "active" ? resolution.campaign.qualifyingEvent : DEFAULT_CAMPAIGN_SETTINGS.qualifyingEvent],
        };

  const brand = await getCompanyBrand();
  const page = (await getPublicPage("/register")) ?? buildDefaultRegisterPage(brand.name, await isPlatformOwnerContext());

  return (
    <CmsPageView
      page={page}
      runtimeProps={{
        "register-form": {
          initialCode: code ?? "",
          referrerName: preview?.valid ? preview.referrerFirstName ?? null : null,
          welcomeBonus: preview?.valid ? preview.welcomeBonus : 0,
          codeRejected: Boolean(code && preview && !preview.valid),
          referral,
        },
      }}
    />
  );
}
