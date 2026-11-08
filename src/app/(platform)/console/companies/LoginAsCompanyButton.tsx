"use client";

import { useState, useTransition } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginAsCompanyAction } from "./login-as-actions";

/** "Login as company": opens the company's products in a new tab, signed in as its Director. */
export default function LoginAsCompanyButton({ companyId, companyName, size = "sm", variant = "outline", label = "Login as company" }: { companyId: string; companyName: string; size?: "sm" | "default"; variant?: "outline" | "default"; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function go() {
    setError(null);
    // Opened synchronously on the click (popup blockers allow that), pointed at the link once it is ready.
    const tab = window.open("", "_blank");
    start(async () => {
      const res = await loginAsCompanyAction(companyId);
      if (!res.ok) {
        tab?.close();
        setError(res.error);
        return;
      }
      if (tab) tab.location.href = res.url;
      else window.location.href = res.url;
    });
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" size={size} variant={variant} disabled={pending} onClick={go} title={`Open ${companyName}'s products as its Director`}>
        <LogIn className="size-3.5" data-icon="inline-start" /> {pending ? "Opening…" : label}
      </Button>
      {error && <span className="max-w-56 text-xs text-destructive">{error}</span>}
    </span>
  );
}
