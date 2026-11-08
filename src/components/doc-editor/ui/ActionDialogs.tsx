"use client";

import { useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PARTY_ROLES } from "@/lib/products/playbook-ai/doc/types";
import type { PartyRole } from "@/lib/products/playbook-ai/doc/types";
import { PBDOC_LIMITS } from "@/lib/products/playbook-ai/doc/limits";
import { normalizeHref } from "@/components/doc-editor/core/links";
import type { VariableDef } from "@/components/doc-editor/core/variables";
import {
  insertConditional, insertPlaceholder, insertRepeat, insertSection, insertSignature, insertTable, insertVariable, setLink, type CommandResult,
} from "@/components/doc-editor/ui/commands";
import VariablePicker from "@/components/doc-editor/ui/VariablePicker";
import ShortcutsList from "@/components/doc-editor/ui/ShortcutsList";
import type { DialogKind } from "@/components/doc-editor/ui/Toolbar";

const ROLE_LABEL: Record<PartyRole, string> = { company_signatory: "Company signatory", counterparty: "Counterparty", witness: "Witness", approver: "Approver" };
const input = "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm";

function Row({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="space-y-1"><label htmlFor={id} className="block text-xs font-medium text-muted-foreground">{label}</label>{children}</div>;
}

interface Props { kind: DialogKind | null; editor: Editor; defs: VariableDef[]; onClose: () => void }

/** All small "insert something" dialogs. Each validates before touching the document and reports the reason in words. */
export default function ActionDialogs({ kind, editor, defs, onClose }: Props) {
  return (
    <Dialog open={kind !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>{kind && <Body key={kind} kind={kind} editor={editor} defs={defs} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function Body({ kind, editor, defs, onClose }: Omit<Props, "kind"> & { kind: DialogKind }) {
  const [err, setErr] = useState<string | null>(null);
  const [a, setA] = useState(() => (kind === "link" ? ((editor.getAttributes("link").href as string | undefined) ?? "") : kind === "signature" ? "For the Company" : ""));
  const [b, setB] = useState(() => (kind === "repeat" ? "item" : ""));
  const [n1, setN1] = useState(3);
  const [n2, setN2] = useState(3);
  const [role, setRole] = useState<PartyRole>("company_signatory");

  const done = (r: CommandResult) => { if (r.ok) onClose(); else setErr(r.message); };
  const title: Record<DialogKind, string> = {
    variable: "Insert variable", link: "Link", table: "Insert table", signature: "Insert signature block", section: "Insert section",
    conditional: "Insert conditional block", repeat: "Insert repeat block", shortcuts: "Keyboard shortcuts",
  };
  const datalist = <datalist id="pb-keys">{defs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</datalist>;
  const submit = (fn: () => void) => (e: React.FormEvent) => { e.preventDefault(); fn(); };
  const error = err && <p role="alert" className="text-sm text-destructive">{err}</p>;

  return (
    <>
      {(
          <>
            <DialogHeader><DialogTitle>{title[kind]}</DialogTitle><DialogDescription className="sr-only">{title[kind]}</DialogDescription></DialogHeader>
            <div className="space-y-3 px-4 pb-4">
              {kind === "variable" && (
                <VariablePicker defs={defs}
                  onInsertVariable={(k) => done(insertVariable(editor, k))}
                  onInsertPlaceholder={(l, h) => done(insertPlaceholder(editor, l, h))} />
              )}
              {kind === "link" && (
                <form className="space-y-3" onSubmit={submit(() => {
                  if (!a.trim()) { setLink(editor, null); return onClose(); }
                  const href = normalizeHref(a);
                  if (!href) return setErr("Use a web address (https://…), an email address, or a phone number. Other kinds of link are not allowed.");
                  if (editor.state.selection.empty && !editor.isActive("link")) return setErr("Select the text you want to turn into a link first.");
                  setLink(editor, href); onClose();
                })}>
                  <Row id="pb-link" label="Address"><input id="pb-link" autoFocus className={input} value={a} onChange={(e) => setA(e.target.value)} placeholder="https://example.com" /></Row>
                  {error}
                  <div className="flex gap-2"><Button type="submit" size="sm">{a.trim() ? "Apply" : "Remove link"}</Button></div>
                </form>
              )}
              {kind === "table" && (
                <form className="space-y-3" onSubmit={submit(() => done(insertTable(editor, n1, n2)))}>
                  <div className="grid grid-cols-2 gap-3">
                    <Row id="pb-rows" label="Rows"><input id="pb-rows" type="number" min={1} max={50} className={input} value={n1} onChange={(e) => setN1(Number(e.target.value))} /></Row>
                    <Row id="pb-cols" label={`Columns (up to ${PBDOC_LIMITS.maxTableCols})`}><input id="pb-cols" type="number" min={1} max={PBDOC_LIMITS.maxTableCols} className={input} value={n2} onChange={(e) => setN2(Number(e.target.value))} /></Row>
                  </div>
                  <p className="text-xs text-muted-foreground">The first row is a header row. Cells cannot be merged.</p>
                  {error}
                  <Button type="submit" size="sm">Insert table</Button>
                </form>
              )}
              {kind === "signature" && (
                <form className="space-y-3" onSubmit={submit(() => done(insertSignature(editor, role, a)))}>
                  <Row id="pb-sig-l" label="Label"><input id="pb-sig-l" autoFocus className={input} value={a} maxLength={200} onChange={(e) => setA(e.target.value)} /></Row>
                  <Row id="pb-sig-r" label="Signs as">
                    <select id="pb-sig-r" className={input} value={role} onChange={(e) => setRole(e.target.value as PartyRole)}>{PARTY_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
                  </Row>
                  <p className="text-xs text-muted-foreground">This only marks where a signature goes, with name, designation and date lines. Nobody signs inside the editor.</p>
                  {error}
                  <Button type="submit" size="sm">Insert</Button>
                </form>
              )}
              {kind === "section" && (
                <form className="space-y-3" onSubmit={submit(() => done(insertSection(editor, a)))}>
                  <Row id="pb-sec" label="Section title"><input id="pb-sec" autoFocus className={input} value={a} maxLength={200} onChange={(e) => setA(e.target.value)} placeholder="Compensation" /></Row>
                  {error}
                  <Button type="submit" size="sm">Insert section</Button>
                </form>
              )}
              {kind === "conditional" && (
                <form className="space-y-3" onSubmit={submit(() => done(insertConditional(editor, a)))}>
                  <Row id="pb-cond" label="Show the block only when this variable…"><input id="pb-cond" autoFocus list="pb-keys" className={input} value={a} onChange={(e) => setA(e.target.value)} placeholder="party.type" /></Row>
                  {datalist}
                  <p className="text-xs text-muted-foreground">Choose the comparison afterwards in the Block panel.</p>
                  {error}
                  <Button type="submit" size="sm">Insert conditional block</Button>
                </form>
              )}
              {kind === "repeat" && (
                <form className="space-y-3" onSubmit={submit(() => done(insertRepeat(editor, a, b)))}>
                  <Row id="pb-rep-s" label="List to repeat over"><input id="pb-rep-s" autoFocus list="pb-keys" className={input} value={a} onChange={(e) => setA(e.target.value)} placeholder="input.benefits" /></Row>
                  {datalist}
                  <Row id="pb-rep-i" label="Name for each item"><input id="pb-rep-i" className={input} value={b} onChange={(e) => setB(e.target.value)} /></Row>
                  {error}
                  <Button type="submit" size="sm">Insert repeat block</Button>
                </form>
              )}
              {kind === "shortcuts" && <ShortcutsList />}
            </div>
          </>
        )}
    </>
  );
}
