import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getCurrentOtsUser } from "@/lib/ots-auth";
import { getCurrentPortalUser } from "@/lib/portal-auth";
import { getObject } from "@/lib/storage/blob";

type Context = { params: Promise<{ file: string }> };

/** Serves uploaded question media to any signed-in OTS or Portal user (candidates see it during their exam). */
async function handleGET(_req: Request, { params }: Context) {
  const { file } = await params;
  if (!/^[0-9a-f-]{36}\.(png|jpg|gif|webp|wav|mp3|ogg|mp4|webm)$/.test(file)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [staff, portal] = await Promise.all([getCurrentOtsUser(), getCurrentPortalUser()]);
  if (!staff && !portal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const obj = await getObject(`ots/${file}`);
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(obj.stream, { headers: { "Content-Type": obj.contentType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}

export const GET = withTransport(handleGET);
