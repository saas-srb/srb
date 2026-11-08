"use client";

import { useState } from "react";
import { CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  IMPORT_DEFS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_TYPES,
  autoMap,
  parseCsv,
  type ColumnMapping,
  type ImportFailure,
  type ImportOutcome,
  type ImportPreview,
  type ImportRowIssue,
  type ImportType,
} from "@/lib/platform/import/shared";

const selectClass =
  "h-9 w-full min-w-0 rounded-xl border border-border/50 bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

interface Loaded {
  name: string;
  csv: string;
  headers: string[];
  rowCount: number;
}

function Issues({ title, tone, items, id }: { title: string; tone: "red" | "amber"; items: ImportRowIssue[]; id: string }) {
  if (items.length === 0) return null;
  return (
    <div id={id} className={cn("rounded-xl border p-3", tone === "red" ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5")}>
      <p className="text-sm font-medium">
        {title} ({items.length})
      </p>
      <ul className="mt-1.5 max-h-56 space-y-1 overflow-y-auto text-xs">
        {items.slice(0, 200).map((it) => (
          <li key={it.line} className="break-words" data-line={it.line}>
            <span className="font-medium">Line {it.line}:</span> {it.messages.join(" ")}
          </li>
        ))}
        {items.length > 200 && <li className="text-muted-foreground">…and {items.length - 200} more.</li>}
      </ul>
    </div>
  );
}

/** Settings → Import: choose a type, upload a CSV, check the column mapping, preview, import. */
export default function ImportWizard({ leadTypes }: { leadTypes: { value: string; label: string }[] }) {
  const [type, setType] = useState<ImportType>("leads");
  const [file, setFile] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [leadType, setLeadType] = useState("client");
  const [sendInvites, setSendInvites] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const def = IMPORT_DEFS[type];

  function reset(nextType: ImportType = type) {
    setType(nextType);
    setFile(null);
    setMapping({});
    setPreview(null);
    setOutcome(null);
    setError(null);
    setSendInvites(false);
  }

  async function onFile(f: File | undefined) {
    setPreview(null);
    setOutcome(null);
    setError(null);
    setFile(null);
    if (!f) return;
    if (f.size > IMPORT_MAX_BYTES) return setError("The file is larger than 2 MB. Split it into smaller files.");
    const csv = await f.text();
    const table = parseCsv(csv);
    if (table.length < 2) return setError("The file needs a header row and at least one row of data.");
    if (table.length - 1 > IMPORT_MAX_ROWS) return setError(`The file has ${(table.length - 1).toLocaleString("en-IN")} rows; the limit is ${IMPORT_MAX_ROWS.toLocaleString("en-IN")} per file.`);
    setFile({ name: f.name, csv, headers: table[0], rowCount: table.length - 1 });
    setMapping(autoMap(type, table[0]));
  }

  async function send(dryRun: boolean) {
    if (!file) return;
    setBusy(dryRun ? "preview" : "import");
    setError(null);
    try {
      const res = await fetch("/commandos/settings/import/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, csv: file.csv, mapping, dryRun, leadType, sendInvites }),
      });
      const data = (await res.json()) as ImportPreview | ImportOutcome | ImportFailure;
      if (!data.ok) setError(data.error);
      else if (dryRun) setPreview(data);
      else {
        setOutcome(data as ImportOutcome);
        setPreview(null);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const changeMapping = (key: string, idx: number) => {
    setMapping((m) => ({ ...m, [key]: idx }));
    setPreview(null);
  };

  if (outcome) {
    return (
      <div className="space-y-4" id="import-result">
        <p className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>
            Imported <strong id="import-created">{outcome.created}</strong> of {outcome.total} {def.label.toLowerCase()}.
            {outcome.duplicates.length > 0 && ` ${outcome.duplicates.length} duplicate${outcome.duplicates.length === 1 ? "" : "s"} skipped.`}
            {outcome.errors.length > 0 && ` ${outcome.errors.length} row${outcome.errors.length === 1 ? "" : "s"} had errors.`}
            {outcome.invited > 0 && ` ${outcome.invited} invitation${outcome.invited === 1 ? "" : "s"} sent.`}
          </span>
        </p>
        <Issues id="import-result-errors" title="Rows with errors (not imported)" tone="red" items={[...outcome.errors, ...outcome.failed]} />
        <Issues id="import-result-duplicates" title="Duplicates (skipped)" tone="amber" items={outcome.duplicates} />
        <Issues id="import-result-invites" title="Created, but not invited" tone="amber" items={outcome.inviteIssues} />
        <Button type="button" variant="outline" onClick={() => reset()}>
          Import another file
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>1. What are you importing?</Label>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What to import">
          {IMPORT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              id={`import-type-${t}`}
              onClick={() => reset(t)}
              className={cn("rounded-xl border p-3 text-left transition-colors", type === t ? "border-primary bg-primary/5" : "bg-background/60 hover:border-primary/40")}
            >
              <span className="block text-sm font-medium">{IMPORT_DEFS[t].label}</span>
              <span className="block text-xs text-muted-foreground">{IMPORT_DEFS[t].description}</span>
            </button>
          ))}
        </div>
        <a href={`/commandos/settings/import/sample?type=${type}`} id="import-sample" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline" download>
          <Download className="size-3.5" /> Download a sample {def.label.toLowerCase()} CSV
        </a>
      </div>

      <div className="space-y-2">
        <Label htmlFor="import-file">2. Choose your CSV file</Label>
        <input
          key={type}
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void onFile(e.target.files?.[0])}
          className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
        />
        <p className="text-xs text-muted-foreground">
          Up to {IMPORT_MAX_ROWS.toLocaleString("en-IN")} rows and 2 MB per file. The first row must be the column names.
          {file && ` ${file.name}: ${file.rowCount} row${file.rowCount === 1 ? "" : "s"}.`}
        </p>
      </div>

      {file && (
        <div className="space-y-2">
          <Label>3. Match your columns</Label>
          <div className="grid gap-2 sm:grid-cols-2" id="import-mapping">
            {def.fields.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label htmlFor={`import-map-${f.key}`} className="text-xs font-medium text-muted-foreground">
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </label>
                <select id={`import-map-${f.key}`} className={selectClass} value={mapping[f.key] ?? -1} onChange={(e) => changeMapping(f.key, Number(e.target.value))}>
                  <option value={-1}>{f.required ? "Choose a column" : "Not in my file"}</option>
                  {file.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {type === "leads" && (
            <div className="flex flex-col gap-1 sm:max-w-xs">
              <label htmlFor="import-lead-type" className="text-xs font-medium text-muted-foreground">
                These leads are
              </label>
              <select
                id="import-lead-type"
                className={selectClass}
                value={leadType}
                onChange={(e) => {
                  setLeadType(e.target.value);
                  setPreview(null);
                }}
              >
                {leadTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {type === "employees" && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                id="import-send-invites"
                className="mt-0.5 size-4 accent-[var(--primary)]"
                checked={sendInvites}
                onChange={(e) => {
                  setSendInvites(e.target.checked);
                  setPreview(null);
                }}
              />
              <span>
                Also email each employee an invitation to sign in
                <span className="block text-xs text-muted-foreground">Each invitation uses one user seat on your plan. Leave this off to add them as records only.</span>
              </span>
            </label>
          )}
        </div>
      )}

      {error && (
        <p id="import-error" role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {preview && (
        <div className="space-y-3" id="import-preview">
          <p className="rounded-lg bg-muted px-3 py-2 text-sm" role="status">
            <strong id="import-valid">{preview.valid}</strong> of {preview.total} rows are ready to import
            {preview.errors.length > 0 && `, ${preview.errors.length} with errors`}
            {preview.duplicates.length > 0 && `, ${preview.duplicates.length} duplicate${preview.duplicates.length === 1 ? "" : "s"}`}. Nothing has been saved yet.
          </p>
          {preview.notes.map((n) => (
            <p key={n} className="text-xs text-muted-foreground">
              {n}
            </p>
          ))}
          <Issues id="import-preview-errors" title="Rows with errors (won't be imported)" tone="red" items={preview.errors} />
          <Issues id="import-preview-duplicates" title="Duplicates (will be skipped)" tone="amber" items={preview.duplicates} />
        </div>
      )}

      {file && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={preview ? "outline" : "default"} id="import-preview-button" disabled={busy !== null} onClick={() => void send(true)}>
            {busy === "preview" ? <Loader2 className="size-4 animate-spin" /> : null} {preview ? "Check again" : "4. Preview"}
          </Button>
          {preview && preview.valid > 0 && (
            <Button type="button" id="import-run-button" disabled={busy !== null} onClick={() => void send(false)}>
              {busy === "import" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Import {preview.valid} {preview.valid === 1 ? "row" : "rows"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
