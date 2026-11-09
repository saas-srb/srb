"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import AiEditPanel from "@/components/doc-editor/ui/AiEditPanel";
import type { AiEditApi } from "@/lib/products/playbook-ai/ai/edit-types";
import { pbAcceptAction, pbApplyIssueAction, pbChatAskAction, pbChatLoadAction, pbChatSendAction, pbChatUndoAction, pbRejectAction, pbReviewAction } from "@/app/(products)/playbook-ai/(protected)/items-actions";

/** Playbook's AI tab: Edit (apply or suggest), Ask and Review, each turn saved as a version of the draft. */
export default function PlaybookAiPanel({ documentId, kind }: { documentId: string; kind: string }) {
  const router = useRouter();
  const api = useMemo<AiEditApi>(() => ({
    load: () => pbChatLoadAction(documentId), send: (f) => pbChatSendAction(documentId, f), undo: (t) => pbChatUndoAction(documentId, t),
    ask: (f) => pbChatAskAction(documentId, f), review: () => pbReviewAction(documentId), applyIssue: (i) => pbApplyIssueAction(documentId, i),
    accept: (t, ix) => pbAcceptAction(documentId, t, ix), reject: (t) => pbRejectAction(documentId, t),
  }), [documentId]);
  return <AiEditPanel api={api} documentId={documentId} kind={kind} onApplied={() => router.refresh()} />;
}
