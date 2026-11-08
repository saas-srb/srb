"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  REFERRAL_QUALIFYING_EVENTS,
  REFERRAL_QUALIFYING_EVENT_LABELS,
  REWARD_RULE_AUDIENCES,
  AUDIENCE_LABELS,
  isValidQualifyingEvent,
  isValidRewardRuleAudience,
  type ReferralQualifyingEvent,
  type RewardRuleAudience,
} from "@/lib/wallet/constants";
import { saveCampaignAction } from "@/app/(products)/sitecraft-ai/(protected)/wallet/campaigns/actions";
import type { SerializedReferralCampaign } from "@/lib/wallet/campaigns";

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

export default function CampaignForm({ campaign }: { campaign?: SerializedReferralCampaign }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState(campaign?.name ?? "");
  const [event, setEvent] = useState<ReferralQualifyingEvent>(campaign?.qualifyingEvent ?? "account_created");
  const [audience, setAudience] = useState<RewardRuleAudience>(campaign?.referrerAudience ?? "ALL");
  const [max, setMax] = useState(String(campaign?.maxReferralsPerReferrer ?? 50));
  const [startsAt, setStartsAt] = useState(day(campaign?.startsAt));
  const [endsAt, setEndsAt] = useState(day(campaign?.endsAt));
  const [active, setActive] = useState(campaign?.isActive ?? true);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const res = await saveCampaignAction(campaign?._id ?? null, {
        name,
        isActive: active,
        qualifyingEvent: event,
        referrerAudience: audience,
        maxReferralsPerReferrer: Number(max),
        startsAt: startsAt || null,
        endsAt: endsAt || null,
      });
      if (res?.error) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Campaign name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Festive Refer & Earn" />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Reward is released when…</Label>
          <Select value={event} onValueChange={(v) => isValidQualifyingEvent(v) && setEvent(v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{REFERRAL_QUALIFYING_EVENTS.map((e) => <SelectItem key={e} value={e}>{REFERRAL_QUALIFYING_EVENT_LABELS[e]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Who can refer</Label>
          <Select value={audience} onValueChange={(v) => isValidRewardRuleAudience(v) && setAudience(v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{REWARD_RULE_AUDIENCES.map((a) => <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Max referrals per person</Label>
          <Input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} required />
          {errors.maxReferralsPerReferrer && <p className="text-xs text-destructive">{errors.maxReferralsPerReferrer}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Starts (optional)</Label>
          <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          {errors.startsAt && <p className="text-xs text-destructive">{errors.startsAt}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Ends (optional)</Label>
          <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          {errors.endsAt && <p className="text-xs text-destructive">{errors.endsAt}</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Reward amounts per account type are set under Reward Rules. Once any campaign exists, referrals only work while one is active.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : campaign ? "Save changes" : "Create campaign"}</Button>
    </form>
  );
}
