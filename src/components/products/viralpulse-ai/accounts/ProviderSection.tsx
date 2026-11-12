import { ExternalLink, Info, Plug, Unplug } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/products/viralpulse-ai/SmmsUi";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import AccountCard from "./AccountCard";
import ConnectButton from "./ConnectButton";
import { disconnectConnectionAction } from "@/app/(products)/viralpulse-ai/(protected)/settings/accounts/actions";
import { ACCOUNT_INFO, CONNECTION_FEATURES, CONNECTION_INFO, type AccountView, type ConnectionProvider } from "@/lib/products/viralpulse-ai/accounts/types";
import type { ConnectionView } from "@/lib/products/viralpulse-ai/accounts/service";
import { formatDateTime } from "@/lib/utils";

const CONSOLE: Record<ConnectionProvider, { name: string; url: string; where: string }> = {
  meta: { name: "Meta for Developers", url: "https://developers.facebook.com/apps", where: "your Meta app > Facebook Login for Business (or Facebook Login) > Valid OAuth Redirect URIs" },
  google: { name: "Google Cloud Console", url: "https://console.cloud.google.com/apis/credentials", where: "your OAuth client > Authorised redirect URIs. Enable the YouTube Data API v3 (and the YouTube Analytics API) for the project" },
  linkedin: { name: "LinkedIn Developer Portal", url: "https://www.linkedin.com/developers/apps", where: "your app > Auth > Authorized redirect URLs. Add the products you need (Share on LinkedIn; Community Management API for organisation pages)" },
  x: { name: "X Developer Portal", url: "https://developer.x.com/en/portal/dashboard", where: "your app > User authentication settings > Callback URI (OAuth 2.0, Web App / confidential client, permissions Read and write)" },
};

/** One platform: its logins, the accounts found under them, and, when the company's own developer app isn't set up yet, exactly what to do. */
export default function ProviderSection({ oauth, configured, encryptionReady, redirectUrl, connections, accounts }: { oauth: ConnectionProvider; configured: boolean; encryptionReady: boolean; redirectUrl: string | null; connections: ConnectionView[]; accounts: AccountView[] }) {
  const info = CONNECTION_INFO[oauth];
  const c = CONSOLE[oauth];
  const canConnect = configured && encryptionReady;
  return (
    <SectionCard
      title={info.label}
      description={`Connect ${info.platforms}.`}
      action={canConnect ? <ConnectButton oauth={oauth} label={connections.length ? "Connect another login" : "Connect"} variant={connections.length ? "outline" : "default"} /> : undefined}
    >
      {!canConnect && (
        <div className="space-y-3 text-xs">
          <EmptyState icon={<Plug className="size-5" />} title={`${info.short} isn't set up yet`}>
            {!encryptionReady ? "Secure storage isn't available right now. Please try again in a few minutes, or contact support." : `ViralPulse connects through your own ${info.short} developer app, so the platform's approval and rate limits are yours.`}
          </EmptyState>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>{`Create an app in `}<a className="inline-flex items-center gap-0.5 font-medium text-primary underline" href={c.url} target="_blank" rel="noreferrer noopener">{c.name}<ExternalLink className="size-3" aria-hidden /></a>.</li>
            <li>
              {`Register this exact redirect URL in ${c.where}:`}
              {redirectUrl ? <code className="mt-1 block break-all rounded bg-muted px-1.5 py-1 text-[11px] text-foreground">{redirectUrl}</code> : <span className="block text-muted-foreground">{`Open this page from your workspace address to see the exact URL (it ends in /api/viralpulse-ai/oauth/${oauth}/callback).`}</span>}
            </li>
            <li>Save the app&apos;s ID and secret in Workspace &gt; Settings &gt; Integrations (the connection for this platform).</li>
            <li>Come back here and press Connect.</li>
          </ol>
        </div>
      )}
      {canConnect && redirectUrl && connections.length === 0 && (
        <p className="mb-3 flex items-start gap-1.5 text-[11px] text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{`Redirect URL registered in your app must be exactly: ${redirectUrl}`}</p>
      )}
      {canConnect && connections.length === 0 && (
        <div className="space-y-2 text-xs">
          <p className="font-medium">What each ability needs from the platform:</p>
          <ul className="space-y-1">
            {CONNECTION_FEATURES[oauth].map((f) => <li key={f.key}><span className="font-medium">{f.label}.</span> <span className="text-muted-foreground">{f.approval}</span></li>)}
          </ul>
        </div>
      )}
      <div className="space-y-4">
        {connections.map((conn) => {
          const mine = accounts.filter((a) => a.connectionId === conn.id);
          return (
            <div key={conn.id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                <div className="text-xs">
                  <p className="font-semibold">{`Signed in as ${conn.name}`}</p>
                  <p className="text-muted-foreground">{`Connected ${formatDateTime(conn.connectedAt)}`}</p>
                </div>
                <div className="flex gap-2">
                  <ConnectButton oauth={oauth} connectionId={conn.id} variant="outline" />
                  <ActionButton size="sm" variant="ghost" action={disconnectConnectionAction.bind(null, conn.id)} success="Disconnected" confirm={{ title: `Disconnect ${conn.name}?`, description: `${info.short} access is revoked where ${info.short} allows it, the stored tokens are deleted and ${mine.length} account${mine.length === 1 ? "" : "s"} stop publishing. Scheduled posts to them will fail until you connect again.`, confirmLabel: "Disconnect" }}><Unplug className="size-3.5" /> Disconnect</ActionButton>
                </div>
              </div>
              {conn.status !== "active" && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{conn.lastError ?? "This login needs to be reconnected."}</p>}
              {conn.notes.map((n) => <p key={n} className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{n}</p>)}
              {mine.length === 0 ? (
                <p className="text-xs text-muted-foreground">No accounts were found under this login. See the note above, then reconnect.</p>
              ) : (
                <ul className="space-y-2">{mine.map((a) => <AccountCard key={a.id} account={a} showClient />)}</ul>
              )}
              <p className="text-[11px] text-muted-foreground">{`Account types here: ${[...new Set(mine.map((a) => ACCOUNT_INFO[a.provider].label))].join(", ") || "none"}.`}</p>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
