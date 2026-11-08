/**
 * Indian-numbering-system amount to words. Pure, no I/O.
 *   rupeesInWords(101371)  -> "Rupees One Lakh One Thousand Three Hundred Seventy One Only"
 *   rupeesInWords(1234.50) -> "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only"
 */

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–99 */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}

/** 0–999 */
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return twoDigits(rest);
  return rest === 0 ? `${ONES[h]} Hundred` : `${ONES[h]} Hundred ${twoDigits(rest)}`;
}

/** Whole number (>= 0) to words using lakh / crore grouping. */
export function numberToWordsIndian(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";

  const parts: string[] = [];

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundreds = n;

  if (crore > 0) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundreds > 0) parts.push(threeDigits(hundreds));

  return parts.join(" ");
}

/** "Rupees … Only", with paise when the amount is not whole. */
export function rupeesInWords(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const rupees = Math.floor(safe);
  const paise = Math.round((safe - rupees) * 100);

  const rupeeWords = `Rupees ${numberToWordsIndian(rupees)}`;
  if (paise > 0) return `${rupeeWords} and ${twoDigits(paise)} Paise Only`;
  return `${rupeeWords} Only`;
}
