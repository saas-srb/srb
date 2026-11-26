import { listPanels } from "@/lib/platform/panels/store";
import { getDefaultPlan } from "@/lib/platform/billing/plans";
import { productKeyFromSlug } from "@/lib/platform/saas/product-routes";
import { ALL_PRODUCTS_VALUE, PRODUCT_CHOICE, SELLABLE_PRODUCTS } from "@/lib/platform/products/selection";
import "@/app/(platform)/saas/saas.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getSignupMode } from "@/lib/platform/settings";
import { platformRootDomain } from "@/lib/platform/tenancy/provisioning";
import SrRoot from "@/components/platform/saas/SrRoot";
import Link from "next/link";
import Logo from "@/components/platform/saas/Logo";
import SignupForm from "./SignupForm";
import { allProductsTrialPlan, resolveSignupPlan } from "@/lib/platform/billing/signup-plan";
import { trialLabel } from "@/lib/platform/billing/signup-plan-rule";
import { formatMoney } from "@/lib/platform/billing/types";

// Creating a workspace also starts writing its website in the background (AI), which can take a couple of minutes.
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "Create your workspace",
  description: "Create your SRB AI workspace and run sales, HR, finance, projects and your website from one AI-powered platform. Free to start, no card needed.",
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string; interval?: string; product?: string }> }) {
  // Sign-up belongs to the platform's own site, not to a company's workspace.
  if (!(await isPlatformOwnerContext())) notFound();
  const mode = await getSignupMode();
  const sp = await searchParams;
  // A plan picked on the pricing page: checked here, and again on the server when the form is sent.
  const picked = await resolveSignupPlan(sp.plan, sp.interval).catch(() => null);
  const [registry, trial] = await Promise.all([listPanels(), allProductsTrialPlan().catch(() => null)]);
  const free = (await getDefaultPlan().catch(() => null))?.lifetimeFree === true;
  const onSale = (k: string) => registry.find((p) => p.key === k)?.active !== false;
  const nameOf = (k: string) => registry.find((p) => p.key === k)?.name ?? k;
  const products = SELLABLE_PRODUCTS.filter(onSale).map((k) => ({ value: k as string, label: nameOf(k), ...PRODUCT_CHOICE[k] }));
  // A product page links here as /signup?product=<its address>.
  const wantedKey = sp.product === ALL_PRODUCTS_VALUE ? ALL_PRODUCTS_VALUE : productKeyFromSlug(String(sp.product ?? "")) ?? "";
  const initialProduct = wantedKey === ALL_PRODUCTS_VALUE || products.some((p) => p.value === wantedKey) ? wantedKey : "";
  const allNote = free && trial ? `More than one product starts a ${trialLabel(trial.trialDays)} free trial of the ${trial.name} plan (no card needed). After the trial it is ${formatMoney(trial.price, trial.currency)} per month, excl. taxes.` : null;
  const oneNote = free ? "One product starts on the Free plan. Add more any time." : null;
  const selectedPlan = picked ? { id: picked.planId, name: picked.name, interval: picked.interval, trial: trialLabel(picked.trialDays), priceLabel: `${formatMoney(picked.price, picked.currency)} per ${picked.interval === "yearly" ? "year" : "month"}, excl. taxes` } : null;

  return (
    <SrRoot>
      {mode === "closed" ? (
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
          <Logo />
          <p className="text-muted-foreground">New sign-ups are paused right now. Please check back soon.</p>
          <Link href="/" className="font-bold text-primary hover:underline">Back to the home page</Link>
        </main>
      ) : (
        <SignupForm rootDomain={platformRootDomain()} approval={mode === "approval"} selectedPlan={selectedPlan} products={products} initialProduct={initialProduct} allNote={selectedPlan ? null : allNote} oneNote={selectedPlan ? null : oneNote} />
      )}
    </SrRoot>
  );
}
