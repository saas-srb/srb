import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedLmsRequest } from "@/lib/api-auth";
import { getApplication, openResumeDownloadStream } from "@/lib/career-applications";

type Context = { params: Promise<{ id: string }> };

async function handleGET(req: NextRequest, { params }: Context) {
  if (!(await isAuthorizedLmsRequest(req, "VIEW_CAREERS"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const application = await getApplication(id);
  if (!application || !application.resume) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  const object = await openResumeDownloadStream(application.resume.storageKey);
  if (!object) return NextResponse.json({ error: "Resume not found." }, { status: 404 });

  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": application.resume.contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(application.resume.filename)}"`,
      "Content-Length": String(application.resume.size),
    },
  });
}

export const GET = withTransport(handleGET);
