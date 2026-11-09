import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { getCertificateByCode, type CertificateView } from "@/lib/products/cohort-ai/certificates";
import { getDb } from "@/lib/mongodb";
import { getTmsSettings } from "@/lib/products/cohort-ai/settings";
import { CERTIFICATE_TYPES } from "@/lib/products/cohort-ai/constants";
import { certificateState, getCertificateByCode as getOtsCertificateByCode, type OtsCertificate } from "@/lib/products/evaliq/certificates";
import { BrandName } from "@/components/platform/BrandProvider";
import { getPublicSeal, type PublicSeal } from "@/lib/products/contractflow-ai/seal-public";
import VerifyFile from "@/components/products/contractflow-ai/VerifyFile";
import { companySiteHost } from "@/lib/platform/tenancy/site-url";

export const metadata: Metadata = {
  title: "Certificate Verification",
  robots: { index: false, follow: false },
};

async function loadView(code: string): Promise<CertificateView | null> {
  const cert = await getCertificateByCode(code);
  if (!cert) return null;
  const db = await getDb();
  const [student, program, batch] = await Promise.all([
    db.collection<{ _id: string; fullName: string; studentCode: string }>("training_students").findOne({ _id: cert.studentId }),
    db.collection<{ _id: string; name: string }>("training_programs").findOne({ _id: cert.programId }),
    cert.batchId ? db.collection<{ _id: string; name: string }>("training_batches").findOne({ _id: cert.batchId }) : Promise.resolve(null),
  ]);
  return {
    ...cert,
    studentName: student?.fullName ?? "Unknown",
    studentCode: student?.studentCode ?? null,
    programName: program?.name ?? "Unknown program",
    batchName: batch?.name ?? null,
    typeLabel: CERTIFICATE_TYPES.find((t) => t.value === cert.type)?.label ?? "Certificate",
  };
}

function SealedVerification({ seal }: { seal: PublicSeal }) {
  const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) + " IST" : "");
  return (
    <div className="lms-shell flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-bold">
        <BrandMark className="size-7 shrink-0" />
        <BrandName /> <span className="text-foreground">Signed documents</span>
      </div>
      <div className="w-full max-w-lg space-y-4 rounded-3xl border border-border/40 bg-background/95 p-6 shadow-none backdrop-blur-md dark:bg-card/85">
        <div className="flex flex-col items-center gap-2 border-b border-border/60 pb-4 text-center">
          <CheckCircle2 className="size-12 text-green-600 dark:text-green-400" />
          <h1 className="text-xl font-bold text-foreground">This signed document is on record</h1>
          <p className="text-sm text-muted-foreground">{seal.title}</p>
        </div>
        <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Issued by</dt><dd className="col-span-2">{seal.companyName}</dd>
          <dt className="text-muted-foreground">Sealed on</dt><dd className="col-span-2">{at(seal.sealedAt)}</dd>
          {seal.pages ? <><dt className="text-muted-foreground">Pages</dt><dd className="col-span-2">{seal.pages}</dd></> : null}
          <dt className="text-muted-foreground">SHA-256</dt><dd className="col-span-2 break-all font-mono text-xs">{seal.sha256}</dd>
        </dl>
        <div>
          <h2 className="mb-1 text-sm font-semibold">Signed by</h2>
          <ul className="space-y-1 text-sm">{seal.signers.map((s, i) => <li key={i}>{s.name}{s.designation ? `, ${s.designation}` : ""} <span className="text-muted-foreground">· {s.role.replace(/_/g, " ")}{s.signedAt ? ` · ${at(s.signedAt)}` : ""}</span></li>)}</ul>
        </div>
        <VerifyFile sha256={seal.sha256} />
        <p className="text-xs text-muted-foreground">These are simple electronic signatures confirmed by a one-time code. They are not Aadhaar eSign or digital signature certificates.</p>
      </div>
    </div>
  );
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

