import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { PORTAL_ROLE_META } from "@/lib/portal-roles";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import ProfileForm from "@/components/products/clientos/ProfileForm";
import { portalLogoutAction } from "@/app/(products)/clientos/(app)/actions";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Profile · {brand} {product:portal}");

export default async function ProfilePage() {
  const user = await guardPortalPage();
  const meta = PORTAL_ROLE_META[user.role];

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Profile & Settings" subtitle={meta.portalName} />

      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Email" value={user.email} />
          <Field label="Role" value={meta.label} />
          <Field label="Member since" value={new Date(user.createdAt).toLocaleDateString()} />
          <Field label="Last sign-in" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"} />
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm displayName={user.displayName} phone={user.phone} />
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Security</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" render={<Link href="/clientos/change-password" />}>
            <KeyRound className="size-4" /> Change password
          </Button>
          <form action={portalLogoutAction}>
            <Button type="submit" variant="ghost" className="text-destructive hover:text-destructive">
              <LogOut className="size-4" /> Sign out
            </Button>
          </form>
        </CardContent>
      </GlassCard>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
