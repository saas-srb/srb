"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDescription, FormFooter, FormHeader, FormShell, FormTitle } from "@/components/products/playbook-ai/forms/FormShell";
import { PARTY_TYPES, PARTY_TYPE_LABEL, isLinkedType, type PartyType, type PickerHit } from "@/lib/products/contractflow-ai/party-types";
import { searchPartyForItemAction, sendItemAction } from "@/app/(products)/playbook-ai/(protected)/items-actions";
import { FIELD } from "@/components/products/playbook-ai/items/shared";

const ROLES = [{ v: "counterparty", l: "Other party" }, { v: "company_signatory", l: "Company signatory" }, { v: "witness", l: "Witness" }, { v: "approver", l: "Approver" }] as const;
interface SignerRow { name: string; email: string; role: (typeof ROLES)[number]["v"] }

/**
 * "Send to ContractFlow": copies the item to ContractFlow as a draft for the chosen employee, client or other party. Nothing is sent to anyone
 * from here; the link to the copy is shown afterwards and the sending happens in ContractFlow.
 */
export default function SendToContractFlowForm({ documentId, title, defaultType = "employee", backHref }: { documentId: string; title: string; defaultType?: PartyType; backHref: string }) {
  const router = useRouter();
  const onClose = () => router.push(backHref);
  const [pending, start] = useTransition();
  const [partyType, setPartyType] = useState<PartyType>(defaultType);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PickerHit[]>([]);
  const [picked, setPicked] = useState<PickerHit | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signers, setSigners] = useState<SignerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  function search() {
    setHits([]); setError(null); setSearching(true);
    void searchPartyForItemAction(partyType, q).then((r) => { setSearching(false); if (r.ok) { setHits(r.hits); if (r.hits.length === 0) setError("No one matches that search."); } else setError(r.message); });
  }
  const setSigner = (i: number, p: Partial<SignerRow>) => setSigners((rows) => rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  function submit() {
    setError(null);
    start(async () => {
      const r = await sendItemAction({
        documentId,
        party: isLinkedType(partyType) ? { type: partyType, recordId: picked?.recordId ?? null, partyId: picked?.partyId ?? null } : { type: partyType, displayName: name, email: email || undefined },
        signers: signers.filter((s) => s.name.trim() || s.email.trim()).map((s, i) => ({ name: s.name, email: s.email, role: s.role, order: i + 1 })),
      });
      if (!r.ok) { setError(r.message); return; }
      toast.success("Copied to ContractFlow. Nothing has been sent yet.");
      setDone(r.cloneId);
    });
  }

  const ready = isLinkedType(partyType) ? !!picked : name.trim().length >= 2;
  return (
    <FormShell>
        <FormHeader>
          <FormTitle>Send to ContractFlow</FormTitle>
          <FormDescription>{title}</FormDescription>
        </FormHeader>
        {done ? (
          <div className="space-y-3 text-sm">
            <p>A copy is now in ContractFlow as a draft. It has not been sent to anyone. Open it there to check it, add signers if needed and send it.</p>
            <Button nativeButton={false} render={<a href={`/contractflow-ai/clones/${done}`} />}>Open in ContractFlow</Button>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <fieldset className="space-y-2">
              <legend className="font-medium">Who is it for?</legend>
              <select className={FIELD} value={partyType} aria-label="Kind of party" onChange={(e) => { setPartyType(e.target.value as PartyType); setPicked(null); setHits([]); setError(null); }}>
                {PARTY_TYPES.map((t) => <option key={t} value={t}>{PARTY_TYPE_LABEL[t]}</option>)}
              </select>
              {isLinkedType(partyType) ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input autoComplete="off" className={FIELD} placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} aria-label="Search" />
                    <Button type="button" variant="outline" size="sm" onClick={search} disabled={searching}>{searching ? "Searching…" : "Search"}</Button>
                  </div>
                  {hits.length > 0 && (
                    <ul className="max-h-44 divide-y overflow-y-auto rounded-md border">
                      {hits.map((h) => (
                        <li key={h.recordId}>
                          <button type="button" className={`w-full px-3 py-2 text-left hover:bg-muted/50 ${picked?.recordId === h.recordId ? "bg-muted" : ""}`} onClick={() => { setPicked(h); setSigners((rows) => (rows.length === 0 && h.email ? [{ name: h.displayName, email: h.email, role: "counterparty" }] : rows)); }}>
                            {h.displayName}{h.subtitle ? <span className="text-xs text-muted-foreground"> · {h.subtitle}</span> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {picked && <p className="text-xs">Selected: <strong>{picked.displayName}</strong></p>}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs">Name<input autoComplete="off" className={FIELD} value={name} onChange={(e) => setName(e.target.value)} /></label>
                  <label className="text-xs">Email (optional)<input autoComplete="off" className={FIELD} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                </div>
              )}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="font-medium">Signers (optional)</legend>
              <p className="text-xs text-muted-foreground">You can add or change signers in ContractFlow before sending.</p>
              {signers.map((s, i) => (
                <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-3">
                  <label className="text-xs">Name<input autoComplete="off" className={FIELD} value={s.name} onChange={(e) => setSigner(i, { name: e.target.value })} /></label>
                  <label className="text-xs">Email<input autoComplete="off" className={FIELD} type="email" value={s.email} onChange={(e) => setSigner(i, { email: e.target.value })} /></label>
                  <label className="text-xs">Role<select className={FIELD} value={s.role} onChange={(e) => setSigner(i, { role: e.target.value as SignerRow["role"] })}>{ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select></label>
                  <div className="sm:col-span-3"><Button type="button" size="sm" variant="ghost" onClick={() => setSigners((r) => r.filter((_, j) => j !== i))}>Remove</Button></div>
                </div>
              ))}
              {signers.length < 20 && <Button type="button" size="sm" variant="outline" onClick={() => setSigners((r) => [...r, { name: "", email: "", role: "counterparty" }])}>Add a signer</Button>}
            </fieldset>
          </div>
        )}
        {error && <p className="rounded-md bg-destructive/10 p-3 text-xs text-destructive" role="alert">{error}</p>}
        {!done && (
          <FormFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="button" disabled={pending || !ready} onClick={submit}>{pending ? "Copying…" : "Copy to ContractFlow"}</Button>
          </FormFooter>
        )}
      </FormShell>
  );
}
