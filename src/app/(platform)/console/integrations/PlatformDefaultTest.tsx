"use client";

import { useState, useTransition } from "react";
import { Loader2, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testPlatformDefaultAction } from "./actions";

/** "Test connection" for a platform default: a read-only check of the saved values. */
export default function PlatformDefaultTest({ cardKey }: { cardKey: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" disabled={pending} onClick={() => { setResult(null); start(async () => setResult(await testPlatformDefaultAction(cardKey))); }}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Test connection
      </Button>
      <p className="text-xs text-muted-foreground">Checks the saved values. Read-only: nothing is sent or changed.</p>
      {result && <p role="status" className={`text-sm ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{result.message}</p>}
    </div>
  );
}
