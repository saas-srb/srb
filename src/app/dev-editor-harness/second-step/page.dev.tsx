import { notFound } from "next/navigation";
import SecondStepHarness from "./SecondStepHarness";

/** Development-only: the second-step sign-in screen with fixtures, no sign-in (404 in production). Used by scripts/shot-second-step.ts. */
export const dynamic = "force-dynamic";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SecondStepHarness />;
}
