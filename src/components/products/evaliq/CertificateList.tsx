import Link from "next/link";
import { Award, Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import { Chip, EmptyState } from "@/components/products/evaliq/OtsUi";
import { certificateState, type OtsCertificate } from "@/lib/products/evaliq/certificates";
import { fmtPct } from "@/lib/products/evaliq/constants";
import { formatDate } from "@/lib/utils";

/** A candidate's own certificates (OTS "Certificates" and Portal) — view, download, verify. */
export default function CertificateList({ certs }: { certs: OtsCertificate[] }) {
  if (certs.length === 0)
    return (
      <GlassCard interactive={false}>
        <CardContent>
          <EmptyState icon={<Award className="size-5" />} title="No certificates yet">Pass a certification test to earn a verifiable certificate.</EmptyState>
        </CardContent>
      </GlassCard>
    );
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {certs.map((c) => {
        const st = certificateState(c);
        return (
          <GlassCard key={c._id} interactive={false}>
            <CardContent className="space-y-2 py-4">
              <div className="flex items-start gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-accent text-white">
                  <Award className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{c.testName}</p>
                </div>
                <Chip tone={st === "valid" ? "green" : st === "expired" ? "amber" : "rose"}>{st === "valid" ? "Valid" : st === "expired" ? "Expired" : "Revoked"}</Chip>
              </div>
              <dl className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><dt>Certificate ID</dt><dd className="font-mono text-foreground">{c.certificateNumber}</dd></div>
                <div className="flex justify-between"><dt>Score</dt><dd>{`${c.score}/${c.totalMarks} (${fmtPct(c.percentage)})`}</dd></div>
                <div className="flex justify-between"><dt>Issued</dt><dd>{formatDate(c.issuedOn)}</dd></div>
                <div className="flex justify-between"><dt>Valid until</dt><dd>{c.validUntil ? formatDate(c.validUntil) : "No expiry"}</dd></div>
                <div className="flex justify-between"><dt>Organization</dt><dd>{c.organization}</dd></div>
              </dl>
              {st === "revoked" && c.revokedReason && <p className="text-xs text-rose-600">{`Revoked: ${c.revokedReason}`}</p>}
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-green-500" /> Verification code: <span className="font-mono text-foreground">{c.verificationCode}</span>
              </p>
              {st !== "revoked" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" nativeButton={false} render={<a href={`/api/evaliq/certificates/${c._id}/pdf`} />}>
                    <Download className="size-3.5" /> Download PDF
                  </Button>
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/verify/${c.verificationCode}`} target="_blank" />}>
                    Verify
                  </Button>
                </div>
              )}
            </CardContent>
          </GlassCard>
        );
      })}
    </div>
  );
}
