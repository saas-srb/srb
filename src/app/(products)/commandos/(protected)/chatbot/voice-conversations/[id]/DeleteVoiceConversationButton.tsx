"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { deleteVoiceConversationAndRedirectAction } from "@/app/(products)/commandos/(protected)/chatbot/voice-conversations/actions";

export default function DeleteVoiceConversationButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="destructive" size="sm" disabled={isPending}>
            <Trash2 className="size-3.5" data-icon="inline-start" />
            Delete
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this voice conversation?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes every voice message, transcript and stored audio file for this session.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => startTransition(() => deleteVoiceConversationAndRedirectAction(id))}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
