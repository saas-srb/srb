"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { updateApplicationNotesAction } from "../../actions";

export default function NotesEditor({ id, initialNotes }: { id: string; initialNotes: string }) {
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [isPending, startTransition] = useTransition();

  const dirty = notes !== savedNotes;

  function handleSave() {
    startTransition(async () => {
      const result = await updateApplicationNotesAction(id, notes);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSavedNotes(notes);
      toast.success("Notes saved");
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
        placeholder="Internal HR notes about this applicant…"
        className="resize-none"
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={handleSave} disabled={isPending || !dirty}>
          {isPending ? "Saving…" : "Save Notes"}
        </Button>
        {!dirty && notes.length > 0 && <span className="text-xs text-muted-foreground">Saved</span>}
      </div>
    </div>
  );
}
