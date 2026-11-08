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
