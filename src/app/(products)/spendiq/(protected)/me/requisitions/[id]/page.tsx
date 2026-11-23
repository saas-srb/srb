import { redirect } from "next/navigation";

// The old detail address now forwards to the normal detail page.
export default async function OldRequisitionsDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/spendiq/requisitions/${(await params).id}`);
}
