import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { vendorVerifiedPayee } from "@/lib/products/cashflow-ai/vendor-controls/store";
import { bankAccountForPayout, getPrimaryBankAccount } from "@/lib/products/talentos/bank-accounts";
import { getEmployee, employeeFullName } from "@/lib/products/talentos/employees";
import type { PayeeInput } from "@/lib/products/cashflow-ai/payments/payouts";
import { getPaymentControls } from "@/lib/products/cashflow-ai/payment-controls";

/** Why payee details changed at `at` cannot be paid yet, or null. */
async function holdProblem(at: Date | null | undefined, who: string): Promise<string | null> {
  if (!at) return null;
  const hours = (await getPaymentControls()).payeeHoldHours;
  const until = new Date(at.getTime() + hours * 3_600_000);
  if (hours <= 0 || until.getTime() <= Date.now()) return null;
  return `${who}'s bank details were added or changed recently. For safety they cannot be paid until ${until.toLocaleString("en-IN")}. Check with them that the change is genuine.`;
}

/** Who to pay and where, read from what the company already keeps: a vendor's saved bank details, an employee's primary bank account. */

export type PayeeResult = { ok: true; payee: PayeeInput } | { ok: false; error: string };

export async function vendorPayee(vendorId: string, name: string): Promise<PayeeResult> {
  // Only bank details a person has verified are paid; newer, unchecked ones wait (Vendor controls).
  const v = await vendorVerifiedPayee(vendorId, name);
  if (!v.ok) return { ok: false, error: v.error };
  const hold = await holdProblem(v.holdFrom, v.name);
  if (hold) return { ok: false, error: hold };
  return { ok: true, payee: { name: v.name, accountNumber: v.details.account, ifsc: v.details.ifsc, upiId: v.details.upi, kind: "vendor" } };
}

/** An employee by HR employee id, or by login id (an expense is raised by a login). Paid into their primary bank account. */
export async function employeePayee(idOrUserId: string): Promise<PayeeResult> {
  let employeeId = idOrUserId;
  if (!(await getEmployee(employeeId)) && ObjectId.isValid(idOrUserId)) {
    const user = await (await getDb()).collection("admin_users").findOne({ _id: new ObjectId(idOrUserId) }, { projection: { employeeId: 1 } });
    if (user?.employeeId) employeeId = String(user.employeeId);
  }
  const emp = await getEmployee(employeeId);
  if (!emp) return { ok: false, error: "That person has no employee record, so there is no bank account to pay." };
  const primary = await getPrimaryBankAccount(emp._id);
  const hold = await holdProblem((primary as { detailsChangedAt?: Date | null } | null)?.detailsChangedAt, employeeFullName(emp));
  if (hold) return { ok: false, error: hold };
  const full = primary ? await bankAccountForPayout(primary._id) : null;
  if (!full) return { ok: false, error: `${employeeFullName(emp)} has no bank account on file. Add one on their profile first.` };
  return { ok: true, payee: { name: full.holder || employeeFullName(emp), email: emp.workEmail, accountNumber: full.accountNumber, ifsc: full.ifsc, kind: "employee" } };
}
