import { redirect } from "next/navigation";
import { PageHeader, Notice } from "@/components/products/agentos/AibotsUi";
import BotForm from "@/components/products/agentos/BotForm";
import { getViewer, can } from "@/lib/products/agentos/viewer";
import { botFormOptions, formValuesFor } from "@/lib/products/agentos/form-options";
import { isOpenAIConfigured } from "@/lib/openai";

export default async function CreateBotPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  if (!can(viewer, "CREATE_BOT")) redirect("/agentos");
  const o = await botFormOptions();
  return (
    <div className="space-y-4">
      <PageHeader title="Create Agent" crumbs={[{ label: "Agent Hub", href: "/agentos/hub" }, { label: "Create Agent" }]} description="Configure the bot and, optionally, its own knowledge base. With files it answers only from them; without, from its instructions. It appears in the sidebar as soon as it's saved." />
      {!(await isOpenAIConfigured()) && <Notice tone="warn">OpenAI isn&apos;t connected for this workspace (Settings → Integrations) yet — you can create bots now, but they can&apos;t answer or index files until OPENAI_API_KEY is set.</Notice>}
      <BotForm
        botId={null}
        initial={formValuesFor(null, o.settings.defaultModel, kind === "voice" ? "voice" : "text")}
        models={o.models}
        roleOptions={o.roleOptions}
        userOptions={o.userOptions}
        canUpload={can(viewer, "UPLOAD_FILES")}
        openAIReady={(await isOpenAIConfigured())}
      />
    </div>
  );
}
