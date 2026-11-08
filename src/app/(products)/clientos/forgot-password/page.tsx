import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import PortalAuthShell from "@/components/products/clientos/PortalAuthShell";
import ForgotForm from "./ForgotForm";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const generateMetadata = () => brandedMetadata("Reset password · {brand} {product:portal}", { robots: { index: false } });

export default async function PortalForgotPage() {
  if (await getCurrentPortalUser()) redirect("/clientos");
  return (
    <PortalAuthShell
      headline={<>Locked out?</>}
      sub="Verify the email and phone we have on record and set a new password right away."
    >
      <ForgotForm />
    </PortalAuthShell>
  );
}
