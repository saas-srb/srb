import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { getApplication, openResumeDownloadStream } from "@/lib/career-applications";

type Context = { params: Promise<{ id: string }> };

async function handleGET(_req: NextRequest, { params }: Context) {
  const auth = await authorizeWorkspaceApi("manage.careers.applicants");
  if (!auth.ok) return auth.response;

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
