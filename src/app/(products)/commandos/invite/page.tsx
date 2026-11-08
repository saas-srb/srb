import type { Metadata } from "next";
import Link from "next/link";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { describeInvitation } from "@/lib/platform/invitations";
import AcceptForm from "./AcceptForm";

export const metadata: Metadata = { title: "Join your team", robots: { index: false, follow: false } };

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const invitation = token ? await describeInvitation(token) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <GlassCard>
          {invitation ? (
            <>
              <CardHeader>
                <CardTitle className="text-xl">Join {invitation.companyName}</CardTitle>
                <CardDescription>
                  Set up your account for <strong className="text-foreground">{invitation.email}</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AcceptForm token={token} defaultName={invitation.name} />
              </CardContent>
            </>
          ) : (
            <CardHeader>
              <CardTitle className="text-xl">Invitation not valid</CardTitle>
              <CardDescription>
                This invitation has expired or was already used. Ask your admin to send a new one, or{" "}
                <Link href="/commandos/login" className="font-medium text-primary underline-offset-4 hover:underline">
                  sign in
                </Link>
                .
              </CardDescription>
            </CardHeader>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
