"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, XCircle, AlertTriangle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { SCHEMA_TYPES, SCHEMA_LABEL, schemaTemplate, validateJsonLd, type SchemaType } from "@/lib/products/rankmax-ai/schema-validate";
import { saveSchemaAction, setSchemaStatusAction } from "@/app/(products)/rankmax-ai/(protected)/actions";

type Org = Parameters<typeof schemaTemplate>[1];

export default function SchemaEditor({
  id,
  initial,
  status,
  org,
  canEdit,
  pathOptions,
}: {
  id: string | null;
  initial: { name: string; type: SchemaType; path: string; source: string };
  status: "draft" | "published" | "disabled";
  org: Org;
  canEdit: boolean;
  pathOptions: string[];
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const result = useMemo(() => validateJsonLd(v.source, v.type), [v.source, v.type]);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  function save(thenPublish: boolean) {
    startTransition(async () => {
      const res = await saveSchemaAction(id, v);
      if (!res.ok) return void toast.error(res.error);
      if (thenPublish) {
        const pub = await setSchemaStatusAction(res.id, "published");
        if (!pub.ok) {
          toast.error(pub.error);
          router.push(`/rankmax-ai/schema/${res.id}`);
          return;
        }
        toast.success("Published — it's live on the matching page(s)");
      } else toast.success(res.errors ? `Saved as draft (${res.errors} error(s) to fix before publishing)` : "Saved");
      if (!id) router.push(`/rankmax-ai/schema/${res.id}`);
      else router.refresh();
    });
  }

  function setStatus(s: "published" | "draft" | "disabled") {
    startTransition(async () => {
      const res = await setSchemaStatusAction(id as string, s);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(s === "published" ? "Published" : s === "draft" ? "Unpublished" : "Disabled");
        router.refresh();
      }
    });
  }

  function format() {
    try {
      setV((x) => ({ ...x, source: JSON.stringify(JSON.parse(x.source), null, 2) }));
    } catch {
      toast.error("Fix the JSON syntax first.");
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <fieldset disabled={!canEdit || pending} className="space-y-4 rounded-2xl border border-border/40 bg-card/90 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="sc-name">Name</Label><Input id="sc-name" value={v.name} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} maxLength={120} placeholder="e.g. Web development service" /></div>
          <div className="space-y-1.5"><Label>Type</Label><OptionSelect value={v.type} onChange={(t) => setV((x) => ({ ...x, type: (t || "WebPage") as SchemaType }))} options={SCHEMA_TYPES.map((t) => ({ value: t, label: SCHEMA_LABEL[t] }))} aria-label="Schema type" /></div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-path">Applies to</Label>
            <Input id="sc-path" list="sc-paths" value={v.path} onChange={(e) => setV((x) => ({ ...x, path: e.target.value }))} placeholder="/services or * for every page" />
            <datalist id="sc-paths">
              <option value="*">Every public page</option>
              {pathOptions.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="sc-json">JSON-LD</Label>
            <div className="flex gap-1">
              <Button type="button" size="xs" variant="ghost" onClick={format}>Format</Button>
              <Button type="button" size="xs" variant="outline" onClick={() => setV((x) => ({ ...x, source: schemaTemplate(x.type, org) }))}><Wand2 className="size-3" data-icon="inline-start" />Insert {SCHEMA_LABEL[v.type]} template</Button>
            </div>
          </div>
          <Textarea id="sc-json" value={v.source} onChange={(e) => setV((x) => ({ ...x, source: e.target.value }))} rows={22} spellCheck={false} className="font-mono text-xs leading-relaxed" />
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => save(false)} disabled={pending || (!dirty && !!id)}>{pending ? <Loader2 className="size-4 animate-spin" /> : id ? "Save changes" : "Save draft"}</Button>
            {(status !== "published" || dirty) && <Button type="button" variant="outline" onClick={() => save(true)} disabled={pending || !result.valid}>Save & publish</Button>}
            {id && status === "published" && !dirty && <Button type="button" variant="outline" onClick={() => setStatus("draft")}>Unpublish</Button>}
            {id && status !== "disabled" && status !== "published" && <Button type="button" variant="ghost" onClick={() => setStatus("disabled")}>Disable</Button>}
          </div>
        )}
      </fieldset>
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/40 bg-card/90 p-4">
          <p className="mb-2 text-sm font-bold">Validation</p>
          {result.valid && result.warnings.length === 0 && <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="size-4" />Valid {result.types.join(", ")}</p>}
          {result.valid && result.warnings.length > 0 && <p className="mb-1 flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="size-4" />Valid — can be published</p>}
          <ul className="space-y-1 text-xs">
            {result.errors.map((e) => <li key={e} className="flex gap-1.5 text-rose-600"><XCircle className="mt-0.5 size-3.5 shrink-0" />{e}</li>)}
            {result.warnings.map((w) => <li key={w} className="flex gap-1.5 text-amber-600"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{w}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/90 p-4 text-xs text-muted-foreground">
          <p className="mb-1 text-sm font-bold text-foreground">How publishing works</p>
          Published JSON-LD is added to the matching public page(s) through the site layout, inside the server-rendered HTML crawlers read. Pages already emit some schema from code (Organization, WebSite, LocalBusiness on every page; Service, Article, Breadcrumb… on specific pages) — check “Detected on the site” before adding a duplicate type. Confirm rich-result eligibility with Google&apos;s Rich Results Test after publishing.
        </div>
      </div>
    </div>
  );
}
