"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import AiEditPanel from "@/components/doc-editor/ui/AiEditPanel";
import type { AiEditApi } from "@/lib/products/playbook-ai/ai/edit-types";
import { chatAcceptAction, chatApplyIssueAction, chatAskAction, chatLoadAction, chatRejectAction, chatReviewAction, chatSendAction, chatUndoAction } from "@/app/(products)/contractflow-ai/(protected)/clones/list-actions";

/** ContractFlow's AI tab: Edit (apply or suggest), Ask and Review, backed by the clone's versions. The page reloads after a change. */
export default function AiChatPanel({ cloneId, kind }: { cloneId: string; kind: string }) {
  const router = useRouter();
  const api = useMemo<AiEditApi>(() => ({
    load: () => chatLoadAction(cloneId), send: (f) => chatSendAction(cloneId, f), undo: (t) => chatUndoAction(cloneId, t),
    ask: (f) => chatAskAction(cloneId, f), review: () => chatReviewAction(cloneId), applyIssue: (i) => chatApplyIssueAction(cloneId, i),
    accept: (t, ix) => chatAcceptAction(cloneId, t, ix), reject: (t) => chatRejectAction(cloneId, t),
  }), [cloneId]);
  return <AiEditPanel api={api} documentId={cloneId} kind={kind} onApplied={() => router.refresh()} />;
}
