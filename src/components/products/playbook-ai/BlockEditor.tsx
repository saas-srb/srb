"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { BLOCK_TYPES, fileUrl, type SopBlock } from "@/lib/products/playbook-ai/constants";
import { cn } from "@/lib/utils";

export interface EditorFile {
  id: string;
  filename: string;
  size: number;
  kind: "image" | "video" | "document";
}

export interface UploadFn {
  (file: File): Promise<EditorFile | null>;
}

const newId = () => globalThis.crypto.randomUUID();

export function newBlock(type: SopBlock["type"]): SopBlock {
  const id = newId();
  switch (type) {
    case "paragraph":
      return { id, type, text: "" };
    case "heading":
      return { id, type, text: "", level: 2 };
    case "steps":
    case "bullets":
      return { id, type, items: [""] };
    case "table":
      return { id, type, header: ["Column 1", "Column 2"], rows: [["", ""]] };
    case "checklist":
      return { id, type, title: "", items: [{ id: newId(), text: "" }] };
    case "image":
      return { id, type, fileId: "", alt: "", caption: "" };
    case "video":
      return { id, type, fileId: null, url: null, caption: "" };
    case "attachment":
      return { id, type, fileId: "", label: "" };
    case "link":
      return { id, type, url: "", label: "", description: "" };
    default:
      return { id, type, text: "" };
  }
}

const ACCEPT: Record<string, string> = { image: ".png,.jpg,.jpeg,.webp,.gif", video: ".mp4,.webm", document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt" };

function ListEditor({ items, onChange, placeholder, label }: { items: string[]; onChange: (n: string[]) => void; placeholder: string; label: string }) {
  const set = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const n = [...items];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <div className="space-y-1.5">
      {items.map((t, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="mt-1.5 w-5 shrink-0 text-right text-xs text-muted-foreground">{label === "steps" ? `${i + 1}.` : "•"}</span>
          <Textarea value={t} rows={1} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} className="min-h-8 flex-1 resize-y py-1.5" aria-label={`${label} item ${i + 1}`} />
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down"><ArrowDown /></Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => onChange(items.filter((_, j) => j !== i))} disabled={items.length === 1} aria-label="Remove item"><X /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="xs" onClick={() => onChange([...items, ""])}>
        <Plus data-icon="inline-start" />
        Add {label === "steps" ? "step" : "item"}
      </Button>
    </div>
  );
}

/** Checklist rows keep their ids when reordered, so people's saved ticks stay attached to the right item. */
function ChecklistItems({ items, onChange }: { items: { id: string; text: string }[]; onChange: (n: { id: string; text: string }[]) => void }) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const n = [...items];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={it.id} className="flex items-start gap-1.5">
          <span className="mt-1.5 w-5 shrink-0 text-right text-xs text-muted-foreground">☐</span>
          <Textarea value={it.text} rows={1} placeholder="Checklist item…" onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))} className="min-h-8 flex-1 resize-y py-1.5" aria-label={`Checklist item ${i + 1}`} />
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down"><ArrowDown /></Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => onChange(items.filter((x) => x.id !== it.id))} disabled={items.length === 1} aria-label="Remove item"><X /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="xs" onClick={() => onChange([...items, { id: newId(), text: "" }])}>
        <Plus data-icon="inline-start" />
        Add item
      </Button>
    </div>
  );
}

function FilePicker({
  kind,
  files,
  value,
  onSelect,
  onUpload,
}: {
  kind: EditorFile["kind"];
  files: EditorFile[];
  value: string | null;
  onSelect: (id: string) => void;
  onUpload: UploadFn;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const options = files.filter((f) => f.kind === kind).map((f) => ({ value: f.id, label: f.filename }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-48 flex-1">
        <OptionSelect value={value ?? ""} onChange={onSelect} options={options} noneLabel={options.length ? "Choose an uploaded file…" : "No files uploaded yet"} aria-label={`Choose ${kind}`} />
      </div>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ACCEPT[kind]}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          const up = await onUpload(file);
          setBusy(false);
          if (up) onSelect(up.id);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Upload className="size-3.5" data-icon="inline-start" />}
        Upload
      </Button>
    </div>
  );
}

