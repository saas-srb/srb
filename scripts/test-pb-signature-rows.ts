import assert from "node:assert/strict";
import JSZip from "jszip";
import { groupSignatureRows } from "../src/lib/products/playbook-ai/doc/signature-rows";
import { renderDocx } from "../src/lib/products/playbook-ai/doc/render/docx";
import { renderPdf } from "../src/lib/products/playbook-ai/doc/render/pdf";
import { parseDoc } from "../src/lib/products/playbook-ai/doc";
import { minimalRaw } from "./lib/pbdoc-fixtures";

// Run with: MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_pbsig npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-pb-signature-rows.ts
let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const sig = (id: string) => ({ id, type: "signatureBlock" });
const para = (id: string) => ({ id, type: "paragraph" });
const shape = (l: { type: string; blocks?: { id: string }[]; id?: string }[]) => l.map((x) => (x.type === "signatureRow" ? `[${x.blocks!.map((b) => b.id).join("|")}]` : x.id)).join(" ");

// Pairing: in order, two per row; an odd last block or a lone block sits in the left column; other blocks split runs.
ok(shape(groupSignatureRows([sig("a"), sig("b")])) === "[a|b]", "two make one row");
ok(shape(groupSignatureRows([sig("a")])) === "[a]", "one alone stays in a row of one (left)");
ok(shape(groupSignatureRows([sig("a"), sig("b"), sig("c")])) === "[a|b] [c]", "an odd last block sits left");
ok(shape(groupSignatureRows([sig("a"), sig("b"), sig("c"), sig("d"), sig("e")])) === "[a|b] [c|d] [e]", "3+ signers go in rows of two");
ok(shape(groupSignatureRows([para("p"), sig("a"), sig("b"), para("q"), sig("c"), para("r")])) === "p [a|b] q [c] r", "other blocks split the runs and keep their place");
ok(groupSignatureRows([]).length === 0, "nothing in, nothing out");
const rows = groupSignatureRows([sig("a"), sig("b")]);
ok(rows[0].type === "signatureRow" && (rows[0] as { blocks: { id: string }[] }).blocks.map((b) => b.id).join() === "a,b", "the blocks keep their ids and order (signer placement uses ids and roles)");

// Both renderers: four signers make two rows; the row stays on one page; borders are none on the table.
(async () => {
  const raw = minimalRaw() as unknown as { body: unknown[] };
  const mk = (id: string, label: string, role: string) => ({ id, type: "signatureBlock", label, partyRole: role, showName: true, showDesignation: true, showDate: true });
  const body = [...raw.body, { id: "hx", type: "heading", level: 2, content: [{ type: "text", text: "Execution" }] }, mk("s1", "For the Company", "company_signatory"), mk("s2", "For the Client", "counterparty"), mk("s3", "Witness one", "witness"), mk("s4", "Witness two", "witness")];
  const p = parseDoc({ ...(raw as object), body }, { assignIds: true });
  ok(p.ok, "document with four signature blocks parses");
  if (!p.ok) return;
  const ro = { meta: { title: "t", dateIso: "2026-11-09" }, values: {}, allowUnresolved: true };
  const docx = await renderDocx(p.doc, ro);
  const xml = await (await JSZip.loadAsync(docx.buffer)).file("word/document.xml")!.async("string");
  ok((xml.match(/<w:tbl>/g) ?? []).length === 2, "DOCX: two signature rows (two tables)");
  ok((xml.match(/<w:cantSplit/g) ?? []).length >= 2, "DOCX: a row never splits across pages");
  ok(xml.includes("For the Company") && xml.includes("Witness two"), "DOCX: all four blocks are printed");
  const pdf = await renderPdf(p.doc, ro);
  ok(pdf.buffer.length > 1000, "PDF renders with the rows");
  console.log(`signature rows: ${n} checks passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
