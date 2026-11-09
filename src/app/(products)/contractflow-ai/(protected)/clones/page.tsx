import { redirect } from "next/navigation";

/** The earlier combined list: the three kinds now have their own lists. */
export default function ClonesPage() {
  redirect("/contractflow-ai/documents");
}
