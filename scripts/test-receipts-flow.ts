import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { createBankAccount, getBankAccount } from "../src/lib/products/cashflow-ai/bank-accounts";
import { bounceCheque, clearCheque, getReceipt, recordReceipt, voidReceipt, type RecordReceiptData } from "../src/lib/products/cashflow-ai/receipts";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const inA = <T>(fn: () => Promise<T>) => runAsCompany("co_rcpt", fn);
const today = new Date().toISOString().slice(0, 10);

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase(); // every run starts clean (only ever a zz_throwaway_ database, checked above)
  await inA(async () => {
    const db = await getDb();
    const made = await createBankAccount({ accountName: "HDFC current", bankName: "HDFC", accountNumber: null, ifsc: null, branch: null, currency: "INR", openingBalance: 100000, status: "active", notes: null }, "u1");
    assert.ok(made.ok);
    if (!made.ok) return;
    const acct = `bank:${made.account._id}`;
    const fund = { fundAccountId: made.account._id, fundAccountType: "bank" as const };
    const now = new Date();
    for (const [id, n, total] of [["inv1", "INV-1", 50000], ["inv2", "INV-2", 30000], ["inv3", "INV-3", 20000]] as const) {
      await db.collection("fms_invoices").insertOne({ _id: id, invoiceNumber: n, customerId: "c1", customerName: "Acme Ltd", currency: "INR", totalAmount: total, amountPaid: 0, amountCredited: 0, status: "sent", dueDate: today, createdAt: now, updatedAt: now, deletedAt: null } as never);
    }
    const bal = async () => (await getBankAccount(made.account._id))!.currentBalance;
    const inv = async (id: string) => (await db.collection("fms_invoices").findOne({ _id: id as never }))! as unknown as { amountPaid: number; status: string };
    const base = (o: Partial<RecordReceiptData> = {}): RecordReceiptData => ({ customerId: "c1", customerName: "Acme Ltd", receiptDate: today, amount: 10000, method: "bank_transfer", transactionReference: "UTR100200300", allocations: [{ invoiceId: "inv1", amount: 10000 }], currency: "INR", notes: null, ...fund, ...o });
    void acct;

    await t("the money has to be tied to a company account, and a bank transfer to the bank's reference", async () => {
      assert.equal((await recordReceipt(base({ fundAccountId: null, fundAccountType: null }), "u1", null)).ok, false);
      assert.equal((await recordReceipt(base({ transactionReference: "" }), "u1", null)).ok, false);
      const r = await recordReceipt(base(), "u1", null);
      assert.ok(r.ok, r.ok ? "" : r.reason);
      assert.equal(await bal(), 110000, "the account balance rises");
      assert.equal((await inv("inv1")).amountPaid, 10000);
      assert.equal((await recordReceipt(base(), "u1", null)).ok, false, "the same UTR and amount is not recorded twice");
    });

    await t("cash of ₹2 lakh or more in a day from one customer is refused (section 269ST)", async () => {
      assert.equal((await recordReceipt(base({ method: "cash", transactionReference: null, amount: 200000, allocations: [] }), "u1", null)).ok, false);
      assert.ok((await recordReceipt(base({ method: "cash", transactionReference: null, amount: 150000, allocations: [] }), "u1", null)).ok);
      const again = await recordReceipt(base({ method: "cash", transactionReference: null, amount: 60000, allocations: [] }), "u1", null);
      assert.equal(again.ok, false, "150000 + 60000 in one day is over the limit");
    });

    await t("a cheque waits: nothing is applied or booked until the bank clears it", async () => {
      const bad = await recordReceipt(base({ method: "cheque", transactionReference: null, chequeNumber: "12", chequeBank: "SBI", chequeDate: today }), "u1", null);
      assert.equal(bad.ok, false);
      const before = await bal();
      const r = await recordReceipt(base({ method: "cheque", transactionReference: null, amount: 20000, allocations: [{ invoiceId: "inv2", amount: 20000 }], chequeNumber: "445566", chequeBank: "SBI", chequeDate: today }), "u1", null);
      assert.ok(r.ok, r.ok ? "" : r.reason);
      if (!r.ok) return;
      assert.equal(r.receipt.status, "pending_clearance");
      assert.equal(await bal(), before, "no money booked yet");
      assert.equal((await inv("inv2")).amountPaid, 0, "the invoice is still unpaid");
      assert.equal((await recordReceipt(base({ method: "cheque", transactionReference: null, amount: 20000, allocations: [], chequeNumber: "445566", chequeBank: "SBI", chequeDate: today }), "u1", null)).ok, false, "the same cheque is not recorded twice");
      assert.equal((await clearCheque(r.receipt._id, "2999-01-01", "u1", null)).ok, false, "not in the future");
      assert.ok((await clearCheque(r.receipt._id, today, "u1", null)).ok);
      assert.equal(await bal(), before + 20000, "booked when it clears");
      assert.equal((await inv("inv2")).amountPaid, 20000);
      assert.equal((await getReceipt(r.receipt._id))!.status, "completed");
      assert.equal((await clearCheque(r.receipt._id, today, "u1", null)).ok, false, "cleared once only");
    });

    await t("a bounced cheque changes nothing, keeps its reason, and the invoice stays unpaid", async () => {
      const before = await bal();
      const r = await recordReceipt(base({ method: "cheque", transactionReference: null, amount: 20000, allocations: [{ invoiceId: "inv3", amount: 20000 }], chequeNumber: "778899", chequeBank: "ICICI", chequeDate: today }), "u1", null);
      assert.ok(r.ok);
      if (!r.ok) return;
      assert.equal((await bounceCheque(r.receipt._id, " ", "u1")).ok, false, "a reason is required");
      assert.ok((await bounceCheque(r.receipt._id, "Insufficient funds", "u1")).ok);
      const got = (await getReceipt(r.receipt._id))!;
      assert.equal(got.status, "bounced");
      assert.equal(got.bounceReason, "Insufficient funds");
      assert.equal(await bal(), before);
      assert.equal((await inv("inv3")).amountPaid, 0);
      assert.equal((await clearCheque(r.receipt._id, today, "u1", null)).ok, false, "a bounced cheque cannot be cleared");
    });

    await t("voiding a cleared cheque takes the money and the allocation back; voiding a waiting one changes nothing", async () => {
      const before = await bal();
      const pending = await recordReceipt(base({ method: "cheque", transactionReference: null, amount: 5000, allocations: [], chequeNumber: "990011", chequeBank: "Axis", chequeDate: today }), "u1", null);
      assert.ok(pending.ok);
      if (pending.ok) {
        assert.ok((await voidReceipt(pending.receipt._id, "u1")).ok);
        assert.equal(await bal(), before);
      }
      const cleared = (await db.collection("fms_receipts").findOne({ chequeNumber: "445566", status: "completed" }))!;
      assert.ok((await voidReceipt(String(cleared._id), "u1")).ok);
      assert.equal(await bal(), before - 20000);
      assert.equal((await inv("inv2")).amountPaid, 0);
    });
  });
  console.log("receipt flow tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
