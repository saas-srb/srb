import "server-only";
import { notifyStudent } from "@/lib/products/cohort-ai/notifications";
import { inr, short } from "@/lib/notify/triggers/format";

/** Training notifications through TMS's own store: students hear about their own batch, fees and certificate. */
export const tmsEvents = {
  enrolled: (studentId: string, batchName: string, enrollmentId: string) =>
    notifyStudent(studentId, { type: "batch_assigned", title: "You were added to a batch", body: short(batchName, 80), link: "/cohort-ai/me/batch", dedupeKey: `tms-enrolled:${enrollmentId}` }),
  paymentRecorded: (studentId: string, amount: number, invoiceNumber: string, currency = "INR") =>
    notifyStudent(studentId, { type: "payment_recorded", title: `Payment received: ${inr(amount, currency)}`, body: `Receipt ${invoiceNumber}`, link: "/cohort-ai/me/payments", dedupeKey: `tms-pay:${invoiceNumber}` }),
  certificateIssued: (studentId: string, title: string, certificateId: string) =>
    !studentId ? Promise.resolve() : notifyStudent(studentId, { type: "certificate_issued", title: "Your certificate is ready", body: short(title, 80), link: "/cohort-ai/me/certificates", dedupeKey: `tms-cert:${certificateId}` }),
};
