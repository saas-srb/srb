import { notFound } from "next/navigation";
import ListsHarness from "./ListsHarness";

/** Development-only: the My SOPs / My Documents / ContractFlow list tables with sample rows, no sign-in (404 in production). Used by scripts/shot-lists.ts. */
export const dynamic = "force-dynamic";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ListsHarness />;
}
