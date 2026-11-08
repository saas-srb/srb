"use client";

import { useActionState } from "react";
import { Loader2, Check } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { saveMessengerSettingsAction, type SettingsState } from "@/app/(products)/huddle-ai/(protected)/settings/actions";

const initial: SettingsState = {};

export default function SettingsForm({
  displayName,
  email,
  soundEnabled,
  presenceDefault,
}: {
  displayName: string;
  email: string;
  soundEnabled: boolean;
  presenceDefault: string;
}) {
  const [state, formAction, pending] = useActionState(saveMessengerSettingsAction, initial);

  return (
    <form action={formAction}>
      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle>Profile &amp; preferences</CardTitle>
          <CardDescription>How you appear to teammates, and how Messenger behaves for you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" name="displayName" defaultValue={displayName} minLength={2} maxLength={60} required />
            <p className="text-xs text-muted-foreground">Signed in as {email}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Default status when you sign in</Label>
            <Select name="presenceDefault" defaultValue={presenceDefault}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="away">Away</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
                <SelectItem value="in_meeting">In a meeting</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" name="soundEnabled" defaultChecked={soundEnabled} className="accent-primary" />
            Play a sound for new messages and mentions
          </label>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
              Save changes
            </Button>
            {state?.ok && (
              <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <Check className="size-4" /> Saved
              </span>
            )}
            {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
          </div>
        </CardContent>
      </GlassCard>
    </form>
  );
}