/** Online Test System certificates share this one public verification URL (codes are random, so they never collide). */
function OtsVerification({ cert, siteHost }: { cert: OtsCertificate; siteHost: string }) {
  const state = certificateState(cert);
  const valid = state === "valid";
  const rows: [string, string][] = [
    ["Certificate ID", cert.certificateNumber],
    ["Awarded to", cert.candidateName],
    ["Test", cert.testName],
    ["Score", `${cert.score}/${cert.totalMarks} (${cert.percentage}%)`],
    ["Issued on", fmtDate(cert.issuedOn)],
    ["Valid until", cert.validUntil ? fmtDate(cert.validUntil) : "No expiry"],
    ["Organization", cert.organization],
  ];
  return (
    <div className="lms-shell flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-bold">
        <BrandMark className="size-7 shrink-0" />
        <BrandName /> <span className="text-foreground">Assessments</span>
      </div>
      <div className="w-full max-w-md rounded-3xl border border-border/40 bg-background/95 p-6 shadow-none backdrop-blur-md dark:bg-card/85">
        <div className="flex flex-col items-center gap-2 border-b border-border/60 pb-4 text-center">
          {valid ? <CheckCircle2 className="size-12 text-green-600 dark:text-green-400" /> : <XCircle className="size-12 text-destructive" />}
          <h1 className="text-xl font-bold text-foreground">{valid ? "Verified certificate" : state === "expired" ? "Certificate expired" : "Certificate revoked"}</h1>
          <p className="text-sm text-muted-foreground">
            {valid ? `${cert.title} — issued by ${cert.organization}.` : state === "expired" ? "This certificate was genuine but its validity period has ended." : `This certificate was revoked${cert.revokedReason ? `: ${cert.revokedReason}` : "."}`}
          </p>
        </div>
        <dl className="space-y-2.5 py-4 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Independent verification · <Link href="/" className="hover:underline">{siteHost}</Link>
      </p>
    </div>
  );
}

export default async function VerifyCertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const seal = await getPublicSeal(code).catch(() => null);
  if (seal) return <SealedVerification seal={seal} />;
  const [cert, settings, siteHost] = await Promise.all([loadView(code), getTmsSettings(), companySiteHost()]);
  if (!cert) {
    const ots = await getOtsCertificateByCode(code);
    if (ots) return <OtsVerification cert={ots} siteHost={siteHost} />;
  }

  const valid = cert && !cert.revoked;

  return (
    <div className="lms-shell flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-bold">
        <BrandMark className="size-7 shrink-0" />
        <BrandName /> <span className="text-foreground">Training</span>
      </div>

      <div className="w-full max-w-md rounded-3xl border border-border/40 bg-background/95 p-6 shadow-none backdrop-blur-md dark:bg-card/85">
        {!cert ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <XCircle className="size-12 text-destructive" />
            <h1 className="text-xl font-bold text-foreground">Certificate not found</h1>
            <p className="text-sm text-muted-foreground">
              No certificate matches this verification code. Check the code and try again.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2 border-b border-border/60 pb-4 text-center">
              {valid ? (
                <CheckCircle2 className="size-12 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="size-12 text-destructive" />
              )}
              <h1 className="text-xl font-bold text-foreground">
                {valid ? "Verified certificate" : "Certificate revoked"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {valid
                  ? `Issued by ${settings.institute.name}.`
                  : `This certificate was revoked${cert.revokedReason ? `: ${cert.revokedReason}` : "."}`}
              </p>
            </div>

            <dl className="space-y-2.5 py-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Certificate No.</dt>
                <dd className="font-mono">{cert.certificateNumber}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="font-medium">{cert.typeLabel}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Awarded to</dt>
                <dd className="font-medium">{cert.studentName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Program</dt>
                <dd className="text-right">{cert.programName}</dd>
              </div>
              {cert.batchName && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Batch</dt>
                  <dd className="text-right">{cert.batchName}</dd>
                </div>
              )}
              {cert.title && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Details</dt>
                  <dd className="text-right">{cert.title}</dd>
                </div>
              )}
              {cert.grade && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Grade</dt>
                  <dd className="font-medium">{cert.grade}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Issued on</dt>
                <dd>{new Date(`${cert.issuedOn}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</dd>
              </div>
            </dl>
          </>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Independent verification · <Link href="/" className="hover:underline">{siteHost}</Link>
      </p>
    </div>
  );
}
