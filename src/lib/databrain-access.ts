import { can as accessCan, type AccessSubject } from "@/lib/access/can";
import { subjectOfHolder, type SubjectHolder } from "@/lib/access/holds";

/** DataBrain access from the person's micro features. One feature: open DataBrain and ask questions (`databrain-ai.ask.use`). Pure. */
const KEY = "databrain-ai.ask.use";

export function dbCanAsk(holder: SubjectHolder | { subject: AccessSubject } | null | undefined): boolean {
  const s = subjectOfHolder(holder as SubjectHolder);
  return Boolean(s) && accessCan(s as AccessSubject, "databrain-ai", KEY, "write");
}
