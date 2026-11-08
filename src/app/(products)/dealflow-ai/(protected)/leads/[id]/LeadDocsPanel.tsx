"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, Upload, Trash2 } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { shareLeadDocumentAction, deleteLeadDocumentAction } from "../actions";
import type { StaffDocRow } from "@/lib/products/clientos/documents";

const CATEGORIES = ["Offer Letter", "Internship Letter", "Training Letter", "NDA", "Proposal", "Invoice", "Certificate", "General"];

function size(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function LeadDocsPanel({ leadId, docs }: { leadId: string; docs: StaffDocRow[] }) {
  const [category, setCategory] = useState("Offer Letter");
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return void toast.error("Choose a file first.");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("category", category);
    start(async () => {
      const res = await shareLeadDocumentAction(leadId, fd);
      if (res.error) return void toast.error(res.error);
      toast.success("Shared — the person has been notified.");
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <GlassCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" /> Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input ref={fileRef} type="file" className="max-w-[200px] text-xs" />
          <Button size="sm" onClick={upload} disabled={pending}>
            <Upload className="size-3.5" /> Share
          </Button>
        </div>

        <div className="space-y-1.5">
          {docs.length === 0 && <p className="text-sm text-muted-foreground">Nothing shared yet.</p>}
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">{d.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {d.category} · {size(d.size)} · {new Date(d.sharedOn).toLocaleDateString()}
                </span>
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await deleteLeadDocumentAction(leadId, d.id);
                    if (res.error) toast.error(res.error);
                  })
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </GlassCard>
  );
}
