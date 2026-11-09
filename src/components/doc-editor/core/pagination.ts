/**
 * Approximate pagination for the page view. The real PDF breaks pages in the renderer; here we flow measured block boxes into pages of the
 * text-area height, honouring explicit page breaks, so the editor can draw page boundaries and "Page n of N" labels. Pure.
 */
export interface Box { top: number; height: number; pageBreak?: boolean }

/** y offsets (relative to the top of the content) at which each page starts. The first is always 0. */
export function computePageStarts(boxes: readonly Box[], pageHeightPx: number): number[] {
  const H = Math.max(pageHeightPx, 50);
  const starts = [0];
  let limit = H;
  const EPS = 1;
  for (const b of boxes) {
    if (b.pageBreak) {
      const next = b.top + b.height;
      if (next > starts[starts.length - 1]) { starts.push(next); limit = next + H; }
      continue;
    }
    let guard = 0;
    while (b.top + b.height > limit + EPS && guard++ < 1000) {
      // A block that starts on or past the boundary begins the next page; a long block spills across the boundary.
      starts.push(limit);
      limit += H;
    }
  }
  return starts;
}

export function pageOfOffset(starts: readonly number[], y: number): number {
  let p = 0;
  for (let i = 0; i < starts.length; i++) if (y >= starts[i]) p = i;
  return p + 1;
}

export interface FlowBlock {
  /** Document position of the block (where a page spacer is inserted, before it). */
  pos: number;
  /** Natural top and height in px, measured WITHOUT any page spacers. */
  top: number;
  height: number;
  /** A manual page break: draws nothing, and the next block starts a new sheet. */
  pageBreak?: boolean;
  /** Keep with the next block (headings, a table's header row): never the last block on a sheet. */
  keepNext?: boolean;
  /** A paragraph that may split between lines: its number of lines and the line height in px. Needs at least 2 lines on each sheet. */
  lines?: number;
  lineH?: number;
  /** A table row after the header row: when a sheet starts here, the header row is repeated first (its position and height). */
  repeat?: { pos: number; height: number };
  /** Ordering among widgets at the same position (front and back matter); passed through to the break. */
  side?: number;
}
export interface PlannedBreak {
  pos: number;
  height: number;
  /** Split inside the block `pos` before this line (0-based); the caller turns it into a text position. */
  line?: number;
  repeat?: { pos: number; height: number };
  side?: number;
}

/**
 * Real pagination for the sheet view. Blocks flow down a column; whenever the next block would cross the bottom of the sheet's text area
 * (`textHeightPx`), a spacer is placed before it that is as tall as the rest of the sheet, the bottom margin, the gap between sheets and the top
 * margin of the next sheet (`extraPx`). Rules: a paragraph of 4+ lines splits between lines with at least 2 lines on each side (widow and orphan
 * control); table rows move whole and the header row repeats on the next sheet; a block marked keepNext is never left alone at the bottom; a block
 * taller than a sheet that cannot split runs across it. `pageOf[i]` is the sheet each block starts on (1-based). Pure.
 */
export function planBreaks(blocks: readonly FlowBlock[], textHeightPx: number, extraPx: number): { breaks: PlannedBreak[]; pages: number; pageOf: number[] } {
  const H = Math.max(textHeightPx, 50);
  const breaks: PlannedBreak[] = [];
  const pageOf: number[] = new Array(blocks.length).fill(1);
  let pageStart = blocks.length ? Math.min(0, blocks[0].top) : 0;
  let prevBottom = pageStart;
  let pages = 1;
  let forceNext = false;
  let prev: FlowBlock | null = null;
  let bottomBeforePrev = pageStart;
  const room = () => pageStart + H;
  // `gap` is the space between the anchor (the end of what stays on this sheet) and the spacer: the margin below the previous block, which
  // the spacer sits after. The block after the spacer must land exactly on the next sheet's text top, so that space is taken off the spacer.
  const pushBreak = (anchorBottom: number, extra: Partial<PlannedBreak> & { pos: number }, gap = 0) => {
    breaks.push({ height: Math.max(Math.round(room() + extraPx - anchorBottom - Math.max(gap, 0)), 0), ...extra });
    pages += 1;
  };

  blocks.forEach((b, i) => {
    if (b.pageBreak) { forceNext = true; pageOf[i] = pages; return; }
    if (b.height <= 0) { pageOf[i] = pages; return; }
    const top = b.top, bottom = top + b.height;
    const atTop = top <= pageStart + 1;
    const overflow = bottom - room() > 1;

    if ((forceNext && !atTop) || (overflow && !atTop && !(b.lines && b.lines >= 4 && b.lineH && Math.floor((room() - top + 0.5) / b.lineH) >= 2) && b.height <= H)) {
      // Move the whole block; a keepNext block before it goes with it.
      if (!forceNext && prev?.keepNext && prev.top > pageStart + 1 && prev.height > 0) {
        pushBreak(bottomBeforePrev, { pos: prev.pos, repeat: prev.repeat, side: prev.side }, prev.top - bottomBeforePrev);
        pageStart = prev.top - (prev.repeat?.height ?? 0);
      } else {
        pushBreak(prevBottom, { pos: b.pos, repeat: b.repeat, side: b.side }, top - prevBottom);
        pageStart = top - (b.repeat?.height ?? 0);
      }
    }
    forceNext = false;
    pageOf[i] = pages;

    // Still too long for the sheet it is on: split a long paragraph between lines, or let a tall block run across.
    let guard = 0;
    while (bottom - room() > 1 && guard++ < 200) {
      const lineH = b.lineH ?? 0;
      if (b.lines && b.lines >= 4 && lineH > 0) {
        const lineAtPageStart = Math.max(0, Math.round((pageStart - top) / lineH));
        const remaining = b.lines - lineAtPageStart;
        let fit = Math.floor((room() - (top + lineAtPageStart * lineH) + 0.5) / lineH);
        if (fit >= remaining) break;
        if (remaining - fit < 2) fit = remaining - 2;
        if (fit >= 2) {
          const at = top + (lineAtPageStart + fit) * lineH;
          pushBreak(at, { pos: b.pos, line: lineAtPageStart + fit, side: b.side });
          pageStart = at;
          continue;
        }
      }
      const crossed = Math.ceil((bottom - room()) / H);
      pages += crossed;
      pageStart += crossed * H;
      break;
    }
    bottomBeforePrev = prevBottom;
    prevBottom = bottom;
    prev = b;
  });
  return { breaks, pages, pageOf };
}
