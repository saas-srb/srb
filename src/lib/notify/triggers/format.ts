/** Small formatters shared by every trigger so notifications read the same everywhere. */
export const inr = (n: number | null | undefined, currency = "INR") => {
  const v = Number(n ?? 0);
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(v); } catch { return `${currency} ${v.toFixed(2)}`; }
};
export const day = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? "" : x.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
export const today = () => new Date().toISOString().slice(0, 10);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const short = (s: string | null | undefined, n = 80) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
