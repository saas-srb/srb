import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { redirect } from "next/navigation";
import { PageHeader, Notice } from "@/components/products/rankmax-ai/SeoUi";
import RobotsEditor from "@/components/products/rankmax-ai/RobotsEditor";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { getRobotsDoc, defaultRobots, importantPaths } from "@/lib/products/rankmax-ai/robots-store";
import { fetchUrl } from "@/lib/products/rankmax-ai/fetch";
import { getSettings } from "@/lib/products/rankmax-ai/settings";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { formatDateTime } from "@/lib/utils";

export default async function RobotsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const [doc, paths, settings, siteUrl, defaultText] = await Promise.all([getRobotsDoc(), importantPaths(), getSettings(), companySiteUrl(), defaultRobots()]);
  const live = await fetchUrl(`${settings.siteOrigin}/robots.txt`, { timeoutMs: 8000 });
  const managedText = doc.content ?? defaultText;
  const liveDiffers = live.status === 200 && live.body !== null && live.body.trim() !== managedText.trim();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Robots.txt"
        crumbs={[{ label: "Robots.txt" }]}
        description={<>Edit, validate and publish <a href={`${siteUrl}/robots.txt`} target="_blank" rel="noreferrer" className="text-primary hover:underline">/robots.txt</a>. Publishing updates the live file without a deploy. {doc.publishedAt && `Last published ${formatDateTime(doc.publishedAt)}.`}</>}
      />
      <PanelListFilters>
{live.status !== 200 && <Notice tone="warn">Could not read the live file at {settings.siteOrigin}/robots.txt ({live.error ?? `HTTP ${live.status}`}).</Notice>}
      {liveDiffers && <Notice tone="info">The file served at {settings.siteOrigin} differs from the version below — a CDN may still be caching the previous file, or the audited origin runs different code.</Notice>}
      <RobotsEditor
        initial={managedText}
        managed={doc.content !== null}
        defaultText={defaultText}
        primaryHost={new URL(siteUrl).host}
        importantPaths={paths}
        canEdit={can(viewer, "MANAGE_ROBOTS")}
        revisions={doc.revisions.map((r) => ({ content: r.content, at: formatDateTime(r.at), byEmail: r.byEmail, note: r.note }))}
      />
</PanelListFilters>
    </div>
  );
}
