import assert from "node:assert/strict";
import { planBreaks, type FlowBlock } from "../src/components/doc-editor/core/pagination";

const H = 1000, EXTRA = 100;
const flow = (hs: number[], gap = 10): FlowBlock[] => { let y = 0; return hs.map((h, i) => { const b = { pos: i * 10, top: y, height: h }; y += h + gap; return b; }); };

// Everything fits on one sheet: no spacer.
let r = planBreaks(flow([200, 300, 300]), H, EXTRA);
assert.equal(r.breaks.length, 0); assert.equal(r.pages, 1);

// The block that would cross the edge moves whole to the next sheet; the spacer fills the rest of the sheet plus the gap.
r = planBreaks(flow([400, 400, 300, 200]), H, EXTRA);
assert.equal(r.pages, 2); assert.equal(r.breaks.length, 1); assert.equal(r.breaks[0].pos, 20);
assert.equal(r.breaks[0].height, H + EXTRA - 810 - 10, "the spacer sits after the 10 px gap below the previous block");

// No block may straddle an edge: after planning, every block lies inside one sheet.
const blocks = flow([300, 450, 380, 120, 640, 90, 510, 260, 700, 330]);
r = planBreaks(blocks, H, EXTRA);
let shift = 0;
for (const b of blocks) {
  const br = r.breaks.find((x) => x.pos === b.pos); if (br) shift += br.height;
  const top = b.top + shift, bottom = top + b.height;
  const sheet = Math.floor(top / (H + EXTRA)), edge = sheet * (H + EXTRA) + H;
  assert.ok(bottom <= edge + 1, `block at ${b.pos} crosses the sheet edge`);
}

// A manual page break starts the next block on a new sheet; one already at the top of a sheet adds nothing.
r = planBreaks([{ pos: 0, top: 0, height: 100 }, { pos: 5, top: 0, height: 0, pageBreak: true }, { pos: 6, top: 110, height: 100 }], H, EXTRA);
assert.equal(r.pages, 2); assert.equal(r.breaks[0].pos, 6);
r = planBreaks([{ pos: 0, top: 0, height: 0, pageBreak: true }, { pos: 1, top: 0, height: 100 }], H, EXTRA);
assert.equal(r.pages, 1); assert.equal(r.breaks.length, 0);

// A block taller than a sheet runs across and is counted as the sheets it covers; the next block follows after it.
r = planBreaks(flow([300, 2300, 100]), H, EXTRA);
assert.ok(r.pages >= 3);

// Empty document: one sheet.
assert.equal(planBreaks([], H, EXTRA).pages, 1);

// Long paragraphs split between lines with at least 2 lines on each sheet (widow and orphan control).
{
  const L = 20;
  const para = (top: number, lines: number): FlowBlock => ({ pos: 50, top, height: lines * L, lines, lineH: L });
  let q = planBreaks([{ pos: 0, top: 0, height: 930 }, para(940, 10)], H, EXTRA);
  assert.equal(q.pages, 2); assert.equal(q.breaks[0].line, 3, "3 lines fit on the first sheet");
  q = planBreaks([{ pos: 0, top: 0, height: 970 }, para(980, 10)], H, EXTRA);
  assert.equal(q.breaks[0].line, undefined, "less than 2 lines fit: the whole paragraph moves");
  q = planBreaks([{ pos: 0, top: 0, height: 700 }, para(710, 15)], H, EXTRA);
  assert.equal(q.breaks[0].line, 13, "at least 2 lines carry over");
  // A very long paragraph splits more than once.
  q = planBreaks([para(0, 120)], H, EXTRA);
  assert.ok(q.breaks.length >= 2 && q.pages >= 3);
}

// A heading is never the last block of a sheet: it goes with the next block.
{
  const q = planBreaks([{ pos: 0, top: 0, height: 900 }, { pos: 1, top: 910, height: 40, keepNext: true }, { pos: 2, top: 960, height: 100 }], H, EXTRA);
  assert.equal(q.breaks.length, 1); assert.equal(q.breaks[0].pos, 1, "the break goes before the heading");
}

// Table rows move whole and carry the header row to the next sheet; the header row is not left alone.
{
  const rows: FlowBlock[] = [{ pos: 10, top: 0, height: 30, keepNext: true }];
  for (let i = 1; i <= 40; i++) rows.push({ pos: 10 + i, top: i * 30, height: 30, repeat: { pos: 10, height: 30 } });
  const q = planBreaks(rows, H, EXTRA);
  assert.ok(q.breaks.length >= 1 && q.pages >= 2);
  assert.ok(q.breaks.every((b) => b.repeat && b.repeat.pos === 10), "every continued sheet repeats the header row");
}

// The plan depends only on measured heights, so planning twice gives the same answer (no jitter between passes).
{
  const b = flow([300, 450, 380, 120, 640, 90, 510, 260, 700, 330]);
  assert.deepEqual(planBreaks(b, H, EXTRA), planBreaks(b, H, EXTRA));
}
console.log("pagination: ok");
