import type { Metadata } from "next";
import { headers } from "next/headers";
import { REFUSAL_COPY, resolveSignerToken } from "@/lib/products/contractflow-ai/public-access";

export const metadata: Metadata = { title: "Signature request", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-12 text-center">
      {children}
    </main>
  );
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
  return (
    <Shell>
      <h1 className="text-xl font-semibold">{access.request.title}</h1>
      <p className="text-sm">This request is for {access.signer.name}.</p>
      <p className="text-sm text-muted-foreground">Your link is valid until {access.request.expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.</p>
      <p className="rounded-md border p-3 text-sm text-muted-foreground">The signing screen is not switched on yet. Nothing has been signed. Please try this link again later, or contact the sender.</p>
    </Shell>
  );
}
