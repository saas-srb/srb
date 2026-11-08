import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { getReadableSop, getVersion } from "@/lib/products/playbook-ai/sops";
import { canEditSop, inWriteScope, toAccessDoc } from "@/lib/products/playbook-ai/access";
import { contentLines, diffLines, diffStats } from "@/lib/products/playbook-ai/content";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { sopCan } from "@/lib/sop-roles";
import { todayIso } from "@/lib/products/playbook-ai/db";
import { formatIsoDate, getConfidentialityMeta } from "@/lib/products/playbook-ai/constants";
import { cn, formatDateTime } from "@/lib/utils";
import type { SopVersionDoc } from "@/lib/products/playbook-ai/types";

function metaChanges(a: SopVersionDoc, b: SopVersionDoc, deptName: (id: string) => string, catName: (id: string | null) => string) {
  const rows: { label: string; from: string; to: string }[] = [];
  const add = (label: string, from: string, to: string) => from !== to && rows.push({ label, from: from || "—", to: to || "—" });
  add("Department", deptName(a.meta.departmentId), deptName(b.meta.departmentId));
  add("Category", catName(a.meta.categoryId), catName(b.meta.categoryId));
  add("Confidentiality", getConfidentialityMeta(a.meta.confidentiality).label, getConfidentialityMeta(b.meta.confidentiality).label);
  add("Priority", a.meta.priority, b.meta.priority);
  add("Mandatory", a.meta.mandatory ? "Yes" : "No", b.meta.mandatory ? "Yes" : "No");
  add("Effective date", formatIsoDate(a.meta.effectiveDate), formatIsoDate(b.meta.effectiveDate));
  add("Review date", formatIsoDate(a.meta.reviewDate), formatIsoDate(b.meta.reviewDate));
  add("Expiry date", formatIsoDate(a.meta.expiryDate), formatIsoDate(b.meta.expiryDate));
  add("Tags", a.meta.tags.join(", "), b.meta.tags.join(", "));
  return rows;
}

export default async function CompareVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const { id } = await params;
  const sp = await searchParams;
  const found = await getReadableSop(viewer, id);
  if (!found) notFound();
  const acc = toAccessDoc(found.doc, todayIso());
  // Comparing history is for the people who maintain the SOP.
  const allowed = canEditSop(viewer, acc) || (sopCan({ roles: viewer.roles, permissionOverrides: viewer.overrides }, "ASSIGN") && inWriteScope(viewer, acc));
  if (!allowed) redirect(`/playbook-ai/library/${id}?tab=versions`);

  const [from, to] = await Promise.all([getVersion(id, String(sp.from ?? "")), getVersion(id, String(sp.to ?? ""))]);
  if (!from || !to) redirect(`/playbook-ai/library/${id}?tab=versions`);

  const tax = await getTaxonomy();
  const deptName = (d: string) => tax.departments.find((x) => x._id === d)?.name ?? "Unknown";
  const catName = (c: string | null) => (c ? tax.categories.find((x) => x._id === c)?.name ?? "Unknown" : "");
  const diff = diffLines(contentLines(from.content), contentLines(to.content));
  const stats = diffStats(diff);
  const changes = metaChanges(from, to, deptName, catName);

  // Show changed lines with two lines of context; collapse long unchanged runs.
  const CONTEXT = 2;
  const keep = new Array(diff.length).fill(false);
  diff.forEach((l, i) => {
    if (l.kind !== "same") for (let j = Math.max(0, i - CONTEXT); j <= Math.min(diff.length - 1, i + CONTEXT); j++) keep[j] = true;
  });
  const out: ({ kind: "same" | "add" | "del"; text: string } | { kind: "gap"; count: number })[] = [];
  let gap = 0;
  diff.forEach((l, i) => {
    if (keep[i]) {
      if (gap) out.push({ kind: "gap", count: gap });
      gap = 0;
      out.push(l);
    } else gap++;
  });
  if (gap) out.push({ kind: "gap", count: gap });

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SOP", href: "/playbook-ai" }, { label: "SOP Library", href: "/playbook-ai/library" }, { label: found.doc.code, href: `/playbook-ai/library/${id}` }, { label: "Compare versions" }]}
        title={<>Compare versions</>}
        description={<>{found.doc.code} · v{from.version} <span className="mx-1">→</span> v{to.version}</>}
        actions={<><Link href={`/playbook-ai/library/${id}?tab=versions`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ArrowLeft className="size-3.5" data-icon="inline-start" />
          Back to versions
        </Link></>}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {[from, to].map((v, i) => (
          <GlassCard key={v.version} interactive={false}>
            <CardContent className="space-y-1 p-4 text-sm">
              <p className="flex items-center gap-2 font-bold">
                {i === 0 ? "From" : "To"} · v{v.version}
                <Badge className="bg-muted capitalize text-muted-foreground">{v.changeType}</Badge>
              </p>
              <p className="text-muted-foreground">{v.changeSummary}</p>
              <p className="text-xs text-muted-foreground">{v.authorName} · {formatDateTime(v.publishedAt)}</p>
            </CardContent>
          </GlassCard>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">+{stats.added} added</Badge>
        <Badge className="bg-destructive/15 text-destructive">−{stats.removed} removed</Badge>
        <Badge className="bg-muted text-muted-foreground">{stats.unchanged} unchanged lines</Badge>
      </div>

      {changes.length > 0 && (
        <GlassCard interactive={false}>
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-bold">Details that changed</h2>
            <ul className="space-y-1 text-sm">
              {changes.map((c) => (
                <li key={c.label}>
                  <span className="font-medium">{c.label}:</span> <span className="text-destructive line-through">{c.from}</span> <span className="mx-1">→</span>{" "}
                  <span className="text-green-600 dark:text-green-400">{c.to}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardContent className="p-0">
          {stats.added === 0 && stats.removed === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">The document text is identical between these versions.</p>
          ) : (
            <div className="overflow-x-auto py-2 font-mono text-[13px] leading-6">
              {out.map((l, i) =>
                l.kind === "gap" ? (
                  <div key={i} className="px-4 py-0.5 text-center text-[11px] text-muted-foreground">⋯ {l.count} unchanged line{l.count === 1 ? "" : "s"} ⋯</div>
                ) : (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3 px-4 whitespace-pre-wrap",
                      l.kind === "add" && "bg-green-500/10 text-green-800 dark:text-green-300",
                      l.kind === "del" && "bg-destructive/10 text-red-800 line-through decoration-red-400/50 dark:text-red-300"
                    )}
                  >
                    <span className="w-3 shrink-0 select-none text-muted-foreground">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
                    <span className="min-w-0 flex-1 break-words">{l.text || " "}</span>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
