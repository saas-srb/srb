import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { isValidImportKind, isValidPlatform } from "@/lib/campaign-platforms";
import { importLeadListCsv, importPerformanceCsv } from "@/lib/campaigns";

const MAX_BYTES = 5 * 1024 * 1024;

async function handlePOST(req: NextRequest) {
  const lmsUser = await requireLms("MANAGE_CAMPAIGNS");
  if (!lmsUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Request body must be multipart form data." }, { status: 400 });
  }

  const platform = String(formData.get("platform") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!isValidPlatform(platform)) return NextResponse.json({ error: "Unknown platform." }, { status: 400 });
  if (!isValidImportKind(kind)) return NextResponse.json({ error: "Unknown import type." }, { status: 400 });

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a CSV file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is larger than 5 MB." }, { status: 413 });
  }
  const nameOk = /\.csv$/i.test(file.name);
  const typeOk = ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain", ""].includes(file.type);
  if (!nameOk && !typeOk) {
    return NextResponse.json({ error: "Upload a .csv file." }, { status: 415 });
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return NextResponse.json({ error: "Could not read the file." }, { status: 400 });
  }

  try {
    const result =
      kind === "performance"
        ? await importPerformanceCsv(lmsUser.id, platform, file.name, file.size, text)
        : await importLeadListCsv(lmsUser.id, platform, file.name, file.size, text);
    return NextResponse.json({ result }, { status: result.status === "failed" ? 422 : 200 });
  } catch (err) {
    console.error("Campaign CSV import failed", err);
    return NextResponse.json({ error: "Import failed. Check the file and try again." }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
