import { withTransport } from "@/lib/security/transport";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { putObject } from "@/lib/storage/blob";

export const maxDuration = 300;

const MAX = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB.

/** Magic-byte sniffing — the declared content type is never trusted on its own. */
function sniff(b: Buffer): { ext: string; type: string; kind: "image" | "audio" | "video" } | null {
  const hex = b.subarray(0, 12).toString("hex");
  if (hex.startsWith("89504e47")) return { ext: "png", type: "image/png", kind: "image" };
  if (hex.startsWith("ffd8ff")) return { ext: "jpg", type: "image/jpeg", kind: "image" };
  if (hex.startsWith("47494638")) return { ext: "gif", type: "image/gif", kind: "image" };
  if (hex.startsWith("52494646") && b.subarray(8, 12).toString() === "WEBP") return { ext: "webp", type: "image/webp", kind: "image" };
  if (hex.startsWith("52494646") && b.subarray(8, 12).toString() === "WAVE") return { ext: "wav", type: "audio/wav", kind: "audio" };
  if (hex.startsWith("494433") || hex.startsWith("fffb") || hex.startsWith("fff3")) return { ext: "mp3", type: "audio/mpeg", kind: "audio" };
  if (hex.startsWith("4f676753")) return { ext: "ogg", type: "audio/ogg", kind: "audio" };
  if (b.subarray(4, 8).toString() === "ftyp") return { ext: "mp4", type: "video/mp4", kind: "video" };
  if (hex.startsWith("1a45dfa3")) return { ext: "webm", type: "video/webm", kind: "video" };
  return null;
}

/** Uploads question media (image / audio / video) to the shared private Blob store under `ots/`. */
async function handlePOST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(viewer, "CREATE_QUESTION") && !can(viewer, "EDIT_QUESTION")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Files must be 4 MB or smaller — link larger videos by https URL instead." }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) return NextResponse.json({ error: "Unsupported file. Use PNG, JPEG, GIF, WebP, MP3, WAV, OGG, MP4 or WebM." }, { status: 400 });
  const name = `${randomUUID()}.${kind.ext}`;
  await putObject("ots", name, buf, kind.type);
  return NextResponse.json({ url: `/api/evaliq/media/${name}`, kind: kind.kind });
}

export const POST = withTransport(handlePOST);
