import { notFound } from "next/navigation";
import { getPaymentLinkByToken, serializePaymentLink } from "@/lib/products/cashflow-ai/payments/links";
import { receiptForLinkToken } from "@/lib/products/cashflow-ai/payments/public-receipt";
import PublicCheckoutClient from "./PublicCheckoutClient";
import { getCompanyBrand } from "@/lib/platform/branding";

export default async function PublicPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const brand = await getCompanyBrand();
  const { token } = await params;
  const link = await getPaymentLinkByToken(token);

  if (!link) {
    return notFound();
  }

  const serializedLink = serializePaymentLink(link);
  const receipt = link.status === "PAID" ? await receiptForLinkToken(token) : null;

  return (
    <div className="relative min-h-screen bg-canvas text-foreground flex flex-col justify-center items-center p-4 overflow-hidden">
      {/* Platform Ambient Background */}
      <div className="lms-ambient pointer-events-none absolute inset-0 overflow-hidden">
        <div className="lms-ambient-mid" />
        <div className="absolute inset-0 bg-grid-slate-900/[0.015] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
      </div>

      <main className="w-full max-w-md relative z-10">
        <PublicCheckoutClient link={serializedLink} receipt={receipt} />
      </main>

      <footer className="mt-8 text-center text-xs text-muted-foreground relative z-10 space-y-1">
        <p>Protected by {brand.name} secure payments</p>
        <p>© {new Date().getFullYear()} {brand.name}. All rights reserved.</p>
      </footer>
    </div>
  );
}
