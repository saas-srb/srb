import { redirect } from "next/navigation";

export default async function MyTestRedirect({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  redirect(`/evaliq/assignments/${encodeURIComponent(assignmentId)}`);
}
