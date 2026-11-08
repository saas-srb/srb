/**
 * HSN (goods) / SAC (services) codes on invoice lines. Only the shape is checked here: digits, 4, 6 or 8 long. Whether a code is the
 * right one for the item, or how many digits the company must quote, is for the CA: this never decides that.
 */
export function hsnSacError(code: string | null | undefined): string | null {
  const c = (code ?? "").trim();
  if (c === "") return null; // optional
  if (!/^\d+$/.test(c)) return "HSN/SAC must be digits only.";
  if (![4, 6, 8].includes(c.length)) return "HSN/SAC must be 4, 6 or 8 digits.";
  return null;
}

/** The trimmed code, or null when blank. Call after `hsnSacError` has passed. */
export function normalizeHsnSac(code: string | null | undefined): string | null {
  const c = (code ?? "").trim();
  return c === "" ? null : c;
}
