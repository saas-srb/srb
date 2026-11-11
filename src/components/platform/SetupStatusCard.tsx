import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { getSetupStatus } from "@/lib/platform/setup/status";

/** What is automatic after a move to another Vercel account, and what still needs a person. `compact` shows only the open items. */
export default async function SetupStatusCard({ compact = false }: { compact?: boolean }) {
  const items = await getSetupStatus().catch(() => []);
  const shown = compact ? items.filter((i) => i.state !== "ok") : items;
  if (compact && shown.length === 0) return null;
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">{compact ? "Setup status: needs your attention" : "Setup status and portability"}</CardTitle>
        <CardDescription>
          {compact ? <>Everything else is automatic. <Link href="/console/health" className="underline">See all checks</Link></> : "Deploying to a new Vercel account needs only MONGODB_URI and SAAS_HOSTS. The app works out the rest; the API token of the new account is the one thing it cannot."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {shown.map((i) => (
            <li key={i.id} className="flex items-start gap-2 text-sm">
              {i.state === "ok" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <TriangleAlert className={`mt-0.5 size-4 shrink-0 ${i.state === "action" ? "text-destructive" : "text-amber-600"}`} />}
              <span className="min-w-0">
                <span className="font-medium">{i.title}</span>
                {i.automatic && i.state === "ok" ? <span className="ml-1 text-xs text-muted-foreground">(automatic)</span> : null}
                <span className="block break-words text-muted-foreground">{i.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </GlassCard>
  );
}
