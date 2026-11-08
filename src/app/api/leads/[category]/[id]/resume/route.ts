import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedLmsRequest } from "@/lib/api-auth";
import { getLead, isValidCategory, openResumeDownloadStream } from "@/lib/leads";

type Context = { params: Promise<{ category: string; id: string }> };

async function handleGET(req: NextRequest, { params }: Context) {
  if (!(await isAuthorizedLmsRequest(req, "VIEW_LEADS"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { category, id } = await params;
  if (!isValidCategory(category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }

  const lead = await getLead(category, id);
  if (!lead || !lead.resume) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  const object = await openResumeDownloadStream(lead.resume.storageKey);
  if (!object) return NextResponse.json({ error: "Resume not found." }, { status: 404 });

  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": lead.resume.contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(lead.resume.filename)}"`,
      "Content-Length": String(lead.resume.size),
    },
  });
}

export const GET = withTransport(handleGET);
