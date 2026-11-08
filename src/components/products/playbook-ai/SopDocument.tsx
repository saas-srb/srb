import { AlertTriangle, BookOpen, ExternalLink, FileDown, Info, Lightbulb, Paperclip, PlayCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SopMarkdown from "@/components/products/playbook-ai/SopMarkdown";
import ChecklistBlock from "@/components/products/playbook-ai/ChecklistBlock";
import { fileUrl } from "@/lib/products/playbook-ai/constants";
import { cn } from "@/lib/utils";
import type { SopBlock, SopContent } from "@/lib/products/playbook-ai/constants";
import type { SopFileDoc } from "@/lib/products/playbook-ai/types";

export interface DocFile {
  id: string;
  filename: string;
  size: number;
  kind: SopFileDoc["kind"];
}

const CALLOUTS = {
  note: { label: "Note", icon: Info, cls: "border-blue-500/30 bg-blue-500/5", tone: "text-blue-600 dark:text-blue-400" },
  warning: { label: "Warning", icon: AlertTriangle, cls: "border-amber-500/40 bg-amber-500/10", tone: "text-amber-600 dark:text-amber-400" },
  example: { label: "Example", icon: Lightbulb, cls: "border-emerald-500/30 bg-emerald-500/5", tone: "text-emerald-600 dark:text-emerald-400" },
  reference: { label: "Reference", icon: BookOpen, cls: "border-purple-500/30 bg-purple-500/5", tone: "text-purple-600 dark:text-purple-400" },
} as const;

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Block({
  block,
  sopId,
  files,
  canDownload,
  checklist,
  checklistInteractive,
}: {
  block: SopBlock;
  sopId: string;
  files: Map<string, DocFile>;
  canDownload: boolean;
  checklist: Record<string, boolean>;
  checklistInteractive: boolean;
}) {
  switch (block.type) {
    case "paragraph":
      return <SopMarkdown>{block.text}</SopMarkdown>;
    case "heading":
      return block.level === 3 ? <h4 className="pt-1 text-sm font-bold">{block.text}</h4> : <h3 className="pt-1 text-base font-bold">{block.text}</h3>;
    case "steps": {
      const items = block.items.filter((i) => i.trim());
      if (!items.length) return null;
      return (
        <ol className="space-y-2">
          {items.map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-xs font-bold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1"><SopMarkdown>{t}</SopMarkdown></div>
            </li>
          ))}
        </ol>
      );
    }
    case "bullets": {
      const items = block.items.filter((i) => i.trim());
      if (!items.length) return null;
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
          {items.map((t, i) => (
            <li key={i}><SopMarkdown className="inline">{t}</SopMarkdown></li>
          ))}
        </ul>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <Table>
            <TableHeader>
              <TableRow>{block.header.map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((r, ri) => (
                <TableRow key={ri}>{r.map((c, ci) => <TableCell key={ci} className="whitespace-normal">{c}</TableCell>)}</TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    case "checklist":
      return <ChecklistBlock sopId={sopId} blockId={block.id} title={block.title} items={block.items} initial={checklist} interactive={checklistInteractive} />;
    case "image": {
      if (!block.fileId || !files.has(block.fileId)) return null;
      return (
        <figure className="space-y-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated route; next/image's optimizer can't fetch it */}
          <img src={fileUrl(block.fileId)} alt={block.alt || block.caption || "SOP illustration"} className="max-h-[32rem] max-w-full rounded-xl border border-border/50" loading="lazy" />
          {block.caption && <figcaption className="text-xs text-muted-foreground">{block.caption}</figcaption>}
        </figure>
      );
    }
    case "video": {
      const hasFile = block.fileId && files.has(block.fileId);
      if (!hasFile && !block.url) return null;
      return (
        <figure className="space-y-1.5">
          {hasFile ? (
            <video controls preload="metadata" className="max-h-[28rem] w-full rounded-xl border border-border/50 bg-black" src={fileUrl(block.fileId as string)} />
          ) : (
            <a href={block.url as string} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm text-primary hover:bg-muted/40">
              <PlayCircle className="size-5 shrink-0" />
              <span className="min-w-0 truncate">{block.caption || block.url}</span>
              <ExternalLink className="ml-auto size-3.5 shrink-0" />
            </a>
          )}
          {hasFile && block.caption && <figcaption className="text-xs text-muted-foreground">{block.caption}</figcaption>}
        </figure>
      );
    }
    case "attachment": {
      const f = block.fileId ? files.get(block.fileId) : null;
      if (!f) return null;
      return canDownload ? (
        <a href={`${fileUrl(f.id)}?download=1`} className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm hover:bg-muted/40">
          <FileDown className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate font-medium">{block.label || f.filename}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{fmtSize(f.size)}</span>
        </a>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-border/60 px-3 py-2.5 text-sm text-muted-foreground">
          <Paperclip className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{block.label || f.filename}</span>
          <span className="shrink-0 text-xs">Download not permitted</span>
        </div>
      );
    }
    case "link":
      if (!block.url) return null;
      return (
        <a href={block.url} target={block.url.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer nofollow" className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm hover:bg-muted/40">
          <ExternalLink className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-primary">{block.label || block.url}</span>
            {block.description && <span className="block text-xs text-muted-foreground">{block.description}</span>}
          </span>
        </a>
      );
    default: {
      const c = CALLOUTS[block.type];
      if (!block.text.trim()) return null;
      const Icon = c.icon;
      return (
        <div className={cn("flex gap-2.5 rounded-xl border px-3 py-2.5", c.cls)}>
          <Icon className={cn("mt-0.5 size-4 shrink-0", c.tone)} />
          <div className="min-w-0 flex-1">
            <p className={cn("text-xs font-bold uppercase tracking-wide", c.tone)}>{c.label}</p>
            <SopMarkdown>{block.text}</SopMarkdown>
          </div>
        </div>
      );
    }
  }
}

function sectionHasContent(blocks: SopBlock[]): boolean {
  return blocks.some((b) => {
    switch (b.type) {
      case "steps":
      case "bullets":
        return b.items.some((i) => i.trim());
      case "table":
        return b.rows.length > 0;
      case "checklist":
        return b.items.some((i) => i.text.trim());
      case "image":
      case "attachment":
        return !!b.fileId;
      case "video":
        return !!(b.fileId || b.url);
      case "link":
        return !!b.url;
      default:
        return b.text.trim().length > 0;
    }
  });
}

export const sectionAnchor = (id: string) => `sec-${id}`;

/** Read-only rendering of an SOP body. A server component; only checklists are interactive islands. */
export default function SopDocument({
  content,
  sopId,
  files,
  canDownload,
  checklist,
  checklistInteractive,
}: {
  content: SopContent;
  sopId: string;
  files: DocFile[];
  canDownload: boolean;
  checklist: Record<string, boolean>;
  checklistInteractive: boolean;
}) {
  const fileMap = new Map(files.map((f) => [f.id, f]));
  const sections = content.sections.filter((s) => sectionHasContent(s.blocks));
  const core = [
    { id: "purpose", title: "Purpose", text: content.purpose },
    { id: "scope", title: "Scope", text: content.scope },
  ].filter((s) => s.text.trim());

  return (
    <div className="space-y-6">
      {content.description.trim() && <p className="text-sm text-muted-foreground">{content.description}</p>}
      {core.map((s) => (
        <section key={s.id} id={sectionAnchor(s.id)} className="scroll-mt-4 space-y-2">
          <h2 className="border-b border-border/50 pb-1 text-lg font-bold tracking-tight">{s.title}</h2>
          <SopMarkdown>{s.text}</SopMarkdown>
        </section>
      ))}
      {sections.map((s) => (
        <section key={s.id} id={sectionAnchor(s.id)} className="scroll-mt-4 space-y-3">
          <h2 className="border-b border-border/50 pb-1 text-lg font-bold tracking-tight">{s.title}</h2>
          {s.blocks.map((b) => (
            <Block key={b.id} block={b} sopId={sopId} files={fileMap} canDownload={canDownload} checklist={checklist} checklistInteractive={checklistInteractive} />
          ))}
        </section>
      ))}
      {core.length === 0 && sections.length === 0 && <p className="text-sm text-muted-foreground">This SOP has no content yet.</p>}
    </div>
  );
}

/** Table-of-contents entries for the same body. */
export function documentOutline(content: SopContent): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  if (content.purpose.trim()) out.push({ id: "purpose", title: "Purpose" });
  if (content.scope.trim()) out.push({ id: "scope", title: "Scope" });
  for (const s of content.sections) if (sectionHasContent(s.blocks)) out.push({ id: s.id, title: s.title });
  return out;
}
