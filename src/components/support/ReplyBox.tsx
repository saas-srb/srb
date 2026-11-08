"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { replyRequestAction } from "@/app/(products)/resolveiq/actions";
import { AttachmentPicker, useAttachments } from "@/components/support/attachments";

export default function ReplyBox({ requestId, closed, resolved }: { requestId: string; closed: boolean; resolved: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const files = useAttachments();
  const [pending, start] = useTransition();
  if (closed) return <p className="rounded-xl bg-muted/50 p-3 text-center text-xs text-muted-foreground">This request is closed. Please create a new request if you still need help.</p>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await replyRequestAction(requestId, body, files.items);
          if (!res.ok) { toast.error(res.error); return; }
          setBody("");
          files.reset();
          router.refresh();
        });
      }}
      className="space-y-2"
    >
      <textarea value={body} onChange={(e) => setBody(e.target.value)} onPaste={files.onPaste} rows={3} maxLength={5000} placeholder={resolved ? "Not solved? Reply to reopen this request…" : "Write a reply…"} className="w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
      <AttachmentPicker state={files} label="Attach file" />
      <Button type="submit" size="sm" disabled={pending || files.uploading > 0 || (!body.trim() && files.items.length === 0)}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {resolved ? "Reopen with reply" : "Send reply"}
      </Button>
    </form>
  );
}
