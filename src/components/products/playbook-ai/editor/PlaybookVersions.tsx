"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import VersionsPanel, { type VersionsApi } from "@/components/products/contractflow-ai/VersionsPanel";
import { pbCompareAction, pbRestoreAction, pbVersionsAction } from "@/app/(products)/playbook-ai/(protected)/items-actions";

/** The Versions tab of the Playbook editor: list, compare any two, restore (a restore is a new version). */
export default function PlaybookVersions({ documentId, canRestore }: { documentId: string; canRestore: boolean }) {
  const router = useRouter();
  const api = useMemo<VersionsApi>(() => ({ list: () => pbVersionsAction(documentId), compare: (a, b) => pbCompareAction(documentId, a, b), restore: (n) => pbRestoreAction(documentId, n) }), [documentId]);
  return <VersionsPanel api={api} canRestore={canRestore} onRestored={() => router.refresh()} />;
}
