"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SUPPORTED_CURRENCIES } from "@/lib/products/sprintos/constants";
import { savePmsSettingsAction } from "@/app/(products)/sprintos/(protected)/(staff)/settings/actions";

export default function PmsSettingsForm({
  categories,
  technologySuggestions,
  defaultCurrency,
}: {
  categories: string[];
  technologySuggestions: string[];
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cats, setCats] = useState(categories.join("\n"));
  const [techs, setTechs] = useState(technologySuggestions.join("\n"));
  const [currency, setCurrency] = useState(defaultCurrency);

  function save() {
    startTransition(async () => {
      const result = await savePmsSettingsAction({
        categories: cats,
        technologySuggestions: techs,
        defaultCurrency: currency,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save settings.");
        return;
      }
      toast.success("Settings saved");
      router.refresh();
    });
  }

  return (
    <GlassCard interactive={false}>
      <CardContent className="space-y-4 py-5">
        <div className="space-y-1.5">
          <Label>Project categories</Label>
          <p className="text-xs text-muted-foreground">One per line. Offered in the project form.</p>
          <Textarea value={cats} onChange={(e) => setCats(e.target.value)} rows={8} />
        </div>
        <div className="space-y-1.5">
          <Label>Technology suggestions</Label>
          <p className="text-xs text-muted-foreground">One per line. Quick-add chips in the project form.</p>
          <Textarea value={techs} onChange={(e) => setTechs(e.target.value)} rows={6} />
        </div>
        <div className="space-y-1.5">
          <Label>Default currency for new projects</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v ?? defaultCurrency)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Save settings"}
        </Button>
      </CardContent>
    </GlassCard>
  );
}
