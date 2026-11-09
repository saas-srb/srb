/** Every keyboard shortcut of the editor, in one table: the extensions bind from it and the help dialog lists from it. */
export type ShortcutScope = "editor" | "app";
export interface ShortcutDef {
  id: string;
  /** TipTap / ProseMirror key notation; `Mod` is Ctrl on Windows and Linux, Cmd on macOS. */
  keys: string;
  label: string;
  group: "Text" | "Blocks" | "Insert" | "Document";
  scope: ShortcutScope;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: "bold", keys: "Mod-b", label: "Bold", group: "Text", scope: "editor" },
  { id: "italic", keys: "Mod-i", label: "Italic", group: "Text", scope: "editor" },
  { id: "underline", keys: "Mod-u", label: "Underline", group: "Text", scope: "editor" },
  { id: "strike", keys: "Mod-Shift-x", label: "Strikethrough", group: "Text", scope: "editor" },
  { id: "superscript", keys: "Mod-.", label: "Superscript", group: "Text", scope: "editor" },
  { id: "subscript", keys: "Mod-,", label: "Subscript", group: "Text", scope: "editor" },
  { id: "link", keys: "Mod-k", label: "Add or edit link", group: "Text", scope: "app" },
  { id: "alignLeft", keys: "Mod-Shift-l", label: "Align left", group: "Text", scope: "editor" },
  { id: "alignCenter", keys: "Mod-Shift-e", label: "Align centre", group: "Text", scope: "editor" },
  { id: "alignRight", keys: "Mod-Shift-r", label: "Align right", group: "Text", scope: "editor" },
  { id: "alignJustify", keys: "Mod-Shift-j", label: "Justify", group: "Text", scope: "editor" },
  { id: "paragraph", keys: "Mod-Alt-0", label: "Normal text", group: "Blocks", scope: "editor" },
  { id: "heading1", keys: "Mod-Alt-1", label: "Heading 1", group: "Blocks", scope: "editor" },
  { id: "heading2", keys: "Mod-Alt-2", label: "Heading 2", group: "Blocks", scope: "editor" },
  { id: "heading3", keys: "Mod-Alt-3", label: "Heading 3", group: "Blocks", scope: "editor" },
  { id: "heading4", keys: "Mod-Alt-4", label: "Heading 4", group: "Blocks", scope: "editor" },
  { id: "clause", keys: "Mod-Alt-c", label: "Numbered clause", group: "Blocks", scope: "editor" },
  { id: "bulletList", keys: "Mod-Shift-8", label: "Bullet list", group: "Blocks", scope: "editor" },
  { id: "orderedList", keys: "Mod-Shift-7", label: "Numbered list", group: "Blocks", scope: "editor" },
  { id: "indent", keys: "Tab", label: "Indent list item or clause", group: "Blocks", scope: "editor" },
  { id: "outdent", keys: "Shift-Tab", label: "Outdent list item or clause", group: "Blocks", scope: "editor" },
  { id: "exitBlock", keys: "Mod-Shift-Enter", label: "Add a paragraph after the current block", group: "Blocks", scope: "editor" },
  { id: "pageBreak", keys: "Mod-Enter", label: "Insert page break", group: "Insert", scope: "editor" },
  { id: "variable", keys: "Mod-Alt-v", label: "Insert variable", group: "Insert", scope: "app" },
  { id: "aiWrite", keys: "Mod-Alt-i", label: "Help me write (AI)", group: "Insert", scope: "app" },
  { id: "undo", keys: "Mod-z", label: "Undo", group: "Document", scope: "editor" },
  { id: "redo", keys: "Mod-Shift-z", label: "Redo", group: "Document", scope: "editor" },
  { id: "redoAlt", keys: "Mod-y", label: "Redo", group: "Document", scope: "editor" },
  { id: "find", keys: "Mod-f", label: "Find", group: "Document", scope: "app" },
  { id: "replace", keys: "Mod-h", label: "Find and replace", group: "Document", scope: "app" },
  { id: "save", keys: "Mod-s", label: "Save now", group: "Document", scope: "app" },
  { id: "print", keys: "Mod-p", label: "Print (opens the PDF)", group: "Document", scope: "app" },
  { id: "shortcuts", keys: "Mod-/", label: "Keyboard shortcuts", group: "Document", scope: "app" },
];

export const shortcutKeys = (id: string): string => {
  const s = SHORTCUTS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown shortcut ${id}`);
  return s.keys;
};

/** "Mod-Shift-x" to "Ctrl+Shift+X" (or the Mac symbols) for display. */
export function formatShortcut(keys: string, mac = false): string {
  return keys
    .split("-")
    .map((k) => {
      if (k === "Mod") return mac ? "⌘" : "Ctrl";
      if (k === "Alt") return mac ? "⌥" : "Alt";
      if (k === "Shift") return mac ? "⇧" : "Shift";
      return k.length === 1 ? k.toUpperCase() : k;
    })
    .join(mac ? "" : "+");
}

/** Whether a keyboard event is the given combination (`Mod` = Ctrl or Cmd). Used for the app-level shortcuts the editor itself does not bind. */
export function eventMatches(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }, keys: string): boolean {
  const parts = keys.split("-");
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const mod = e.ctrlKey || e.metaKey;
  if (mods.has("Mod") !== mod) return false;
  if (mods.has("Shift") !== e.shiftKey) return false;
  if (mods.has("Alt") !== e.altKey) return false;
  return e.key.toLowerCase() === key.toLowerCase();
}
