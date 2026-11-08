import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { backupFile } from "@/lib/products/commandos/backups";

/** The stored backup file itself, byte for byte: what you download is what is stored and what a restore reads. Director only; works while read-only. */
async function handleGET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeWorkspaceApi("company.backups");
  if (!auth.ok) return auth.response;
  if (!auth.user.roles.includes("super_admin")) return NextResponse.json({ error: "Only a Director can download backups." }, { status: 403 });
  const { id } = await ctx.params;
  const file = await backupFile(String(id));
  if (!file) return NextResponse.json({ error: "That backup isn't available." }, { status: 404 });
  return new NextResponse(file.stream, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "no-store", "Content-Length": String(file.bytes) } });
}

export const GET = withTransport(handleGET);
