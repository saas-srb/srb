import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import PortalAuthShell from "@/components/products/clientos/PortalAuthShell";
import RegisterForm from "./RegisterForm";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const generateMetadata = () => brandedMetadata("Create account · {brand} {product:portal}", { robots: { index: false } });

export default async function PortalRegisterPage() {
  if (await getCurrentPortalUser()) redirect("/clientos");
  return (
    <PortalAuthShell
      headline={
        <>
          One account,{" "}
          <span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">built for you.</span>
        </>
      }
      sub="Register once with the email and phone we have on file. We'll recognise whether you're an applicant, an intern, a trainee or a client and load the right portal."
    >
      <RegisterForm />
    </PortalAuthShell>
  );
}
