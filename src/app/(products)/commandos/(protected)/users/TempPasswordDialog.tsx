"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export default function TempPasswordDialog({
  info,
  onClose,
}: {
  info: { email: string; tempPassword: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!info) return;
    await navigator.clipboard.writeText(info.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <AlertDialog open={info !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Temporary password</AlertDialogTitle>
          <AlertDialogDescription>
            Share this with {info?.email} outside this screen. It won&apos;t be shown again — they&apos;ll be
            required to set a new password on first sign-in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <code className="flex-1 truncate font-mono text-sm">{info?.tempPassword}</code>
          <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label="Copy password">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Done</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
