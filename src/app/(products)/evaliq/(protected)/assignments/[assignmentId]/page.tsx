import { redirect } from "next/navigation";
import { OwnAssignment } from "@/components/products/evaliq/OwnViews";
import { getViewer } from "@/lib/products/evaliq/viewer";

export default async function AssignedTestPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  const { assignmentId } = await params;
  return <OwnAssignment viewer={viewer} assignmentId={assignmentId} />;
}
