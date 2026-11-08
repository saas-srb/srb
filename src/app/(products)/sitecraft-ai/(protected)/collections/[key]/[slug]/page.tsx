import { notFound, redirect } from "next/navigation";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { COLLECTIONS } from "@/lib/products/sitecraft-ai/collections/registry";
import { getEditableRecord } from "@/lib/products/sitecraft-ai/collections/store";
import type { CollectionKey } from "@/lib/products/sitecraft-ai/collections/types";
import CollectionRecordEditor from "@/components/products/sitecraft-ai/CollectionRecordEditor";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";
import { ContentStatusBadge, PendingChangesBadge } from "@/components/products/sitecraft-ai/ui/StatusBadge";
import { COLLECTION_META } from "../collection-meta";

export default async function CmsCollectionRecordPage({ params }: { params: Promise<{ key: string; slug: string }> }) {
  const { key, slug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");
  if (!(key in COLLECTIONS)) notFound();
  const def = COLLECTIONS[key as CollectionKey];
  const rec = await getEditableRecord(key as CollectionKey, slug);
  if (!rec) notFound();

  return (
    <div className="space-y-4">
      <CmsPageHeader
        breadcrumbs={[{ label: "Collections", href: "/sitecraft-ai/collections" }, { label: def.label, href: `/sitecraft-ai/collections/${key}` }, { label: def.titleOf(def.parse(rec.data) ?? rec.data) || slug }]}
        icon={COLLECTION_META[key as CollectionKey].icon}
        title={def.titleOf(def.parse(rec.data) ?? rec.data) || slug}
        description={<span className="font-mono">{def.pathOf ? def.pathOf(slug) : slug}</span>}
        badges={
          <>
            <ContentStatusBadge status={rec.doc.archived ? "archived" : rec.doc.live ? "published" : "draft"} />
            {rec.doc.hasUnpublishedChanges && rec.doc.live && <PendingChangesBadge />}
          </>
        }
      />
      <CollectionRecordEditor
        collection={key}
        slug={slug}
        initial={rec.data}
        isPublished={Boolean(rec.doc?.live)}
        isArchived={Boolean(rec.doc?.archived)}
        hasUnpublishedChanges={Boolean(rec.doc?.hasUnpublishedChanges)}
        publicPath={def.pathOf ? def.pathOf(slug) : null}
        canEdit={can(viewer, "COLLECTIONS_EDIT")}
        canPublish={can(viewer, "COLLECTIONS_PUBLISH")}
      />
    </div>
  );
}
