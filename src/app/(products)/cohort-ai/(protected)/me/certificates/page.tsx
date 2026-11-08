import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { BadgeCheck, Download, ExternalLink, Ban } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { listCertificatesForStudent } from "@/lib/products/cohort-ai/certificates";
import { formatDate } from "@/lib/utils";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";

export default async function MyCertificatesPage() {
  const user = await getCurrentTmsUser();
  if (!user?.studentId) redirect("/cohort-ai");
  const [certs, siteUrl] = await Promise.all([listCertificatesForStudent(user.studentId), companySiteUrl()]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai/me" }, { label: "Certificates" }]}
        title={<>My Certificates</>}
      />

      <PanelListFilters>
{certs.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No certificates issued to you yet. They appear here once your program is complete.
          </CardContent>
        </GlassCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {certs.map((c) => (
            <GlassCard key={c._id} interactive={false}>
              <CardContent className="space-y-2 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 font-medium">
                      {c.revoked ? <Ban className="size-4 text-destructive" /> : <BadgeCheck className="size-4 text-green-600 dark:text-green-400" />}
                      {c.typeLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.programName}{c.batchName ? ` · ${c.batchName}` : ""}</p>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">{c.certificateNumber}</span>
                </div>
                {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                <p className="text-xs text-muted-foreground">Issued {formatDate(c.issuedOn)}{c.grade ? ` · Grade ${c.grade}` : ""}</p>
                {c.revoked ? (
                  <p className="text-xs text-destructive">Revoked{c.revokedReason ? `: ${c.revokedReason}` : ""}</p>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a href={`/api/cohort-ai/certificates/${c._id}/pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Download className="size-3.5" data-icon="inline-start" />
                      PDF
                    </a>
                    <a
                      href={`${siteUrl}/verify/${c.verificationCode}`}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <ExternalLink className="size-3.5" data-icon="inline-start" />
                      Verify link
                    </a>
                  </div>
                )}
              </CardContent>
            </GlassCard>
          ))}
        </div>
      )}
</PanelListFilters>
    </div>
  );
}
