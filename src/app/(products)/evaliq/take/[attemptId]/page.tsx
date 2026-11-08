import { notFound, redirect } from "next/navigation";
import ExamRunner from "@/components/products/evaliq/ExamRunner";
import { getCurrentOtsUser } from "@/lib/ots-auth";
import { resolveTaker } from "@/lib/products/evaliq/taker";
import { AttemptClosedError, loadExamState } from "@/lib/products/evaliq/attempts";
import { Toaster } from "@/components/ui/sonner";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const generateMetadata = () => brandedMetadata("Test in progress · {brand}", { robots: { index: false, follow: false } });
export const dynamic = "force-dynamic";

/** Distraction-free exam page (outside the product shell): no sidebar, no navigation away. */
export default async function TakeTestPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await getCurrentOtsUser();
  if (!user) redirect("/evaliq/login");
  if (user.mustChangePassword) redirect("/evaliq/change-password");
  const taker = await resolveTaker("staff");
  if (!taker) redirect("/evaliq");
  const { attemptId } = await params;
  let state;
  try {
    state = await loadExamState(taker, attemptId);
  } catch (err) {
    if (err instanceof AttemptClosedError) redirect(`/evaliq/my-results/${attemptId}`);
    notFound();
  }
  return (
    <>
      <ExamRunner channel="staff" initial={state} resultsBase="/evaliq/my-results" testsBase="/evaliq/my-tests" />
      <Toaster position="top-center" richColors />
    </>
  );
}
