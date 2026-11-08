import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canApproveTransactions } from "@/lib/fms-roles";
import { startPayout, type FmsPayout, type PayoutPurpose } from "@/lib/products/cashflow-ai/payments/payouts";
import { limitOr429 } from "@/lib/security/rate-limit";
import { paymentGate } from "@/lib/products/cashflow-ai/payment-guard";
import { readSafeJson, UnsafeBodyError } from "@/lib/security/safe-json";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Pays someone through the company's RazorpayX account. Nothing is recorded as paid here: the payment is created at RazorpayX and shows as
 * processing; when RazorpayX reports it paid (webhook, or "Check status"), the ledger entry is posted and the UTR recorded.
 */
async function handlePOST(req: Request) {
  const limited = await limitOr429(req, "cashflow-payout", 30, 600);
  if (limited) return limited;
  try {
    const user = await getCurrentFmsUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    // Money leaves the company here: only roles that may approve transactions can start a payout.
    if (!canApproveTransactions(user)) return NextResponse.json({ ok: false, error: "You don't have permission to make payouts." }, { status: 403 });

    let body: Record<string, unknown>;
    try {
      body = await readSafeJson(req);
    } catch (err) {
      if (err instanceof UnsafeBodyError) return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
      throw err;
    }
    const blocked = await paymentGate(user.id, body.code);
    if (blocked) return NextResponse.json({ ok: false, error: blocked }, { status: 400 });
    const channel = str(body.channel, 12).toLowerCase();
    const upi = channel === "upi";
    const sourceModule = ["fms", "prms", "hrms"].includes(str(body.sourceModule, 8).toLowerCase()) ? (str(body.sourceModule, 8).toLowerCase() as FmsPayout["sourceModule"]) : "fms";
    const purpose: PayoutPurpose = sourceModule === "prms" ? "vendor_bill" : "other";
    const mode = ({ neft: "NEFT", rtgs: "RTGS", imps: "IMPS", upi: "UPI" } as const)[channel as "neft" | "rtgs" | "imps" | "upi"] ?? null;
    const sourceTransactionId = str(body.sourceTransactionId, 80) || null;
    const note = str(body.refNotes, 120);

    const r = await startPayout(
      {
        purpose,
        sourceModule,
        sourceRecordId: sourceTransactionId ?? (note || null),
        payee: { name: str(body.payeeName, 120), upiId: upi ? str(body.payeeAccount, 120) : null, accountNumber: upi ? null : str(body.payeeAccount, 30), ifsc: str(body.ifscCode, 12), kind: sourceModule === "prms" ? "vendor" : sourceModule === "hrms" ? "employee" : "customer" },
        amount: Number(body.amount),
        narration: note || "Payment",
        completeTransactionId: sourceTransactionId,
        clientRequestId: str(body.clientRequestId, 64) || null,
        mode,
        description: `Payment to ${str(body.payeeName, 120)}${note ? ` (${note})` : ""}`,
      },
      { id: user.id, email: user.email ?? null },
    );
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, payoutId: r.payout._id, status: r.payout.status, referenceNumber: r.payout.utr ?? r.payout.providerPayoutId });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
