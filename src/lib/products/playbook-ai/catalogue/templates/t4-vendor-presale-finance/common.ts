/** Shared kit for batch T4 (vendor, pre-sale, finance). Amounts, rates, periods and tax figures are always inputs taken from the company's records. */
import { f, p } from "@/lib/products/playbook-ai/catalogue/build";
import type { InputField, RawBlock } from "@/lib/products/playbook-ai/catalogue/types";

export const vendorInput = (): InputField => f.person("vendor", "Vendor", "vendor", { help: "Pick the vendor from the vendor records. Name, address and tax details fill automatically." });
export const clientInput = (required = true): InputField => f.person("client", "Client", "client", { required, help: "Pick the client from the client records. Name, address and GSTIN fill automatically." });

/** Date, reference and addressee for a letter to a vendor or client. */
export function letterHead(ns: "vendor" | "client", subject: string, contact: string): RawBlock[] {
  return [
    p("Date: {{date.today|date}}\nReference: {{doc.number||To be assigned on issue}}"),
    p(`To,\n**{{${ns}.name}}**\n{{${ns}.address}}`),
    p(`**Subject: ${subject}**`),
    p(`Dear ${contact},`),
  ];
}

export const NEVER_COMMERCIAL = [
  "prices, quantities, rates, taxes, totals, dates, periods or any figure that is not in the provided facts",
  "commitments, guarantees, discounts or terms that were not stated in the facts",
  "claims about the company's capabilities, clients, awards or results that were not supplied",
];
export const NEVER_FINANCE = [
  "amounts, tax rates, tax amounts, limits, dates or periods that are not in the provided facts",
  "legal or tax requirements (say 'as required by applicable law' instead)",
  "approvals or policies that were not stated in the facts",
];

export const bankInputs = (): InputField[] => [
  f.text("bank_name", "Bank name"), f.text("account_name", "Account holder name"), f.text("account_number", "Account number"), f.text("ifsc", "IFSC"), f.text("branch", "Branch", { required: false }),
];
