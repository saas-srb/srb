/**
 * Fractional order-key math, generalized from the pattern already proven at
 * `src/lib/sprintos/tasks.ts` (`beforeKey`/`afterKey` reordering). Shared so a
 * second and third reorderable list (page sections, nav items, footer links)
 * don't each reinvent it.
 *
 * Same known limitation as `pms/tasks.ts`: repeated reordering into the same
 * gap can eventually produce keys too close together for float precision —
 * acceptable at this app's list sizes (single-digit nav items, page
 * sections), would need a rebalance pass before a list ever has hundreds of
 * items.
 */
const GAP = 1024;

export function nextOrderKey(before: number | null, after: number | null): number {
  if (before != null && after != null) return (before + after) / 2;
  if (before != null) return before + GAP;
  if (after != null) return after - GAP;
  return GAP;
}

/** Order key to give an item moved one position earlier/later in an already-sorted list. */
export function moveOrderKey<T extends { orderKey: number }>(sorted: T[], index: number, direction: "up" | "down"): number | null {
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sorted.length) return null;
  if (direction === "up") {
    const before = sorted[targetIndex - 1]?.orderKey ?? null;
    const after = sorted[targetIndex].orderKey;
    return nextOrderKey(before, after);
  }
  const before = sorted[targetIndex].orderKey;
  const after = sorted[targetIndex + 1]?.orderKey ?? null;
  return nextOrderKey(before, after);
}
