import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { compareWithSource, getClone } from "@/lib/products/contractflow-ai/clones";

export const dynamic = "force-dynamic";

const WORD_CLASS = { equal: "", add: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300", remove: "bg-red-500/20 text-red-800 line-through dark:text-red-300" } as const;

/** Read-only comparison of the clone with the Playbook version it was made from. */
export default async function CloneRedlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");
  const g = await getClone(viewer, id);
  if (!g.ok) notFound();
  const r = await compareWithSource(viewer, id);
  if (!r.ok) notFound();
  const changed = r.diff?.entries.filter((e) => e.kind !== "unchanged") ?? [];
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "ContractFlow", href: "/contractflow-ai" }, { label: "Documents to sign", href: "/contractflow-ai/clones" }, { label: g.clone.title, href: `/contractflow-ai/clones/${id}` }, { label: "Compare" }]}
        title="Changes since cloning"
        description={`Playbook version ${g.clone.source.versionNumber} compared with this copy. Nothing here changes the Playbook document.`}
      />
      {!r.sourceAvailable ? (
        <p className="rounded-md border p-4 text-sm">{r.summary}</p>
      ) : changed.length === 0 && !r.diff?.page.changed ? (
        <p className="rounded-md border p-4 text-sm">No differences: this copy is the same as the Playbook version.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{r.summary}.</p>
          <ul className="space-y-2">
            {changed.map((e) => (
              <li key={`${e.zone}:${e.id}`} className="rounded-md border bg-card p-3 text-sm">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{e.kind} · {e.blockType}{e.zone !== "body" ? ` · ${e.zone}` : ""}</p>
                {e.words ? (
                  <p>{e.words.map((w, i) => <span key={i} className={WORD_CLASS[w.op]}>{w.text}</span>)}</p>
                ) : e.kind === "removed" ? (
                  <p className="text-red-700 line-through dark:text-red-300">{e.before}</p>
                ) : e.kind === "added" ? (
                  <p className="text-emerald-700 dark:text-emerald-300">{e.after}</p>
                ) : (
                  <p>{e.after ?? e.before}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link className="text-sm underline" href={`/contractflow-ai/clones/${id}`}>Back to the document</Link>
    </div>
  );
}
