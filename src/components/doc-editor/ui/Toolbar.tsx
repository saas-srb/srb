"use client";

import { useRef, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Braces, Eye, Italic, Keyboard, Link2, List, ListOrdered, MessageSquarePlus, Plus, Redo2, Search,
  Strikethrough, Subscript, Superscript, Underline, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatShortcut, shortcutKeys } from "@/components/doc-editor/core/shortcuts";
import { currentBlockType, hasNode, setBlockType } from "@/components/doc-editor/ui/commands";

export type DialogKind = "variable" | "link" | "table" | "signature" | "section" | "conditional" | "repeat" | "shortcuts";

interface Props {
  editor: Editor;
  readOnly: boolean;
  canUpload: boolean;
  canComment: boolean;
  resolved: boolean;
  onResolved: (v: boolean) => void;
  onDialog: (k: DialogKind) => void;
  onInsert: (what: string) => void;
  onFind: (replace: boolean) => void;
  onImageFiles: (files: FileList) => void;
  onComment: () => void;
}

function Tool({ label, keys, pressed, disabled, onClick, children }: { label: string; keys?: string; pressed?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  const title = keys ? `${label} (${formatShortcut(keys)})` : label;
  return (
    <Button type="button" size="icon-sm" variant={pressed ? "secondary" : "ghost"} aria-label={label} aria-pressed={pressed} title={title} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </Button>
  );
}
const Sep = () => <span role="separator" aria-orientation="vertical" className="mx-1 h-5 w-px shrink-0 bg-border" />;

export default function Toolbar({ editor, readOnly, canUpload, canComment, resolved, onResolved, onDialog, onInsert, onFind, onImageFiles, onComment }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"), sup: e.isActive("superscript"), sub: e.isActive("subscript"),
      link: e.isActive("link"), bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"),
      alignL: !e.isActive({ align: "center" }) && !e.isActive({ align: "right" }) && !e.isActive({ align: "justify" }), alignC: e.isActive({ align: "center" }), alignR: e.isActive({ align: "right" }), alignJ: e.isActive({ align: "justify" }),
      block: currentBlockType(e), canUndo: e.can().undo(), canRedo: e.can().redo(), hasToc: hasNode(e.state.doc, "toc"),
      inText: e.state.selection.$from.parent.isTextblock,
    }),
  });
  const off = readOnly;
  const align = (a: string) => editor.chain().focus().command(({ tr, state }) => {
    state.doc.nodesBetween(state.selection.from, state.selection.to, (n, pos) => { if (n.type.name === "paragraph" || n.type.name === "heading") tr.setNodeMarkup(pos, undefined, { ...n.attrs, align: a === "left" ? null : a }); return true; });
    return true;
  }).run();

  return (
    <div role="toolbar" aria-label="Document formatting" className="flex flex-wrap items-center gap-0.5 border-b bg-background px-2 py-1.5">
      <Tool label="Undo" keys={shortcutKeys("undo")} disabled={off || !s.canUndo} onClick={() => editor.chain().focus().undo().run()}><Undo2 /></Tool>
      <Tool label="Redo" keys={shortcutKeys("redo")} disabled={off || !s.canRedo} onClick={() => editor.chain().focus().redo().run()}><Redo2 /></Tool>
      <Sep />
      <label className="sr-only" htmlFor="pb-block-style">Text style</label>
      <select id="pb-block-style" disabled={off || !s.inText} value={s.block} onChange={(e) => setBlockType(editor, e.target.value)} className="h-7 rounded-lg border border-input bg-background px-1.5 text-sm">
        <option value="paragraph">Normal text</option>
        <option value="heading1">Heading 1</option><option value="heading2">Heading 2</option><option value="heading3">Heading 3</option><option value="heading4">Heading 4</option>
        <option value="clause">Numbered clause</option>
      </select>
      <Sep />
      <Tool label="Bold" keys={shortcutKeys("bold")} pressed={s.bold} disabled={off} onClick={() => editor.chain().focus().toggleBold().run()}><Bold /></Tool>
      <Tool label="Italic" keys={shortcutKeys("italic")} pressed={s.italic} disabled={off} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic /></Tool>
      <Tool label="Underline" keys={shortcutKeys("underline")} pressed={s.underline} disabled={off} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline /></Tool>
      <Tool label="Strikethrough" keys={shortcutKeys("strike")} pressed={s.strike} disabled={off} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough /></Tool>
      <Tool label="Superscript" keys={shortcutKeys("superscript")} pressed={s.sup} disabled={off} onClick={() => editor.chain().focus().toggleMark("superscript").run()}><Superscript /></Tool>
      <Tool label="Subscript" keys={shortcutKeys("subscript")} pressed={s.sub} disabled={off} onClick={() => editor.chain().focus().toggleMark("subscript").run()}><Subscript /></Tool>
      <Tool label="Link" keys={shortcutKeys("link")} pressed={s.link} disabled={off} onClick={() => onDialog("link")}><Link2 /></Tool>
      <Sep />
      <Tool label="Align left" keys={shortcutKeys("alignLeft")} pressed={s.alignL} disabled={off || !s.inText} onClick={() => align("left")}><AlignLeft /></Tool>
      <Tool label="Align centre" keys={shortcutKeys("alignCenter")} pressed={s.alignC} disabled={off || !s.inText} onClick={() => align("center")}><AlignCenter /></Tool>
      <Tool label="Align right" keys={shortcutKeys("alignRight")} pressed={s.alignR} disabled={off || !s.inText} onClick={() => align("right")}><AlignRight /></Tool>
      <Tool label="Justify" keys={shortcutKeys("alignJustify")} pressed={s.alignJ} disabled={off || !s.inText} onClick={() => align("justify")}><AlignJustify /></Tool>
      <Sep />
      <Tool label="Bullet list" keys={shortcutKeys("bulletList")} pressed={s.bullet} disabled={off} onClick={() => onInsert("bulletList")}><List /></Tool>
      <Tool label="Numbered list" keys={shortcutKeys("orderedList")} pressed={s.ordered} disabled={off} onClick={() => onInsert("orderedList")}><ListOrdered /></Tool>
      <Sep />
      <Tool label="Insert variable or fill-in field" keys={shortcutKeys("variable")} disabled={off} onClick={() => onDialog("variable")}><Braces /></Tool>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" disabled={off} aria-label="Insert block" />}><Plus /> Insert</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Content</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onDialog("table")}>Table…</DropdownMenuItem>
            {canUpload && <DropdownMenuItem onClick={() => fileRef.current?.click()}>Image…</DropdownMenuItem>}
            <DropdownMenuItem onClick={() => onInsert("callout:info")}>Callout: information</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onInsert("callout:warning")}>Callout: warning</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onInsert("callout:important")}>Callout: important</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onInsert("clause")}>Numbered clause</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Layout</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onInsert("pageBreak")}>Page break</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onInsert("divider")}>Divider line</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onInsert("spacer")}>Spacer</DropdownMenuItem>
            <DropdownMenuItem disabled={s.hasToc} onClick={() => onInsert("toc")}>Table of contents</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDialog("signature")}>Signature block…</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Template logic</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onDialog("section")}>Section…</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDialog("conditional")}>Conditional block…</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDialog("repeat")}>Repeat block…</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onInsert("field:pageNumber")}>Page number field</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { if (e.target.files?.length) onImageFiles(e.target.files); e.target.value = ""; }} aria-label="Choose an image" />
      <Sep />
      <Tool label="Find and replace" keys={shortcutKeys("replace")} onClick={() => onFind(true)}><Search /></Tool>
      <Tool label={resolved ? "Showing sample values: switch to variable names" : "Showing variable names: switch to values"} pressed={resolved} onClick={() => onResolved(!resolved)}><Eye /></Tool>
      {canComment && <Tool label="Comment on this block" disabled={off} onClick={onComment}><MessageSquarePlus /></Tool>}
      <Tool label="Keyboard shortcuts" onClick={() => onDialog("shortcuts")}><Keyboard /></Tool>
    </div>
  );
}
