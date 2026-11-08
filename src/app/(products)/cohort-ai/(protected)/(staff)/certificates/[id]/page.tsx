import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Ban, ExternalLink } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import CertificateActions from "@/components/products/cohort-ai/CertificateActions";
import CertificateQr from "@/components/products/cohort-ai/CertificateQr";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canIssueCertificates } from "@/lib/tms-roles";
import { certificateWithMeta } from "@/lib/products/cohort-ai/certificates";
import { formatDate, formatDateTime } from "@/lib/utils";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";

export default async function CertificateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cert = await certificateWithMeta(id);
  if (!cert) notFound();

  const user = await getCurrentTmsUser();
  const canManage = user ? canIssueCertificates(user) : false;
  const verifyUrl = `${await companySiteUrl()}/verify/${cert.verificationCode}`;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Certificates", href: "/cohort-ai/certificates" }, { label: cert.certificateNumber }]}
        title={<><span className="inline-flex flex-wrap items-center gap-2">{cert.typeLabel}{cert.revoked ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                 Revoked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                 Valid
              </span>
            )}</span></>}
        description={<><span className="font-mono">{cert.certificateNumber}</span>
            {cert.reissuedFromId ? " · reissued" : ""}</>}
        actions={<>{canManage && <CertificateActions certificateId={cert._id} revoked={cert.revoked} />}</>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Awarded to</dt>
                <dd>
                  <Link href={`/cohort-ai/students/${cert.studentId}`} className="font-medium text-primary hover:underline">{cert.studentName}</Link>
                  {cert.studentCode ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{cert.studentCode}</span> : null}
                </dd>
              </div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Program</dt><dd className="text-right">{cert.programName}</dd></div>
              {cert.batchName && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Batch</dt><dd className="text-right">{cert.batchName}</dd></div>}
              {cert.title && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Detail</dt><dd className="text-right">{cert.title}</dd></div>}
              {cert.grade && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Grade</dt><dd>{cert.grade}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Issued on</dt><dd>{formatDate(cert.issuedOn)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Created</dt><dd>{formatDateTime(cert.createdAt.toISOString())}</dd></div>
              {cert.revoked && cert.revokedReason && (
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Revoked reason</dt><dd className="text-right text-destructive">{cert.revokedReason}</dd></div>
              )}
            </dl>
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Verification</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-xl border border-border/60 bg-white p-2">
              <CertificateQr url={verifyUrl} size={150} />
            </div>
            <p className="text-xs text-muted-foreground">Scan to verify, or visit</p>
            <a href={verifyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-primary hover:underline">
              {verifyUrl.replace(/^https?:\/\//, "")} <ExternalLink className="size-3 shrink-0" />
            </a>
            <p className="font-mono text-xs text-muted-foreground">Code: {cert.verificationCode}</p>
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}
