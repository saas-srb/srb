"use client";

import { SHORTCUTS, formatShortcut } from "@/components/doc-editor/core/shortcuts";

export default function ShortcutsList() {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const groups = ["Text", "Blocks", "Insert", "Document"] as const;
  return (
    <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 pb-4">
      {groups.map((g) => (
        <section key={g} aria-label={g}>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</h4>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            {SHORTCUTS.filter((s) => s.group === g && s.id !== "redoAlt").map((s) => (
              <div key={s.id} className="contents"><dt>{s.label}</dt><dd><kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">{formatShortcut(s.keys, mac)}</kbd></dd></div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
