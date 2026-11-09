import type { Metadata } from "next";
import { headers } from "next/headers";
import SignFlow from "@/components/products/contractflow-ai/SignFlow";
import { REFUSAL_COPY, resolveSignerToken } from "@/lib/products/contractflow-ai/public-access";
import { getSigningView } from "@/lib/products/contractflow-ai/sign-flow";

export const metadata: Metadata = { title: "Signature request", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-8 sm:px-6">{children}</main>;
}

/** Public signing link. The company comes from the request the token belongs to, never from the address in the browser. */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await resolveSignerToken(token, await headers(), { recordView: true });
  if (!access.ok) {
    const copy = REFUSAL_COPY[access.reason];
    return (
      <Shell>
        <h1 className="text-xl font-semibold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
      </Shell>
    );
  }
  const view = await getSigningView(access);
  return (
    <Shell>
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{view.title}</h1>
        <p className="text-sm text-muted-foreground">For {view.signerName}. This link works until {new Date(view.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.</p>
      </header>
      <SignFlow token={token} view={view} />
    </Shell>
  );
}
