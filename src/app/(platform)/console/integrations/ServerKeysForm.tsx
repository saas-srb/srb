"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Save, TriangleAlert } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CONFIG_SECTIONS } from "@/lib/platform/config/registry";
import type { ConfigView } from "@/lib/platform/config/store";
import { saveServerKeysAction } from "./actions";

const SOURCE_LABEL = { db: "saved here", env: "from the server environment", none: "not set" } as const;

/** One card per area (AI, voice, push, storage, upload safety). Blank = keep what is saved; "Remove" clears it. */
/** 32 random bytes, URL-safe (the browser's own generator; nothing is sent anywhere until Save). */
function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function ServerKeysForm({ view, canManage }: { view: ConfigView; canManage: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.values(view.fields).map((f) => [f.key, f.value])));
  const [cleared, setCleared] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const input: Record<string, string | { clear: true }> = {};
      for (const section of CONFIG_SECTIONS)
        for (const f of section.fields) {
          if (cleared[f.key]) input[f.key] = { clear: true };
          else if (f.secret) input[f.key] = values[f.key] ?? "";
          else if ((values[f.key] ?? "") !== view.fields[f.key].value) input[f.key] = values[f.key] ?? "";
        }
      const res = await saveServerKeysAction(input);
      if (res.ok) {
        setErrors({});
        setCleared({});
        setMessage({ ok: true, text: "Saved." });
        setValues((v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, CONFIG_SECTIONS.some((s) => s.fields.some((f) => f.key === k && f.secret)) ? "" : x])));
        router.refresh();
      } else {
        setErrors(res.errors);
        setMessage({ ok: false, text: "Fix the highlighted fields and save again." });
      }
    });

  return (
    <div className="space-y-4">
      {!view.encryptionConfigured && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> PLATFORM_ENCRYPTION_KEY isn&apos;t set on the server, so secret keys can&apos;t be saved until it is.
        </p>
      )}
      {CONFIG_SECTIONS.map((section) => (
        <GlassCard key={section.id} interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((f) => {
              const fv = view.fields[f.key];
              return (
                <div key={f.key} className="min-w-0 space-y-1.5">
                  <Label htmlFor={`cfg-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`cfg-${f.key}`}
                    type={f.secret && !(f.generate && values[f.key]) ? "password" : "text"}
                    value={cleared[f.key] ? "" : (values[f.key] ?? "")}
                    disabled={!canManage || cleared[f.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.secret && fv.saved ? `Saved — ends in ${fv.last4}. Leave blank to keep.` : f.placeholder}
                    autoComplete={f.secret ? "new-password" : "off"}
                    spellCheck={false}
                    className={f.secret ? "" : "font-mono"}
                  />
                  {f.generate && canManage && !cleared[f.key] && (
                    <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setValues((v) => ({ ...v, [f.key]: randomSecret() }))}>
                      Generate a strong value (shown once, copy it before you save)
                    </button>
                  )}
                  {errors[f.key] && <p className="text-xs text-destructive">{errors[f.key]}</p>}
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <KeyRound className="size-3" /> {SOURCE_LABEL[fv.source]}
                    {fv.unreadable && <span className="text-destructive"> — the saved value can&apos;t be decrypted, enter it again</span>}
                    {canManage && fv.saved && (
                      <label className="ml-2 inline-flex items-center gap-1">
                        <input type="checkbox" className="size-3.5 accent-primary" checked={!!cleared[f.key]} onChange={(e) => setCleared((c) => ({ ...c, [f.key]: e.target.checked }))} /> Remove
                      </label>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{f.help}</p>
                </div>
              );
            })}
          </CardContent>
        </GlassCard>
      ))}
      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save keys
          </Button>
          {message && <span role="status" className={`text-sm ${message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{message.text}</span>}
        </div>
      )}
    </div>
  );
}
