import { notFound } from "next/navigation";
import SidebarsHarness from "./SidebarsHarness";

/** Development-only: the two real sidebars (from their nav definitions) side by side, expanded and collapsed. 404 in production. */
export const dynamic = "force-dynamic";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SidebarsHarness />;
}
