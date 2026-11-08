import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getArticleById } from "@/lib/support/articles";
import ArticleEditor from "./ArticleEditor";

export const metadata: Metadata = { title: "Help article" };
export const dynamic = "force-dynamic";

export default async function HelpArticleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformPermission("support.read");
  const { id } = await params;
  const article = id === "new" ? null : await getArticleById(id);
  if (id !== "new" && !article) notFound();
  return (
    <div className="space-y-4">
<PanelPageHeader
        title={<>{article ? "Edit article" : "New article"}</>}
      />
<div className="space-y-4 p-1">
      <Link href="/console/resolveiq/help" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Help content</Link>
      <ArticleEditor
        canManage={can(user, "support.manage")}
        initial={article ? { id: article._id, title: article.title, summary: article.summary, body: article.body, category: article.category, tags: article.tags.join(", "), panels: article.panels.join(", "), status: article.status } : { title: "", summary: "", body: "", category: "", tags: "", panels: "", status: "draft" }}
      />
    </div>
</div>
  );
}
