import { redirect } from "next/navigation";

export default async function MyResultRedirect({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  redirect(`/evaliq/results/${encodeURIComponent(attemptId)}`);
}
