"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDescription, FormFooter, FormHeader, FormShell, FormTitle } from "@/components/products/playbook-ai/forms/FormShell";
import { PARTY_TYPES, PARTY_TYPE_LABEL, isLinkedType, type PartyType, type PickerHit } from "@/lib/products/contractflow-ai/party-types";
import { searchPartyCfAction, sendCloneAction } from "@/app/(products)/contractflow-ai/(protected)/clones/list-actions";
import { FIELD } from "@/components/products/playbook-ai/items/shared";

const ROLES = [{ v: "counterparty", l: "Other party" }, { v: "company_signatory", l: "Company signatory" }, { v: "witness", l: "Witness" }, { v: "approver", l: "Approver" }] as const;
type Role = (typeof ROLES)[number]["v"];
interface SignerRow { name: string; email: string; role: Role }

/** Send to a client, an employee or someone else: pick the party, set the signers, and email each one their own link. */
export default function CfSendForm({ id, title, party, plan, backHref }: { id: string; title: string; party: { type: PartyType; partyId: string | null; displayName: string }; plan: { name: string; email: string; role: Role }[]; backHref: string }) {
  const router = useRouter();
  const onClose = () => router.push(backHref);
  const [pending, start] = useTransition();
  const [partyType, setPartyType] = useState<PartyType>(party.type);
  const [picked, setPicked] = useState<PickerHit | null>(null);
  const [changeParty, setChangeParty] = useState(!party.partyId && isLinkedType(party.type));
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PickerHit[]>([]);
  const [name, setName] = useState(party.partyId ? "" : party.displayName);
  const [signers, setSigners] = useState<SignerRow[]>(plan.length ? plan.map((p) => ({ name: p.name, email: p.email, role: p.role })) : [{ name: "", email: "", role: "counterparty" }]);
  const [order, setOrder] = useState<"parallel" | "sequential">("parallel");
  const [expiry, setExpiry] = useState("14");
  const [error, setError] = useState<string | null>(null);

  const setSigner = (i: number, p: Partial<SignerRow>) => setSigners((rows) => rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  function search() { setError(null); void searchPartyCfAction(partyType, q).then((r) => { if (r.ok) { setHits(r.hits); if (!r.hits.length) setError("No one matches that search."); } else setError(r.message); }); }

  function submit() {
    setError(null);
    let partyInput: { type: string; partyId?: string | null; recordId?: string | null; displayName?: string } | undefined;
    if (changeParty || partyType !== party.type) {
      partyInput = isLinkedType(partyType)
        ? picked ? { type: partyType, partyId: picked.partyId, recordId: picked.recordId, displayName: picked.displayName } : undefined
        : { type: partyType, displayName: name };
      if (!partyInput || (isLinkedType(partyType) && !picked)) { setError(isLinkedType(partyType) ? "Choose who this is for." : "Enter a name."); return; }
    }
    start(async () => {
      const r = await sendCloneAction({ id, party: partyInput, signers: signers.map((s, i) => ({ name: s.name, email: s.email, role: s.role, order: i + 1 })), orderMode: order, expiryDays: Number(expiry) });
      if (!r.ok) { setError(r.message); return; }
      toast.success(r.message);
      router.push(backHref);
      router.refresh();
    });
  }

  return (
    <FormShell>
        <FormHeader>
          <FormTitle>Send for signature</FormTitle>
          <FormDescription>{title}</FormDescription>
        </FormHeader>
        <div className="space-y-4 text-sm">
          <fieldset className="space-y-2">
            <legend className="font-medium">Recipient</legend>
            <p className="text-xs text-muted-foreground">Currently for: <strong>{party.displayName}</strong> ({PARTY_TYPE_LABEL[party.type]}).{" "}
              {!changeParty && <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setChangeParty(true)}>Change</button>}</p>
            {changeParty && (
              <div className="space-y-2">
                <select className={FIELD} value={partyType} aria-label="Kind of party" onChange={(e) => { setPartyType(e.target.value as PartyType); setPicked(null); setHits([]); }}>
                  {PARTY_TYPES.map((t) => <option key={t} value={t}>{PARTY_TYPE_LABEL[t]}</option>)}
                </select>
                {isLinkedType(partyType) ? (
                  <>
                    <div className="flex gap-2"><input autoComplete="off" className={FIELD} placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} aria-label="Search" /><Button type="button" variant="outline" size="sm" onClick={search}>Search</Button></div>
                    {hits.length > 0 && <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">{hits.map((h) => <li key={h.recordId}><button type="button" className={`w-full px-3 py-2 text-left hover:bg-muted/50 ${picked?.recordId === h.recordId ? "bg-muted" : ""}`} onClick={() => { setPicked(h); setSigners((rows) => (rows.length === 1 && !rows[0].name && !rows[0].email ? [{ ...rows[0], name: h.displayName, email: h.email ?? "" }] : rows)); }}>{h.displayName}{h.subtitle ? <span className="text-xs text-muted-foreground"> · {h.subtitle}</span> : null}</button></li>)}</ul>}
                    {picked && <p className="text-xs">Selected: <strong>{picked.displayName}</strong></p>}
                  </>
                ) : (
                  <label className="block text-xs">Name<input autoComplete="off" className={FIELD} value={name} onChange={(e) => setName(e.target.value)} /></label>
                )}
              </div>
            )}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="font-medium">Signers</legend>
            {signers.map((s, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-3">
                <label className="text-xs">Name<input autoComplete="off" className={FIELD} value={s.name} onChange={(e) => setSigner(i, { name: e.target.value })} /></label>
                <label className="text-xs">Email<input autoComplete="off" className={FIELD} type="email" value={s.email} onChange={(e) => setSigner(i, { email: e.target.value })} /></label>
                <label className="text-xs">Role<select className={FIELD} value={s.role} onChange={(e) => setSigner(i, { role: e.target.value as Role })}>{ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select></label>
                {signers.length > 1 && <div className="sm:col-span-3"><Button type="button" size="sm" variant="ghost" onClick={() => setSigners((r) => r.filter((_, j) => j !== i))}>Remove</Button></div>}
              </div>
            ))}
            {signers.length < 20 && <Button type="button" size="sm" variant="outline" onClick={() => setSigners((r) => [...r, { name: "", email: "", role: "company_signatory" }])}>Add a signer</Button>}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={order === "sequential"} onChange={(e) => setOrder(e.target.checked ? "sequential" : "parallel")} /> Sign one after another in the order above</label>
          </fieldset>
          <label className="block text-xs">Link valid for (days)<input className={`${FIELD} w-32`} inputMode="numeric" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></label>
          <p className="text-xs text-muted-foreground">Each signer gets an email with their own link. They confirm a one-time code, read the document and sign. Sending locks edits from the first signature.</p>
        </div>
        {error && <p className="rounded-md bg-destructive/10 p-3 text-xs text-destructive" role="alert">{error}</p>}
        <FormFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={pending} onClick={submit}>{pending ? "Sending…" : "Send"}</Button>
        </FormFooter>
      </FormShell>
  );
}
