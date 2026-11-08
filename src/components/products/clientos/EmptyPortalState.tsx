import { Inbox } from "lucide-react";

import { brandify } from "@/lib/brand";
export default function EmptyPortalState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-accent text-white">
        <Inbox className="size-6" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{brandify(title)}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{brandify(body)}</p>
    </div>
  );
}
