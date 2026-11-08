"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  USAGE_MODULES,
  USAGE_MODULE_LABELS,
  REWARD_RULE_AUDIENCES,
  AUDIENCE_LABELS,
  isValidUsageModule,
  isValidRewardRuleAudience,
  type UsageModule,
  type RewardRuleAudience,
} from "@/lib/wallet/constants";
import { saveUsageRuleAction } from "@/app/(products)/sitecraft-ai/(protected)/wallet/usage-rules/actions";
import type { SerializedUsageRule } from "@/lib/wallet/usage-rules";

export default function UsageRuleForm({ rule }: { rule?: SerializedUsageRule }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [module, setModule] = useState<UsageModule>(rule?.module ?? "offers");
  const [role, setRole] = useState<RewardRuleAudience>(rule?.appliesToRole ?? "ALL");
  const [pct, setPct] = useState(String(rule?.maxPercentOfPrice ?? 100));
  const [maxCredits, setMaxCredits] = useState(rule?.maxCreditsPerTransaction ? String(rule.maxCreditsPerTransaction) : "");
  const [minOrder, setMinOrder] = useState(rule?.minOrderValue ? String(rule.minOrderValue) : "");
  const [enabled, setEnabled] = useState(rule?.isEnabled ?? true);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const res = await saveUsageRuleAction(rule?._id ?? null, {
        module,
        appliesToRole: role,
        isEnabled: enabled,
        maxPercentOfPrice: Number(pct),
        maxCreditsPerTransaction: maxCredits === "" ? null : Number(maxCredits),
        minOrderValue: minOrder === "" ? null : Number(minOrder),
      });
      if (res?.error) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Where credits can be used</Label>
          <Select value={module} onValueChange={(v) => isValidUsageModule(v) && setModule(v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{USAGE_MODULES.map((m) => <SelectItem key={m} value={m}>{USAGE_MODULE_LABELS[m]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Account type</Label>
          <Select value={role} onValueChange={(v) => isValidRewardRuleAudience(v) && setRole(v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{REWARD_RULE_AUDIENCES.map((a) => <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Max % of price payable by credits</Label>
          <Input type="number" min={1} max={100} value={pct} onChange={(e) => setPct(e.target.value)} required />
          {errors.maxPercentOfPrice && <p className="text-xs text-destructive">{errors.maxPercentOfPrice}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Max credits per use (optional)</Label>
          <Input type="number" min={0} value={maxCredits} onChange={(e) => setMaxCredits(e.target.value)} />
          {errors.maxCreditsPerTransaction && <p className="text-xs text-destructive">{errors.maxCreditsPerTransaction}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Minimum order value (optional)</Label>
          <Input type="number" min={0} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
          {errors.minOrderValue && <p className="text-xs text-destructive">{errors.minOrderValue}</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">An exact account-type rule beats an &quot;All account types&quot; rule. Festival Offers accepts credits by default; other modules stay closed until you enable them here.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Credits can be used</label>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : rule ? "Save changes" : "Create rule"}</Button>
    </form>
  );
}
