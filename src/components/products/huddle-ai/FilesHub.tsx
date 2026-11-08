"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, Download, FileText, Image as ImageIcon, Mic, Film } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileRow {
  _id: string;
  name: string;
  size: number;
  storageKey: string;
  kind: string;
  category: string;
  scopeLabel: string;
  uploaderName: string;
  createdAt: string;
}

interface Result {
  files: FileRow[];
  total: number;
  page: number;
  totalPages: number;
  categories: string[];
}

const KIND_ICON: Record<string, typeof FileText> = {
  image: ImageIcon,
  voice: Mic,
  video: Film,
  file: FileText,
};

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function FilesHub() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (category !== "all") params.set("category", category);
      if (kind !== "all") params.set("kind", kind);
      params.set("page", String(page));
      try {
        const res = await fetch(`/api/huddle-ai/files?${params.toString()}`);
        setData(await res.json());
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, category, kind, page]);

  // reset to page 1 when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [q, category, kind]);

  const categories = useMemo(() => data?.categories ?? [], [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search file names…"
            className="rounded-xl border-border/50 bg-background pl-9 pr-3 py-1.5 text-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Type</label>
          <Select value={kind} onValueChange={(v) => setKind(v ?? "all")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="file">Documents</SelectItem>
              <SelectItem value="video">Videos</SelectItem>
              <SelectItem value="voice">Voice notes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Category</label>
          <Select value={category} onValueChange={(v) => setCategory(v ?? "all")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
          <span>{data ? `${data.total} file${data.total === 1 ? "" : "s"}` : "…"}</span>
          {loading && <Loader2 className="size-3.5 animate-spin" />}
        </div>
        <ul className="divide-y divide-border/60">
          {data?.files.length === 0 && (
            <li className="px-4 py-12 text-center text-sm text-muted-foreground">No files match.</li>
          )}
          {data?.files.map((f) => {
            const Icon = KIND_ICON[f.kind] ?? FileText;
            return (
              <li key={f._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    f.kind === "image" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-primary/10 text-primary"
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {f.category} · {bytes(f.size)} · {f.scopeLabel} · {f.uploaderName} ·{" "}
                    {new Date(f.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <a
                  href={`/api/huddle-ai/files/${f.storageKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Open ${f.name}`}
                >
                  <Download className="size-4" />
                </a>
              </li>
            );
          })}
        </ul>
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-xs">
            <Button type="button" size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-muted-foreground">
              Page {data.page} of {data.totalPages}
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
