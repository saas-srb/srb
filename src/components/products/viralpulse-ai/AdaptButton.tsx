"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { duplicateAdAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import { PLATFORM_META, type AdPlatform } from "@/lib/products/viralpulse-ai/constants";

/** Duplicate an ad onto another of the campaign's platforms and let OpenAI adapt the copy. */
export default function AdaptButton({ campaignId, adId, platforms, current, canGenerate }: { campaignId: string; adId: string; platforms: AdPlatform[]; current: AdPlatform; canGenerate: boolean }) {
  const router = useRouter();
  const others = platforms.filter((x) => x !== current);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>(others[0] ?? "");
  const [pending, start] = useTransition();
  if (others.length === 0) return null;
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><Shuffle className="size-3.5" /> Adapt to platform</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a platform version</DialogTitle>
            <DialogDescription>{canGenerate ? "Copies this ad to another platform and has OpenAI rewrite it for that platform's limits and conventions." : "Copies this ad to another platform for you to rewrite."}</DialogDescription>
          </DialogHeader>
          <OptionSelect value={target} onChange={setTarget} options={others.map((x) => ({ value: x, label: PLATFORM_META[x].label }))} aria-label="Target platform" />
          <DialogFooter>
            <Button type="button" disabled={pending || !target} onClick={() => start(async () => {
              const res = await duplicateAdAction(campaignId, adId, target);
              if (!res.ok) return void toast.error(res.error);
              toast.success(res.adapted ? "Platform version created and adapted by AI." : "Platform version created.");
              setOpen(false);
              router.push(`/viralpulse-ai/campaigns/${campaignId}/ads/${res.id}`);
            })}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Shuffle className="size-4" />} {pending ? "Adapting…" : "Create version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