/** Edits one content block. Pure controlled component — the parent owns the block list. */
export default function BlockEditor({
  block,
  onChange,
  files,
  onUpload,
  onMove,
  onRemove,
  canMoveUp,
  canMoveDown,
}: {
  block: SopBlock;
  onChange: (b: SopBlock) => void;
  files: EditorFile[];
  onUpload: UploadFn;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const meta = BLOCK_TYPES.find((t) => t.value === block.type);
  const tone =
    block.type === "warning" ? "border-amber-500/40 bg-amber-500/5" : block.type === "note" ? "border-blue-500/30 bg-blue-500/5" : block.type === "example" ? "border-emerald-500/30 bg-emerald-500/5" : block.type === "reference" ? "border-purple-500/30 bg-purple-500/5" : "border-border/60 bg-background/60";

  let body: React.ReactNode = null;
  switch (block.type) {
    case "paragraph":
    case "note":
    case "warning":
    case "example":
    case "reference":
      body = (
        <Textarea
          value={block.text}
          rows={block.type === "paragraph" ? 4 : 3}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="Write here. Markdown is supported: **bold**, *italic*, lists, [links](https://…), `code`."
          aria-label={`${meta?.label} text`}
          className="resize-y"
        />
      );
      break;
    case "heading":
      body = (
        <div className="flex gap-2">
          <Input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="Heading text" aria-label="Heading text" />
          <div className="w-32 shrink-0">
            <OptionSelect value={String(block.level)} onChange={(v) => onChange({ ...block, level: v === "3" ? 3 : 2 })} options={[{ value: "2", label: "Large" }, { value: "3", label: "Small" }]} aria-label="Heading size" />
          </div>
        </div>
      );
      break;
    case "steps":
    case "bullets":
      body = <ListEditor items={block.items} onChange={(items) => onChange({ ...block, items })} label={block.type} placeholder={block.type === "steps" ? "Describe this step…" : "List item…"} />;
      break;
    case "table": {
      const cols = block.header.length;
      const setCell = (r: number, c: number, v: string) => onChange({ ...block, rows: block.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
      body = (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  {block.header.map((h, c) => (
                    <th key={c} className="min-w-32">
                      <div className="flex gap-1">
                        <Input value={h} onChange={(e) => onChange({ ...block, header: block.header.map((x, j) => (j === c ? e.target.value : x)) })} className="h-8 font-semibold" aria-label={`Column ${c + 1} header`} />
                        <Button type="button" variant="ghost" size="icon-xs" disabled={cols <= 1} aria-label="Remove column" onClick={() => onChange({ ...block, header: block.header.filter((_, j) => j !== c), rows: block.rows.map((r) => r.filter((_, j) => j !== c)) })}><X /></Button>
                      </div>
                    </th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c}><Input value={cell} onChange={(e) => setCell(r, c, e.target.value)} className="h-8" aria-label={`Row ${r + 1}, column ${c + 1}`} /></td>
                    ))}
                    <td><Button type="button" variant="ghost" size="icon-xs" aria-label="Remove row" onClick={() => onChange({ ...block, rows: block.rows.filter((_, i) => i !== r) })}><X /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="xs" onClick={() => onChange({ ...block, rows: [...block.rows, Array(cols).fill("")] })}><Plus data-icon="inline-start" />Row</Button>
            <Button type="button" variant="outline" size="xs" disabled={cols >= 12} onClick={() => onChange({ ...block, header: [...block.header, `Column ${cols + 1}`], rows: block.rows.map((r) => [...r, ""]) })}><Plus data-icon="inline-start" />Column</Button>
          </div>
        </div>
      );
      break;
    }
    case "checklist":
      body = (
        <div className="space-y-2">
          <Input value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Checklist title (optional)" aria-label="Checklist title" />
          <ChecklistItems items={block.items} onChange={(items) => onChange({ ...block, items })} />
          <p className="text-[11px] text-muted-foreground">Employees tick these off; progress is saved per person.</p>
        </div>
      );
      break;
    case "image": {
      const f = files.find((x) => x.id === block.fileId);
      body = (
        <div className="space-y-2">
          <FilePicker kind="image" files={files} value={block.fileId} onSelect={(id) => onChange({ ...block, fileId: id })} onUpload={onUpload} />
          {block.fileId && f && (
            // eslint-disable-next-line @next/next/no-img-element -- private authenticated route
            <img src={fileUrl(block.fileId)} alt={block.alt || f.filename} className="max-h-48 rounded-lg border border-border/50" />
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} placeholder="Alt text (describe the image)" aria-label="Alt text" />
            <Input value={block.caption} onChange={(e) => onChange({ ...block, caption: e.target.value })} placeholder="Caption (optional)" aria-label="Caption" />
          </div>
        </div>
      );
      break;
    }
    case "video":
      body = (
        <div className="space-y-2">
          <FilePicker kind="video" files={files} value={block.fileId} onSelect={(id) => onChange({ ...block, fileId: id || null, url: id ? null : block.url })} onUpload={onUpload} />
          <Input value={block.url ?? ""} onChange={(e) => onChange({ ...block, url: e.target.value || null, fileId: e.target.value ? null : block.fileId })} placeholder="…or paste an https:// video link" aria-label="Video link" />
          <Input value={block.caption} onChange={(e) => onChange({ ...block, caption: e.target.value })} placeholder="Caption (optional)" aria-label="Caption" />
        </div>
      );
      break;
    case "attachment":
      body = (
        <div className="space-y-2">
          <FilePicker kind="document" files={files} value={block.fileId} onSelect={(id) => onChange({ ...block, fileId: id })} onUpload={onUpload} />
          <Input value={block.label} onChange={(e) => onChange({ ...block, label: e.target.value })} placeholder="Label shown to readers (defaults to the file name)" aria-label="Attachment label" />
        </div>
      );
      break;
    case "link":
      body = (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="https://… or /playbook-ai/library/…" aria-label="Link URL" />
          <Input value={block.label} onChange={(e) => onChange({ ...block, label: e.target.value })} placeholder="Link text" aria-label="Link text" />
          <Input value={block.description} onChange={(e) => onChange({ ...block, description: e.target.value })} placeholder="Short description (optional)" aria-label="Link description" className="sm:col-span-2" />
        </div>
      );
      break;
  }

  return (
    <div className={cn("rounded-xl border p-3", tone)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{meta?.label}</span>
        <span className="flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label="Move block up"><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label="Move block down"><ArrowDown /></Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={onRemove} aria-label="Delete block"><Trash2 /></Button>
        </span>
      </div>
      {body}
    </div>
  );
}
