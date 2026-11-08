import { avatarUrlFor } from "@/lib/products/agentos/avatar-shared";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { PageHeader, Notice } from "@/components/products/agentos/AibotsUi";
import BotForm from "@/components/products/agentos/BotForm";
import KnowledgeBase from "@/components/products/agentos/KnowledgeBase";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getViewer, can } from "@/lib/products/agentos/viewer";
import { getBot } from "@/lib/products/agentos/bots";
import { listBotFiles, refreshProcessing, toView } from "@/lib/products/agentos/knowledge";
import { botFormOptions, formValuesFor } from "@/lib/products/agentos/form-options";
import { isOpenAIConfigured } from "@/lib/openai";

export default async function EditBotPage({ params, searchParams }: { params: Promise<{ botId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  const mayEdit = can(viewer, "EDIT_BOT");
  const mayKb = can(viewer, "MANAGE_KB") || can(viewer, "UPLOAD_FILES") || can(viewer, "DELETE_FILES");
  if (!mayEdit && !mayKb) redirect("/agentos");
  const [{ botId }, sp] = await Promise.all([params, searchParams]);
  const bot = await getBot(botId);
  if (!bot) notFound();
  const tab = sp.tab === "knowledge" || !mayEdit ? "knowledge" : "config";
  const openAIReady = await isOpenAIConfigured();
  if (tab === "knowledge" && openAIReady) await refreshProcessing(bot).catch(() => {});
  const [files, o] = await Promise.all([listBotFiles(bot._id), tab === "config" ? botFormOptions() : null]);

  const tabs = [
    ...(mayEdit ? [{ key: "config", label: "Configuration", href: `/agentos/bots/${bot._id}` }] : []),
    { key: "knowledge", label: `Knowledge Base (${files.length})`, href: `/agentos/bots/${bot._id}?tab=knowledge` },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={bot.name}
        crumbs={[{ label: "Manage Bots", href: "/agentos/bots" }, { label: bot.name }]}
        description={`${bot.category} · ${bot.model} · ${bot.status === "active" ? "Active" : "Inactive"}`}
        actions={
          <>
            <BotAvatar icon={bot.icon} color={bot.color} imageUrl={avatarUrlFor(bot._id, bot.avatarKey)} />
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/agentos/b/${bot._id}`} />}>
              <MessageSquare className="size-4" /> Test chat
            </Button>
          </>
        }
      />
      <PanelTabs label="Bot sections" active={tab} tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: t.href }))} />
      {!openAIReady && <Notice tone="warn">OpenAI isn&apos;t connected for this workspace (Settings → Integrations), so knowledge files can&apos;t be uploaded and the bot can&apos;t reply yet.</Notice>}
      {tab === "config" && o ? (
        <BotForm
          key={bot.updatedAt.toISOString()}
          botId={bot._id}
          initial={formValuesFor(bot, o.settings.defaultModel)}
          avatarUrl={avatarUrlFor(bot._id, bot.avatarKey)}
          models={o.models}
          roleOptions={o.roleOptions}
          userOptions={o.userOptions}
          assignedFiles={files.filter((f) => f.enabled && (f.status === "ready" || f.status === "processing")).length}
        />
      ) : (
        <KnowledgeBase botId={bot._id} files={files.map(toView)} openAIReady={openAIReady} can={{ upload: can(viewer, "UPLOAD_FILES"), manage: can(viewer, "MANAGE_KB"), del: can(viewer, "DELETE_FILES") }} />
      )}
    </div>
  );
}
