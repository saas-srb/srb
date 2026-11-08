import Link from "next/link";
import { Pencil, Eye, Rocket, Lock, Send, Copy, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import { archiveTestAction, closeTestAction, deleteTestAction, duplicateTestAction, publishTestAction } from "@/app/(products)/evaliq/(protected)/actions";
import type { EffectiveTestStatus } from "@/lib/products/evaliq/constants";

/** Lifecycle buttons for a test, each shown only when the viewer holds the permission and the state allows it. */
export default function TestActions({ id, name, status, perms, hide = [] }: { id: string; name: string; status: EffectiveTestStatus; perms: Record<string, boolean>; hide?: string[] }) {
  const show = (k: string) => !hide.includes(k);
  return (
    <>
      {show("edit") && perms.EDIT_TEST && status !== "archived" && (
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/evaliq/tests/${id}/edit`} />}>
          <Pencil className="size-3.5" /> Edit
        </Button>
      )}
      {show("preview") && (
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/evaliq/tests/${id}/preview`} />}>
          <Eye className="size-3.5" /> Preview
        </Button>
      )}
      {perms.PUBLISH_TEST && (status === "draft" || status === "closed") && (
        <ActionButton action={publishTestAction.bind(null, id)} variant="default" success="Test published" confirm={{ title: `Publish "${name}"?`, description: "Published tests can be assigned. The paper is checked first — pools must be large enough and every section needs questions.", confirmLabel: "Publish" }}>
          <Rocket className="size-3.5" /> Publish
        </ActionButton>
      )}
      {show("assign") && perms.ASSIGN_TEST && (status === "published" || status === "active") && (
        <Button size="sm" nativeButton={false} render={<Link href={`/evaliq/assignments/new?testId=${id}`} />}>
          <Send className="size-3.5" /> Assign
        </Button>
      )}
      {perms.PUBLISH_TEST && (status === "published" || status === "active") && (
        <ActionButton action={closeTestAction.bind(null, id)} success="Test closed" confirm={{ title: "Close this test?", description: "No new attempts can start. Attempts already in progress continue until their own deadline. You can publish it again later.", confirmLabel: "Close test" }}>
          <Lock className="size-3.5" /> Close
        </ActionButton>
      )}
      {perms.CREATE_TEST && (
        <ActionButton action={duplicateTestAction.bind(null, id)} success="Duplicated as a new draft" redirectPrefix="/evaliq/tests/">
          <Copy className="size-3.5" /> Duplicate
        </ActionButton>
      )}
      {perms.ARCHIVE_TEST &&
        (status === "archived" ? (
          <ActionButton action={archiveTestAction.bind(null, id, false)} success="Restored as a draft">
            <ArchiveRestore className="size-3.5" /> Restore
          </ActionButton>
        ) : (
          <ActionButton action={archiveTestAction.bind(null, id, true)} success="Archived" confirm={{ title: "Archive this test?", description: "It disappears from active lists and cannot be started; results and certificates are kept. Unstarted assignments expire.", confirmLabel: "Archive" }}>
            <Archive className="size-3.5" /> Archive
          </ActionButton>
        ))}
      {perms.DELETE_TEST && status === "draft" && (
        <ActionButton action={deleteTestAction.bind(null, id)} variant="destructive" success="Test deleted" redirectTo="/evaliq/tests" confirm={{ title: "Delete this draft?", description: "Only drafts that were never assigned can be deleted.", confirmLabel: "Delete" }}>
          <Trash2 className="size-3.5" /> Delete
        </ActionButton>
      )}
    </>
  );
}
