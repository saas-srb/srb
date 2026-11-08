import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { getPage } from "@/lib/products/sitecraft-ai/pages";
import { listThemes } from "@/lib/products/sitecraft-ai/theme";
import PageSeoEditor from "@/components/products/sitecraft-ai/PageSeoEditor";
import { parsePageFrame } from "@/lib/products/sitecraft-ai/page-seo";
import PageBuilder from "@/components/products/sitecraft-ai/PageBuilder";

export default async function CmsPageBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");

  const [page, themes] = await Promise.all([getPage(id), listThemes()]);
  if (!page) notFound();

  return (
    <>
    <PanelPageHeader title={<>Edit page</>} description={<>{page.title} · {page.path}</>} />
    <PageBuilder
      pageId={page._id}
      path={page.path}
      title={page.title}
      status={page.status}
      version={page.version}
      hasUnpublishedChanges={page.hasUnpublishedChanges}
      sections={page.draft.sections}
      themes={themes.map((t) => ({ key: t._id, name: t.name }))}
      canEdit={can(viewer, "SECTIONS_EDIT")}
      canPublish={can(viewer, "PAGES_PUBLISH")}
      canRestore={can(viewer, "PAGES_RESTORE")}
    />
    <PageSeoEditor
      key={new Date(page.updatedAt).toISOString()}
      pageId={page._id}
      initialSeo={page.draft.seo ?? null}
      initialJsonLd={page.draft.jsonLd ?? []}
      initialFrame={parsePageFrame(page.draft.frame)}
      canEdit={can(viewer, "SECTIONS_EDIT")}
    />
    </>
  );
}
