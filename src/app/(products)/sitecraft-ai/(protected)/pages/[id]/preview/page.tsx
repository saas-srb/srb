import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Eye, ExternalLink, Pencil } from "lucide-react";
import { getViewer } from "@/lib/products/sitecraft-ai/viewer";
import { getPage } from "@/lib/products/sitecraft-ai/pages";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";
import { ContentStatusBadge, PendingChangesBadge } from "@/components/products/sitecraft-ai/ui/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import DevicePreview from "./DevicePreview";
import { displayTitle } from "@/lib/products/sitecraft-ai/site-areas";

export default async function CmsPagePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getViewer())) redirect("/sitecraft-ai/login");
  const { id } = await params;
  const page = await getPage(id);
  if (!page) notFound();

  return (
    <div className="space-y-4">
      <CmsPageHeader
        breadcrumbs={[{ label: "Pages", href: "/sitecraft-ai/pages" }, { label: displayTitle(page.title, page.path), href: `/sitecraft-ai/pages/${page._id}` }, { label: "Preview" }]}
        icon={Eye}
        title={`Preview: ${displayTitle(page.title, page.path)}`}
        description={<>The <strong>draft</strong> of <span className="font-mono">{page.path}</span>, rendered with the live theme, header and footer. Visitors don&apos;t see it until you publish.</>}
        badges={
          <>
            <ContentStatusBadge status={page.status} version={page.version} />
            {page.hasUnpublishedChanges && page.live && <PendingChangesBadge />}
          </>
        }
        actions={
          <>
            <Link href={`/sitecraft-ai/pages/${page._id}`} className={buttonVariants({ variant: "default", size: "sm" })}><Pencil className="size-3.5" /> Back to editor</Link>
            <a href={`/sitecraft-ai/preview/${page._id}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}><ExternalLink className="size-3.5" /> Open in new tab</a>
            {page.live && <a href={page.path} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}><ExternalLink className="size-3.5" /> Live page</a>}
          </>
        }
      />
      <DevicePreview src={`/sitecraft-ai/preview/${page._id}`} />
    </div>
  );
}
