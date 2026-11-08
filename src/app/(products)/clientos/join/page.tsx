import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import PortalAuthShell from "@/components/products/clientos/PortalAuthShell";
import { resolveReferralCode } from "@/lib/wallet/referral-capture";
import { getReferralPreview } from "@/lib/wallet/referrals";
import JoinForm from "./JoinForm";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import { getCompanyBrand } from "@/lib/platform/branding";

export const generateMetadata = () => brandedMetadata("Join · {brand} {product:portal}", { robots: { index: false } });
export const dynamic = "force-dynamic";

export default async function PortalJoinPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const brand = await getCompanyBrand();
  if (await getCurrentPortalUser()) redirect("/clientos");
  const { ref } = await searchParams;
  const code = await resolveReferralCode(ref);
  const preview = code ? await getReferralPreview(code) : null;

  return (
    <PortalAuthShell
      headline={
        <>
          Create your free account,{" "}
          <span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">earn credits.</span>
        </>
      }
      sub={`Join in under a minute. Get signup credits, share your own referral link and use your credits on ${brand.name} offers.`}
    >
      <JoinForm
        initialCode={code ?? ""}
        referrerName={preview?.valid ? preview.referrerFirstName ?? null : null}
        welcomeBonus={preview?.valid ? preview.welcomeBonus : 0}
        codeRejected={Boolean(code && preview && !preview.valid)}
      />
    </PortalAuthShell>
  );
}
