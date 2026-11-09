"use client";

import { useMemo } from "react";
import VersionsPanel, { type VersionsApi } from "@/components/products/contractflow-ai/VersionsPanel";
import { compareVersionsAction, listVersionsAction, restoreVersionAction } from "@/app/(products)/contractflow-ai/(protected)/clones/list-actions";

/** The ContractFlow versions list bound to the clone's server actions. */
export default function CloneVersions({ cloneId, canRestore, onRestored }: { cloneId: string; canRestore: boolean; onRestored?: () => void }) {
  const api = useMemo<VersionsApi>(() => ({ list: () => listVersionsAction(cloneId), compare: (a, b) => compareVersionsAction(cloneId, a, b), restore: (n) => restoreVersionAction(cloneId, n) }), [cloneId]);
  return <VersionsPanel api={api} canRestore={canRestore} onRestored={onRestored} />;
}
