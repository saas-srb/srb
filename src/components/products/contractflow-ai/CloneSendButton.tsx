import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** "Send for signature": opens the send page for this document (it used to open a popup). */
export default function CloneSendButton({ id }: { id: string }) {
  return <Link href={`/contractflow-ai/clones/${id}/send`} className={buttonVariants({ size: "sm" })}>Send for signature</Link>;
}
