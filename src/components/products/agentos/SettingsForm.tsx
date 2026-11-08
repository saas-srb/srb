"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { saveSettingsAction } from "@/app/(products)/agentos/(protected)/actions";
import type { ModelPrice } from "@/lib/products/agentos/constants";

type Row = { id: string; label: string; input: string; output: string };

export default function SettingsForm({
  models,
  defaultModel,
  maxOutputTokens,
  dailyMessageLimit,
  generalInstructions,
}: {
  models: ModelPrice[];
  defaultModel: string;
  maxOutputTokens: number;
  dailyMessageLimit: number;
  generalInstructions: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(models.map((m) => ({ id: m.id, label: m.label, input: String(m.input), output: String(m.output) })));
  const [def, setDef] = useState(defaultModel);
  const [maxOut, setMaxOut] = useState(String(maxOutputTokens));
  const [daily, setDaily] = useState(String(dailyMessageLimit));
  const [general, setGeneral] = useState(generalInstructions);
  const [pending, start] = useTransition();
  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveSettingsAction({ models: rows, defaultModel: def, maxOutputTokens: maxOut, dailyMessageLimit: daily, generalInstructions: general });
          if (!res.ok) return void toast.error(res.error);
          toast.success("Settings saved");
          router.refresh();
        });
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="py-1 pr-2 font-semibold">OpenAI model id</th>
              <th className="px-2 py-1 font-semibold">Label</th>
              <th className="px-2 py-1 font-semibold">$ / 1M input</th>
              <th className="px-2 py-1 font-semibold">$ / 1M output</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-2"><Input value={r.id} onChange={(e) => patch(i, { id: e.target.value })} className="h-8 font-mono text-xs" aria-label="Model id" placeholder="gpt-4.1-mini" /></td>
                <td className="px-2 py-1"><Input value={r.label} onChange={(e) => patch(i, { label: e.target.value })} className="h-8" aria-label="Label" /></td>
                <td className="px-2 py-1"><Input type="number" min={0} step="0.01" value={r.input} onChange={(e) => patch(i, { input: e.target.value })} className="h-8 w-28" aria-label="Input price" /></td>
                <td className="px-2 py-1"><Input type="number" min={0} step="0.01" value={r.output} onChange={(e) => patch(i, { output: e.target.value })} className="h-8 w-28" aria-label="Output price" /></td>
                <td className="py-1 pl-2">
                  <Button type="button" size="icon-xs" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label={`Remove ${r.id}`}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { id: "", label: "", input: "0", output: "0" }])}>
        <Plus className="size-4" /> Add model
      </Button>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="s-def">Default model (new bots &amp; General Chat)</Label>
          <OptionSelect id="s-def" value={def} onChange={setDef} options={rows.filter((r) => r.id.trim()).map((r) => ({ value: r.id.trim(), label: r.label || r.id }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-max">Max output tokens per reply</Label>
          <Input id="s-max" type="number" min={256} max={32000} value={maxOut} onChange={(e) => setMaxOut(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-daily">Messages per user per day</Label>
          <Input id="s-daily" type="number" min={0} max={10000} value={daily} onChange={(e) => setDaily(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">0 = unlimited.</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-general">General Chat — instructions</Label>
        <Textarea id="s-general" rows={5} maxLength={20000} value={general} onChange={(e) => setGeneral(e.target.value)} className="font-mono text-xs" />
        <p className="text-[11px] text-muted-foreground">How the general assistant behaves. It has no knowledge base and runs on the default model above; changes apply to the next message in every general chat.</p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Save settings
        </Button>
      </div>
    </form>
  );
}
