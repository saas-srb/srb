"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import type { LeadCategoryConfig } from "@/lib/lead-categories";
import { saveLeadCategoriesAction } from "@/app/(products)/sitecraft-ai/(protected)/forms/actions";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

interface Row { slug: string; label: string; acceptsResume: boolean; subs: string; }

const toRows = (cats: LeadCategoryConfig[]): Row[] => cats.map((c) => ({ slug: c.slug, label: c.label, acceptsResume: c.acceptsResume, subs: c.subServices.map((s) => s.label).join("\n") }));

/** What visitors can ask about on the contact form: the company's own services, each with optional sub-services. */
export default function LeadCategoriesEditor({ initial, canEdit }: { initial: LeadCategoryConfig[]; canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>(toRows(initial));
  const [pending, startTransition] = useTransition();
  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, n) => (n === i ? { ...x, ...p } : x)));

  const save = () => {
    const categories: LeadCategoryConfig[] = rows
      .filter((r) => r.label.trim())
      .map((r) => {
        const old = initial.find((c) => c.slug === r.slug);
        const seen = new Set<string>();
        const subServices = r.subs.split("\n").map((l) => l.trim()).filter(Boolean).flatMap((label) => {
          // Keep an existing sub-service's slug (saved leads refer to it); a new one gets its slug from its label.
          const slug = old?.subServices.find((s) => s.label === label)?.slug ?? slugify(label);
          if (!slug || seen.has(slug)) return [];
          seen.add(slug);
          return [{ slug, label }];
        });
        return { slug: r.slug || slugify(r.label), label: r.label.trim(), acceptsResume: r.acceptsResume, subServices };
      });
    startTransition(async () => {
      const res = await saveLeadCategoriesAction(categories);
      if (!res.ok) return void toast.error(res.error);
      setRows(toRows(res.categories));
      toast.success("Saved");
    });
  };

  return (
    <div className="mt-6 space-y-4">
      <div>
        <h2 className="text-base font-bold text-foreground">What visitors can enquire about</h2>
        <p className="text-sm text-muted-foreground">Your services, as the contact form and the home page enquiry form list them. With one entry (or none) the service choice is not shown at all and the form asks only for the person&apos;s details and message.</p>
      </div>
      {rows.map((r, i) => (
        <GlassCard key={i} className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`lc-${i}-label`}>Service name</Label>
              <Input id={`lc-${i}-label`} value={r.label} onChange={(e) => patch(i, { label: e.target.value })} disabled={!canEdit} placeholder="e.g. Interior design" />
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={r.acceptsResume} onCheckedChange={(v) => patch(i, { acceptsResume: v === true })} disabled={!canEdit} />Asks for a CV / file instead of a message</label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`lc-${i}-subs`}>Specific services (one per line, optional)</Label>
            <textarea id={`lc-${i}-subs`} rows={3} value={r.subs} onChange={(e) => patch(i, { subs: e.target.value })} disabled={!canEdit} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" placeholder={"Kitchen\nBedroom"} />
          </div>
          {canEdit && <Button type="button" variant="ghost" size="sm" onClick={() => setRows((x) => x.filter((_, n) => n !== i))}><Trash2 className="size-3.5" />Remove</Button>}
        </GlassCard>
      ))}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setRows((x) => [...x, { slug: "", label: "", acceptsResume: false, subs: "" }])}><Plus className="size-3.5" />Add service</Button>
          <Button onClick={save} disabled={pending}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save services</Button>
        </div>
      )}
    </div>
  );
}
