import { redirect } from "next/navigation";

// The old detail address now forwards to the normal detail page.
export default async function OldExpensesDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/spendiq/expenses/${(await params).id}`);
}
