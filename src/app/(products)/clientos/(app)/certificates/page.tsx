import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { Award, ShieldCheck } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getLearnerOverview } from "@/lib/products/clientos/student";
import { PortalPageHeader } from "@/components/products/clientos/widgets";
import EmptyPortalState from "@/components/products/clientos/EmptyPortalState";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Certificates · {brand} {product:portal}");

export default async function CertificatesPage() {
  const user = await guardPortalPage("intern", "trainee");
  const data = await getLearnerOverview(user.studentId);
  if (!data) return <EmptyPortalState title="No certificates yet" body="Certificates are issued on programme completion." />;

  const certs = data.certificates.filter((c) => !c.revoked);
  const progress = data.overview.averageProgress;

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Certificates" subtitle={`${certs.length} issued`} />

      <PanelListFilters>
<GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Certificate progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ProgressBar value={progress} />
          <p className="text-xs text-muted-foreground">
            {certs.length > 0
              ? "Your completion certificate has been issued — see below."
              : `${progress}% towards eligibility. Certificates are issued once your programme is complete.`}
          </p>
        </CardContent>
      </GlassCard>

      {certs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {certs.map((c) => (
            <GlassCard key={c._id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-accent text-white">
                    <Award className="size-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">{c.typeLabel}</p>
                    <p className="text-xs text-muted-foreground">{c.programName}</p>
                  </div>
                </div>
                {c.title && <p className="text-sm text-muted-foreground">{c.title}</p>}
                <dl className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><dt>Certificate no.</dt><dd className="font-medium text-foreground">{c.certificateNumber}</dd></div>
                  <div className="flex justify-between"><dt>Issued on</dt><dd>{c.issuedOn}</dd></div>
                  {c.grade && <div className="flex justify-between"><dt>Grade</dt><dd>{c.grade}</dd></div>}
                </dl>
                <p className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-green-500" /> Verification code: <span className="font-mono text-foreground">{c.verificationCode}</span>
                </p>
              </CardContent>
            </GlassCard>
          ))}
        </div>
      )}
</PanelListFilters>
    </div>
  );
}
