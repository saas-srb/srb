import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getViewer, can, AibotsInputError, NotFoundError } from "@/lib/products/agentos/viewer";
import { canUseBot, getBot } from "@/lib/products/agentos/bots";
import { readBotAvatar, removeBotAvatar, setBotAvatar } from "@/lib/products/agentos/avatar";
import { AVATAR_MAX_BYTES } from "@/lib/products/agentos/avatar-shared";
import { recordAudit } from "@/lib/products/agentos/audit";
import { isBillingLimitError, writeBlockReason } from "@/lib/platform/billing/enforce";

type Ctx = { params: Promise<{ botId: string }> };
const json = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

/** Who may change a photo: agent editors, or the person who created the agent (so the create form can attach the photo it just saved). */
async function editable(botId: string) {
  const viewer = await getViewer();
  if (!viewer) return { error: json("Your session has expired — please sign in again.", 401) } as const;
  const bot = await getBot(botId);
  if (!bot) return { error: json("That agent no longer exists.", 404) } as const;
  const owner = can(viewer, "CREATE_BOT") && bot.createdBy === viewer.userId;
  if (!can(viewer, "EDIT_BOT") && !owner) return { error: json("You don't have permission to change this agent.", 403) } as const;
  const blocked = await writeBlockReason();
  if (blocked) return { error: json(blocked, 403) } as const;
  return { viewer, bot } as const;
}

/** Serves the photo to anyone who may use the agent. Private + immutable: the URL carries a version that changes on every upload. */
async function handleGET(_req: NextRequest, { params }: Ctx) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { botId } = await params;
  const bot = await getBot(botId);
  if (!bot || !canUseBot(viewer, bot)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const photo = await readBotAvatar(botId).catch(() => null);
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(photo.body), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}

async function handlePOST(req: NextRequest, { params }: Ctx) {
  const { botId } = await params;
  const gate = await editable(botId);
  if ("error" in gate) return gate.error;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > AVATAR_MAX_BYTES + 64 * 1024) return json("Use an image under 2 MB.", 413);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json("That upload could not be read.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return json("Choose an image file.", 400);
  if (file.size > AVATAR_MAX_BYTES) return json("Use an image under 2 MB.", 413);
  try {
    await setBotAvatar(botId, new Uint8Array(await file.arrayBuffer()), gate.viewer.userId);
    await recordAudit({ actorId: gate.viewer.userId, actorEmail: gate.viewer.email, action: "update", entity: "bot", entityId: botId, entityLabel: gate.bot.name, botId, summary: "Agent photo changed" });
    revalidatePath("/agentos", "layout");
    const fresh = await getBot(botId);
    const { avatarUrlFor } = await import("@/lib/products/agentos/avatar-shared");
    return NextResponse.json({ ok: true, avatarUrl: avatarUrlFor(botId, fresh?.avatarKey) });
  } catch (err) {
    if (err instanceof AibotsInputError || isBillingLimitError(err)) return json(err.message, 400);
    if (err instanceof NotFoundError) return json("That agent no longer exists.", 404);
    console.error("[agentos avatar] upload failed", err instanceof Error ? err.message : err);
    return json("The photo couldn't be saved. Please try again.", 502);
  }
}

async function handleDELETE(_req: NextRequest, { params }: Ctx) {
  const { botId } = await params;
  const gate = await editable(botId);
  if ("error" in gate) return gate.error;
  try {
    await removeBotAvatar(botId, gate.viewer.userId);
    await recordAudit({ actorId: gate.viewer.userId, actorEmail: gate.viewer.email, action: "update", entity: "bot", entityId: botId, entityLabel: gate.bot.name, botId, summary: "Agent photo removed" });
    revalidatePath("/agentos", "layout");
    return NextResponse.json({ ok: true, avatarUrl: null });
  } catch (err) {
    if (err instanceof NotFoundError) return json("That agent no longer exists.", 404);
    console.error("[agentos avatar] remove failed", err instanceof Error ? err.message : err);
    return json("The photo couldn't be removed. Please try again.", 502);
  }
}

export const GET = withTransport(handleGET);
export const POST = withTransport(handlePOST);
export const DELETE = withTransport(handleDELETE);
