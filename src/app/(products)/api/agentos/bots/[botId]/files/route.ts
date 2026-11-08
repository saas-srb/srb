import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isOpenAIConfigured } from "@/lib/openai";
import { getViewer, can, AibotsInputError, NotFoundError } from "@/lib/products/agentos/viewer";
import { getBot } from "@/lib/products/agentos/bots";
import { replaceBotFile, uploadBotFile, friendlyError } from "@/lib/products/agentos/knowledge";
import { recordAudit } from "@/lib/products/agentos/audit";

export const maxDuration = 300;

/**
 * Multipart upload into ONE bot's knowledge base (a route rather than a server
 * action because actions cap request bodies at 1 MB). `fileId` present → a
 * new version of that file; absent → a new file. The bot comes from the URL,
 * and the file can only ever land in that bot's own vector store.
 */
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "Your session has expired — please sign in again." }, { status: 401 });
  if (!can(viewer, "UPLOAD_FILES")) return NextResponse.json({ ok: false, error: "You don't have permission to upload knowledge files." }, { status: 403 });
  if (!(await isOpenAIConfigured())) return NextResponse.json({ ok: false, error: "OpenAI isn't connected for this workspace yet (Settings → Integrations)." }, { status: 503 });

  const { botId } = await params;
  const bot = await getBot(botId);
  if (!bot) return NextResponse.json({ ok: false, error: "That bot no longer exists." }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "That upload could not be read." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "Choose a file to upload." }, { status: 400 });
  const fileId = String(form.get("fileId") ?? "") || null;

  try {
    if (fileId) {
      const { before, after } = await replaceBotFile(bot, fileId, file, viewer.userId);
      await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "replace", entity: "file", entityId: before._id, entityLabel: before.title, botId: bot._id, summary: `${bot.name}: v${after.version} (${file.name})` });
    } else {
      const doc = await uploadBotFile(bot, file, { title: form.get("title"), description: form.get("description"), category: form.get("category") }, viewer.userId);
      await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "upload", entity: "file", entityId: doc._id, entityLabel: doc.title, botId: bot._id, summary: `${bot.name}: ${file.name}` });
    }
    revalidatePath(`/agentos/bots/${bot._id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AibotsInputError) return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    if (err instanceof NotFoundError) return NextResponse.json({ ok: false, error: "That file no longer exists." }, { status: 404 });
    console.error("[aibots upload]", friendlyError(err));
    return NextResponse.json({ ok: false, error: "OpenAI rejected the upload. Please try again." }, { status: 502 });
  }
}

export const POST = withTransport(handlePOST);
