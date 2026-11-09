import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { Node as PMNode } from "@tiptap/pm/model";
import { buildExtensions, viewKey } from "../src/components/doc-editor/schema/extensions";
import { docToTiptap, parseDoc, sequentialIds } from "../src/lib/products/playbook-ai/doc";
import { editorBodyToDoc } from "../src/components/doc-editor/core/convert";
import { evalCondition } from "../src/lib/products/playbook-ai/doc/variables";
import { minimalRaw, offerLetterRaw } from "./lib/pbdoc-fixtures";

// Pure (no DOM): page spacers, front matter, hidden conditionals and variable display live in a view plugin and never enter the document,
// so what autosave serialises is identical with and without them.
for (const raw of [minimalRaw(), offerLetterRaw()]) {
  const parsed = parseDoc(raw, { assignIds: true, idFactory: sequentialIds("t") });
  assert.ok(parsed.ok, "fixture parses");
  if (!parsed.ok) continue;
  const ext = buildExtensions();
  const schema = getSchema(ext);
  const viewExt = ext.find((e) => e.name === "pbViewState") as unknown as { config: { addProseMirrorPlugins: () => unknown[] } };
  const plugins = viewExt.config.addProseMirrorPlugins.call({}) as never[];
  const doc = PMNode.fromJSON(schema, docToTiptap(parsed.doc).body);
  let state = EditorState.create({ schema, doc, plugins });
  const before = JSON.stringify(state.doc.toJSON());
  const baseOut = editorBodyToDoc(state.doc.toJSON() as never, parsed.doc);
  assert.ok(baseOut.ok);

  const first = doc.child(0);
  state = state.apply(state.tr.setMeta(viewKey, {
    values: { "party.name": "Northwind Demo" }, labels: { "party.name": "Party name" }, hideToc: true, reveal: ["x"],
    breaks: [{ pos: 0, height: 120 }, { pos: first.nodeSize, height: 90 }],
    front: [{ key: "f1", html: "<p>Title</p>" }], back: [{ key: "b1", html: "<p>Approval</p>" }],
  }));
  const plugin = plugins[0] as { props: { decorations(s: EditorState): { find(): unknown[] } } };
  assert.ok(plugin.props.decorations(state).find().length >= 4, "decorations are produced");
  assert.equal(JSON.stringify(state.doc.toJSON()), before, "the document JSON is untouched by view state");
  const out = editorBodyToDoc(state.doc.toJSON() as never, parsed.doc);
  assert.ok(out.ok);
  if (out.ok && baseOut.ok) assert.equal(JSON.stringify(out.doc), JSON.stringify(baseOut.doc), "the saved PBDoc is identical");
}

// The conditional shown or hidden in the editor is decided by the export's own evaluator.
assert.equal(evalCondition({ key: "a", op: "eq", value: "x" }, () => "x"), true);
assert.equal(evalCondition({ key: "a", op: "eq", value: "x" }, () => undefined), false);
assert.equal(evalCondition({ key: "a", op: "not_exists" }, () => ""), true);
console.log("editor decorations not saved: ok");
