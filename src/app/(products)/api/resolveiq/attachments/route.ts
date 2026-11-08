import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { attachmentOwnerCompany, getObject, saveAttachment } from "@/lib/support/attachments";
import { getCompanyCaller } from "@/lib/support/caller";

/** Upload (company users) and download (the company that owns the request, or platform support staff) of request attachments. */

async function handlePOST(req: NextRequest) {
  const caller = await getCompanyCaller();
  if (!caller) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  let file: FormDataEntryValue | null = null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  try {
    const res = await saveAttachment(caller, file);
    return res.ok ? NextResponse.json(res.attachment) : NextResponse.json({ error: res.error }, { status: 400 });
  } catch (err) {
    console.error("[support] attachment upload failed", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

async function handleGET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!key.startsWith("support/") || key.includes("..")) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const owner = await attachmentOwnerCompany(key);
  if (!owner) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let allowed = false;
  const caller = await getCompanyCaller();
  if (caller && caller.companyId === owner.companyId) allowed = true;
  if (!allowed) {
    try {
      allowed = (await checkPlatformPermission("support.read")).ok;
    } catch {
      allowed = false; // not a platform user (the access check redirects them)
    }
  }
  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const obj = await getObject(key);
  if (!obj) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const inline = owner.type.startsWith("image/") || owner.type === "application/pdf";
  return new NextResponse(obj.stream, {
    headers: {
      "Content-Type": owner.type,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(owner.name)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    },
  });
}

export const POST = withTransport(handlePOST);
export const GET = withTransport(handleGET);
