import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { limitOr429 } from "@/lib/security/rate-limit";
import { createApplication, getOpenJobPositionBySlug, uploadResume } from "@/lib/career-applications";
import { validateApplicationInput, validateResumeFile } from "@/lib/career-application-validation";
import { provisionLeadAndAccount } from "@/lib/lead-management/provision";
import { createPortalSession, setPortalSessionCookie } from "@/lib/portal-auth";

async function handlePOST(req: NextRequest) {
  const limited = await limitOr429(req, "careers-apply", 6, 3600);
  if (limited) return limited;
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Request body must be multipart form data." }, { status: 400 });
  }

  const validation = validateApplicationInput({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    coverNote: formData.get("coverNote"),
    positionSlug: formData.get("positionSlug"),
    source: formData.get("source"),
  });
  if (!validation.valid) {
    return NextResponse.json({ error: "Validation failed.", fields: validation.errors }, { status: 422 });
  }

  if (validation.data.positionSlug) {
    const position = await getOpenJobPositionBySlug(validation.data.positionSlug);
    if (!position) {
      return NextResponse.json(
        { error: "Validation failed.", fields: { positionSlug: "This role is no longer accepting applications." } },
        { status: 422 }
      );
    }
  }

  const resumeEntry = formData.get("resume");
  if (!(resumeEntry instanceof File) || resumeEntry.size === 0) {
    return NextResponse.json({ error: "Validation failed.", fields: { resume: "Resume is required." } }, { status: 422 });
  }
  const resumeError = validateResumeFile(resumeEntry);
  if (resumeError) {
    return NextResponse.json({ error: "Validation failed.", fields: { resume: resumeError } }, { status: 422 });
  }

  let resume;
  try {
    resume = await uploadResume(resumeEntry);
  } catch (err) {
    console.error("Failed to upload resume", err);
    return NextResponse.json({ error: "Failed to upload resume. Please try again." }, { status: 500 });
  }

  try {
    const application = await createApplication({ ...validation.data, resume });

    // Lead-driven portal: every application becomes a Lead + a portal account the
    // applicant is immediately signed into.
    let portal: { redirect: string; isNewAccount: boolean; tempPassword: string | null } | undefined;
    try {
      const result = await provisionLeadAndAccount({
        source: "job_portal",
        name: validation.data.name,
        email: validation.data.email,
        phone: validation.data.phone,
        subService: application.positionTitle ?? null,
        message: validation.data.coverNote ?? null,
        sourceRef: { kind: "career_application", id: String(application._id) },
        applicationId: String(application._id),
        referralCode: typeof formData.get("referralCode") === "string" ? String(formData.get("referralCode")) : null,
      });
      // Only a brand-new account is signed in automatically. An email that already has an account is NOT proof of identity —
      // logging the submitter in would let anyone take over (and spend the wallet of) any user whose email they know.
      if (result.isNewAccount) {
        const { token } = await createPortalSession(result.externalUserId, false);
        await setPortalSessionCookie(token, false);
      }
      portal = { redirect: result.isNewAccount ? "/clientos" : "/login", isNewAccount: result.isNewAccount, tempPassword: result.tempPassword };
    } catch (provErr) {
      console.error("Lead provisioning failed (application still saved)", provErr);
    }

    return NextResponse.json({ data: application, portal }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_POSITION") {
      return NextResponse.json(
        { error: "Validation failed.", fields: { positionSlug: "This role is no longer accepting applications." } },
        { status: 422 }
      );
    }
    console.error("Failed to create application", err);
    return NextResponse.json({ error: "Failed to save application. Please try again." }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
