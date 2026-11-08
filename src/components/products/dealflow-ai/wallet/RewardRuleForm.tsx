"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  REWARD_RULE_TYPES,
  REWARD_RULE_TYPE_LABELS,
  REWARD_RULE_AUDIENCES,
  AUDIENCE_LABELS,
  EARN_WAY_META,
  isValidRewardRuleType,
  isValidRewardRuleAudience,
  type RewardRuleType,
  type RewardRuleAudience,
} from "@/lib/wallet/constants";
import { saveRewardRuleAction } from "@/app/(products)/sitecraft-ai/(protected)/wallet/rules/actions";
import type { SerializedRewardRule } from "@/lib/wallet/reward-rules";

export default function RewardRuleForm({ rule }: { rule?: SerializedRewardRule }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [type, setType] = useState<RewardRuleType>(rule?.type ?? "signup");
  const [role, setRole] = useState<RewardRuleAudience>(rule?.appliesToRole ?? "ALL");
  const [amount, setAmount] = useState(String(rule?.amount ?? ""));
  const [expires, setExpires] = useState(rule?.expiresInDays ? String(rule.expiresInDays) : "");
  const [active, setActive] = useState(rule?.isActive ?? true);
  const [subKey, setSubKey] = useState(rule?.subKey ?? "");
  const subLabel = EARN_WAY_META[type].subKeyLabel;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const res = await saveRewardRuleAction(rule?._id ?? null, {
        type,
        appliesToRole: role,
        amount: Number(amount),
        expiresInDays: expires === "" ? null : Number(expires),
        isActive: active,
        subKey: subLabel ? subKey : null,
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
          <Label>Reward type</Label>
          <Select value={type} onValueChange={(v) => isValidRewardRuleType(v) && setType(v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REWARD_RULE_TYPES.map((t) => <SelectItem key={t} value={t}>{REWARD_RULE_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Applies to (the person receiving the credits)</Label>
          <Select value={role} onValueChange={(v) => isValidRewardRuleAudience(v) && setRole(v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REWARD_RULE_AUDIENCES.map((a) => <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Credits (0 disables the reward for this role)</Label>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} required />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Expires after (days, blank = never)</Label>
          <Input type="number" min={1} value={expires} onChange={(e) => setExpires(e.target.value)} />
          {errors.expiresInDays && <p className="text-xs text-destructive">{errors.expiresInDays}</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{EARN_WAY_META[type].description}</p>
      {subLabel && (
        <div className="space-y-1.5">
          <Label>{subLabel}</Label>
          <Input value={subKey} onChange={(e) => setSubKey(e.target.value)} placeholder={type === "stage_complete" ? "e.g. batch_assigned" : "e.g. 5"} />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : rule ? "Save changes" : "Create rule"}
      </Button>
    </form>
  );
}
