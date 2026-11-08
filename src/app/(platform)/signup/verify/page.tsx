import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { describePendingSignup } from "@/lib/platform/signup";
import { companyAppBaseUrl, companyBaseUrl } from "@/lib/platform/tenancy/provisioning";
import ConfirmForm from "./ConfirmForm";

export const metadata: Metadata = { title: "Confirm your workspace", robots: { index: false, follow: false } };

/**
 * Landing page of the verification email. Deliberately does NOT create
 * anything on load — mail scanners pre-fetch links — the button does.
 */
export default async function VerifySignupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (!(await isPlatformOwnerContext())) notFound();
  const token = (await searchParams).token ?? "";
  const pending = token ? await describePendingSignup(token) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <GlassCard>
          {pending ? (
            <>
              <CardHeader>
                <CardTitle className="text-xl">Create {pending.companyName}</CardTitle>
                <CardDescription>
                  Email confirmed for <strong className="text-foreground">{pending.email}</strong>. Your website will be at{" "}
                  <strong className="text-foreground">{companyBaseUrl(pending.slug).replace(/^https?:\/\//, "")}</strong> and your products at{" "}
                  <strong className="text-foreground">{companyAppBaseUrl(pending.slug).replace(/^https?:\/\//, "")}</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConfirmForm token={token} />
              </CardContent>
            </>
          ) : (
            <CardHeader>
              <CardTitle className="text-xl">This link has expired</CardTitle>
              <CardDescription>
                Confirmation links work once, for 24 hours. <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">Start again</Link> to get a new one.
              </CardDescription>
            </CardHeader>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
