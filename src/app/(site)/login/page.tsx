import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import CmsPageView from "@/components/products/sitecraft-ai/CmsPageView";
import { cmsPageMetadata } from "@/lib/products/sitecraft-ai/page-route";
import { getPublicPage, type PublicPage } from "@/lib/products/sitecraft-ai/public";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getCompanyBrand } from "@/lib/platform/branding";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const meta = await cmsPageMetadata("/login").catch(() => ({} as Partial<import("next").Metadata>));
  if (meta && "title" in meta && meta.title) return meta as import("next").Metadata;
  return brandedMetadata("Login · {brand}");
}

export const dynamic = "force-dynamic";

/**
 * Shown when the company has not published its own /login page (CMS → Pages). Only the platform operator's wording is
 * about projects, courses and rewards; every other company gets plain sign-in copy it can replace in the CMS.
 */
function defaultLoginPage(name: string, operator: boolean): PublicPage {
  return {
    path: "/login",
    title: "Login",
    themeKey: "default",
    frame: "accent",
    jsonLd: [],
    seo: { title: `Login | ${name}`, description: `Sign in to access your ${name} portal.` },
    sections: [
      {
        id: "login-page-1024",
        type: "login-page",
        orderKey: 1024,
        enabled: true,
        config: {
          badge: operator ? "Client & Student Portal" : "Customer portal",
          headingLead: "Welcome ",
          headingHighlight: "back",
          headingTail: ".",
          description: operator ? `Sign in to access your projects, courses, assignments, certificates, and rewards with ${name}.` : `Sign in to your ${name} account.`,
          features: !operator ? [] : [
            { title: "Your Projects & Learning", body: "Track milestones, view progress, and access materials.", icon: "Layers" },
            { title: "Certificates & Tests", body: "Take online assessments and download verified credentials.", icon: "ShieldCheck" },
            { title: "Wallet & Rewards", body: "Earn credits and redeem rewards across our services.", icon: "Sparkles" },
          ],
          rewardsLead: operator ? "Learn about our rewards program on the " : "",
          rewardsLinkLabel: operator ? "Rewards page" : "",
          formTitle: "Sign in to your account",
          formSubtitle: "Enter your credentials to access [[brand]]",
          emailLabel: "Email address",
          emailPlaceholder: "you@example.com",
          passwordLabel: "Password",
          passwordPlaceholder: "••••••••",
          rememberLabel: "Remember me",
          forgotLabel: "Forgot password?",
          submitLabel: "Sign In",
          submittingLabel: "Signing in...",
          registerLead: "Don't have an account? ",
          registerLinkLabel: "Create one now",
          registerTail: "",
          privacyNote: "Protected by industry-standard encryption.",
        },
      },
    ],
  };
}

export default async function LoginPage() {
  const user = await getCurrentPortalUser();
  if (user) redirect(user.mustChangePassword ? "/clientos/change-password" : "/clientos");
  const brand = await getCompanyBrand();
  const page = (await getPublicPage("/login")) ?? defaultLoginPage(brand.name, await isPlatformOwnerContext());
  return <CmsPageView page={page} />;
}
