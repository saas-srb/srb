import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { hasTmsStaffRole } from "@/lib/tms-roles";
import { certificateWithMeta } from "@/lib/products/cohort-ai/certificates";
import { getTmsSettings } from "@/lib/products/cohort-ai/settings";
import { renderCertificatePdf } from "@/components/products/cohort-ai/CertificatePdf";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ id: string }> };

async function handleGET(_req: Request, { params }: Context) {
  const user = await getCurrentTmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const cert = await certificateWithMeta(id);
  if (!cert) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isStaff = hasTmsStaffRole(user.roles);
  const isOwner = user.studentId === cert.studentId;
  if (!isStaff && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (cert.revoked && !isStaff) return NextResponse.json({ error: "This certificate has been revoked." }, { status: 410 });

  const [settings, siteUrl] = await Promise.all([getTmsSettings(), companySiteUrl()]);
  const buffer = await renderCertificatePdf({
    certificateNumber: cert.certificateNumber,
    verificationCode: cert.verificationCode,
    verifyUrl: `${siteUrl}/verify/${cert.verificationCode}`,
    typeLabel: cert.typeLabel,
    studentName: cert.studentName,
    programName: cert.programName,
    batchName: cert.batchName,
    title: cert.title,
    issuedOn: cert.issuedOn,
    grade: cert.grade,
    institute: {
      name: settings.institute.name,
      addressLine: settings.institute.addressLine,
      city: settings.institute.city,
      signatoryName: settings.institute.signatoryName,
      signatoryTitle: settings.institute.signatoryTitle,
    },
  });

  await recordPdf({ type: "tms_certificate", ref: cert.certificateNumber, by: user.email, role: isStaff ? "staff" : "student" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${cert.certificateNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
