/**
 * Indian statutes whose names (with their year) may appear in generated text without being treated as an invented number.
 * This is a NAME list only: no section numbers, rates, limits or periods live here, and the AI is never allowed to state those from memory.
 * The list is reference data for the platform administrator to review; a statute that is not listed is flagged by the fact guard and
 * the author confirms it by hand.
 */
export const INDIAN_STATUTES: readonly string[] = [
  "Indian Contract Act, 1872",
  "Indian Stamp Act, 1899",
  "Companies Act, 2013",
  "Information Technology Act, 2000",
  "Digital Personal Data Protection Act, 2023",
  "Arbitration and Conciliation Act, 1996",
  "Payment of Gratuity Act, 1972",
  "Payment of Wages Act, 1936",
  "Industrial Disputes Act, 1947",
  "Maternity Benefit Act, 1961",
  "Employees' Provident Funds and Miscellaneous Provisions Act, 1952",
  "Employees' State Insurance Act, 1948",
  "Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013",
  "Code on Wages, 2019",
  "Income-tax Act, 1961",
  "Limited Liability Partnership Act, 2008",
  "Copyright Act, 1957",
  "Patents Act, 1970",
  "Trade Marks Act, 1999",
  "Specific Relief Act, 1963",
  "Registration Act, 1908",
];
