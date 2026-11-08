"use client";

import { useConfirm } from "@/components/products/sitecraft-ai/ui/ConfirmProvider";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImageIcon, Loader2, Plus, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import MediaPicker from "@/components/products/sitecraft-ai/MediaPicker";
import { KNOWN_SOCIAL_NAMES } from "@/components/icons/social-icon-for";
import { DISPLAY_LABELS, type SiteInfo, type SiteLink } from "@/lib/products/sitecraft-ai/site-info-shared";
import { UI_LABELS, type UiLabelKey } from "@/lib/products/sitecraft-ai/ui-labels";
import { saveSiteInfoAction } from "@/app/(products)/sitecraft-ai/(protected)/site-identity/actions";

type Group = "brand" | "header" | "floating" | "contact" | "footer" | "shareImage";
type FieldDef = { key: string; label: string; help?: string; multiline?: boolean };

const GROUPS: { group: Group; title: string; fields: FieldDef[] }[] = [
  {
    group: "brand",
    title: "Brand",
    fields: [
      { key: "namePrimary", label: "Wordmark — first part", help: "Shown in the text colour." },
      { key: "nameAccent", label: "Wordmark — accent part", help: "Shown in the brand colour (for example the second half of your name)." },
      { key: "subtitle", label: "Subtitle under the wordmark" },
    ],
  },
  {
    group: "header",
    title: "Header",
    fields: [
      { key: "ctaLabel", label: "Call-to-action button label" },
      { key: "ctaHref", label: "Call-to-action link" },
      { key: "followLabel", label: "Mobile menu — social heading" },
      { key: "askAiLabel", label: "AI assistant link — label" },
      { key: "askAiHref", label: "AI assistant link — URL" },
      { key: "featuredLabel", label: "Mega-menu featured card tag" },
      { key: "consultLabel", label: "Mobile menu — consultation tile" },
      { key: "consultHref", label: "Mobile menu — consultation link" },
      { key: "liveChatLabel", label: "Mobile menu — live chat tile" },
      { key: "whatsappLabel", label: "Mobile menu — WhatsApp tile" },
      { key: "dashboardLabel", label: "Account link — signed in" },
      { key: "loginLabel", label: "Account link — log in" },
      { key: "signupLabel", label: "Account link — sign up" },
    ],
  },
  {
    group: "floating",
    title: "Floating contact button",
    fields: [
      { key: "assistantLabel", label: "AI assistant" },
      { key: "whatsappLabel", label: "WhatsApp" },
      { key: "liveChatLabel", label: "Live chat" },
    ],
  },
  {
    group: "contact",
    title: "Contact details",
    fields: [
      { key: "email", label: "Support email" },
      { key: "phoneDisplay", label: "Phone (as displayed)" },
      { key: "phoneHref", label: "Phone link", help: "e.g. tel:+918072278460" },
      { key: "whatsappHref", label: "WhatsApp link", help: "e.g. https://wa.me/918072278460" },
      { key: "linkedinHref", label: "LinkedIn page" },
      { key: "mapsUrl", label: "Google Maps link" },
      { key: "addressName", label: "Address — name after the wordmark" },
      { key: "address", label: "Address", help: "One line per row.", multiline: true },
    ],
  },
  {
    group: "footer",
    title: "Footer",
    fields: [
      { key: "badge", label: "CTA strip — badge" },
      { key: "ctaTitle", label: "CTA strip — heading" },
      { key: "ctaText", label: "CTA strip — text" },
      { key: "ctaLabel", label: "CTA strip — button label" },
      { key: "ctaHref", label: "CTA strip — button link" },
      { key: "whatsappLabel", label: "CTA strip — WhatsApp button label" },
      { key: "about", label: "About paragraph", multiline: true },
      { key: "followLabel", label: "Social heading" },
      { key: "copyright", label: "Copyright text (after © year and wordmark)" },
    ],
  },
  {
    group: "shareImage",
    title: "Share image (social previews)",
    fields: [
      { key: "alt", label: "Alt text" },
      { key: "tag", label: "Tag next to the wordmark" },
      { key: "headline", label: "Headline", multiline: true },
      { key: "subline", label: "Sub-line", multiline: true },
      { key: "domain", label: "Domain shown at the bottom" },
    ],
  },
];

export default function SiteInfoEditor({ initial, canEdit }: { initial: SiteInfo; canEdit: boolean }) {
  const [info, setInfo] = useState(initial);
  /** The last saved values — what "Discard" goes back to. */
  const [saved, setSaved] = useState(initial);
  const confirm = useConfirm();
  const discard = async () => {
    if (!(await confirm({ title: "Discard unsaved changes?", description: "Every edit since you last saved is undone. The website isn't affected.", confirmLabel: "Discard", destructive: true }))) return;
    setInfo(saved);
  };
  const [pickerOpen, setPickerOpen] = useState(false);
  const [darkPickerOpen, setDarkPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const setField = (group: Group, key: string, value: string) =>
    setInfo((s) => ({ ...s, [group]: { ...s[group], [key]: value } }));
  const setDisplay = (group: keyof SiteInfo["display"], key: string, value: boolean) =>
    setInfo((s) => ({ ...s, display: { ...s.display, [group]: { ...s.display[group], [key]: value } } }));
  const setSocial = (social: SiteInfo["social"]) => setInfo((s) => ({ ...s, social }));
  const move = (i: number, d: -1 | 1) => {
    const next = [...info.social];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setSocial(next);
  };

  const save = () => {
    startTransition(async () => {
      const res = await saveSiteInfoAction(info);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setInfo(res.saved);
      setSaved(res.saved);
      toast.success("Saved — live on the website");
    });
  };

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">Logo</h2>
        <div className="flex items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
            {info.brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- CMS media URL
              <img src={info.brand.logoUrl} alt="" className="size-10 object-contain" />
            ) : (
              <span className="text-[10px] text-muted-foreground">Built-in</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!canEdit} onClick={() => setPickerOpen(true)}>
              <ImageIcon className="size-3.5" /> Choose image
            </Button>
            {info.brand.logoUrl && (
              <Button type="button" variant="ghost" size="sm" disabled={!canEdit} onClick={() => setField("brand", "logoUrl", "")}>
                <RotateCcw className="size-3.5" /> Use built-in logo
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Empty = a monogram generated from your company name.</p>
        <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(url) => { setField("brand", "logoUrl", url); setPickerOpen(false); }} />
        <div className="flex items-center gap-3 border-t border-border/50 pt-3">
          <div className="flex size-14 items-center justify-center rounded-lg border border-border/60 bg-slate-900">
            {info.brand.logoDarkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- CMS media URL
              <img src={info.brand.logoDarkUrl} alt="" className="size-10 object-contain" />
            ) : (
              <span className="text-[10px] text-slate-400">Same</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-foreground">Dark-mode logo (optional)</span>
            <Button type="button" variant="outline" size="sm" disabled={!canEdit} onClick={() => setDarkPickerOpen(true)}>
              <ImageIcon className="size-3.5" /> Choose image
            </Button>
            {info.brand.logoDarkUrl && (
              <Button type="button" variant="ghost" size="sm" disabled={!canEdit} onClick={() => setField("brand", "logoDarkUrl", "")}>
                <RotateCcw className="size-3.5" /> Use the same logo
              </Button>
            )}
          </div>
        </div>
        <MediaPicker open={darkPickerOpen} onClose={() => setDarkPickerOpen(false)} onSelect={(url) => { setField("brand", "logoDarkUrl", url); setDarkPickerOpen(false); }} />
      </GlassCard>

      <GlassCard className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Show or hide</h2>
          <p className="mt-1 text-xs text-muted-foreground">Switch off anything you don&apos;t want on the site. Items with no content (for example WhatsApp without a number) are hidden automatically.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {DISPLAY_LABELS.map(({ group, title, items }) => (
            <div key={group} className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
              {items.map((item) => {
                const id = `display-${group}-${item.key}`;
                const checked = (info.display[group] as Record<string, boolean>)[item.key];
                return (
                  <label key={item.key} htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
                    <input id={id} type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={checked} disabled={!canEdit} onChange={(e) => setDisplay(group, item.key, e.target.checked)} />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </GlassCard>

      {GROUPS.map(({ group, title, fields }) => (
        <GlassCard key={group} className="space-y-3 p-5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {fields.map((f) => {
            const id = `site-${group}-${f.key}`;
            const value = (info[group] as Record<string, string>)[f.key] ?? "";
            const saved = (initial[group] as Record<string, string>)[f.key] ?? "";
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={id}>{f.label}</Label>
                  {canEdit && value !== saved && (
                    <button type="button" className="text-xs text-muted-foreground hover:text-primary" onClick={() => setField(group, f.key, saved)}>
                      Undo change
                    </button>
                  )}
                </div>
                {f.multiline ? (
                  <Textarea id={id} rows={3} value={value} disabled={!canEdit} onChange={(e) => setField(group, f.key, e.target.value)} />
                ) : (
                  <Input id={id} value={value} disabled={!canEdit} onChange={(e) => setField(group, f.key, e.target.value)} />
                )}
                {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
              </div>
            );
          })}
        </GlassCard>
      ))}

      <GlassCard className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">Social links</h2>
        <p className="text-xs text-muted-foreground">
          Shown in the footer, the mobile menu and (if switched on) the header, in this order. Names with a brand icon: {KNOWN_SOCIAL_NAMES.join(", ")}; any other name gets a link icon.
          LinkedIn can be added here or set under Contact details.
        </p>
        {info.social.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input aria-label={`Social link ${i + 1} name`} className="w-40" value={s.name} disabled={!canEdit} list="site-social-names"
              onChange={(e) => setSocial(info.social.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input aria-label={`Social link ${i + 1} URL`} className="min-w-0 flex-1" value={s.href} disabled={!canEdit}
              onChange={(e) => setSocial(info.social.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={!canEdit || i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={!canEdit || i === info.social.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" disabled={!canEdit} onClick={() => setSocial(info.social.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
          </div>
        ))}
        <datalist id="site-social-names">
          {KNOWN_SOCIAL_NAMES.map((n) => <option key={n} value={n} />)}
        </datalist>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={() => setSocial([...info.social, { name: "", href: "" }])}>
            <Plus className="size-3.5" /> Add social link
          </Button>
        )}
      </GlassCard>

      {(["legalLinks", "compactLinks"] as const).map((listKey) => (
        <GlassCard key={listKey} className="space-y-3 p-5">
          <h2 className="text-sm font-semibold text-foreground">{listKey === "legalLinks" ? "Footer — legal links (bottom bar)" : "Compact footer — bottom links"}</h2>
          <LinkListEditor
            links={info.footer[listKey]}
            canEdit={canEdit}
            onChange={(links) => setInfo((s) => ({ ...s, footer: { ...s.footer, [listKey]: links } }))}
          />
        </GlassCard>
      ))}

      <GlassCard className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">Share image — badges</h2>
        <Textarea
          aria-label="Share image badges, one per line"
          rows={3}
          value={info.shareImage.badges.join("\n")}
          disabled={!canEdit}
          onChange={(e) => setInfo((s) => ({ ...s, shareImage: { ...s.shareImage, badges: e.target.value.split("\n") } }))}
        />
        <p className="text-xs text-muted-foreground">One per line.</p>
      </GlassCard>

      <GlassCard className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">Interface text</h2>
        <p className="text-xs text-muted-foreground">Labels that appear in many places (breadcrumbs, card badges, buttons). Some keep a deliberate trailing space.</p>
        {(Object.keys(UI_LABELS) as UiLabelKey[]).map((key) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`label-${key}`} className="text-xs">{UI_LABELS[key]}</Label>
            <Input id={`label-${key}`} value={info.labels[key]} disabled={!canEdit} onChange={(e) => setInfo((s) => ({ ...s, labels: { ...s.labels, [key]: e.target.value } }))} />
          </div>
        ))}
      </GlassCard>

      <TextDictionaryEditor
        text={info.text}
        canEdit={canEdit}
        onChange={(text) => setInfo((s) => ({ ...s, text }))}
      />

      {canEdit ? (
        <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/90 px-4 py-3 backdrop-blur-md dark:bg-card/85">
          <p className="text-xs text-muted-foreground">
            {JSON.stringify(info) === JSON.stringify(saved) ? "Changes here go live on the website as soon as you save." : "You have unsaved changes."}
          </p>
          <div className="flex items-center gap-2">
          <Button variant="outline" onClick={discard} disabled={pending || JSON.stringify(info) === JSON.stringify(saved)}>
            <Undo2 className="size-3.5" /> Discard
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save &amp; publish
          </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You can view these settings; editing needs the Navigation or Footer permission.</p>
      )}
    </div>
  );
}

function LinkListEditor({ links, canEdit, onChange }: { links: SiteLink[]; canEdit: boolean; onChange: (links: SiteLink[]) => void }) {
  return (
    <div className="space-y-2">
      {links.map((link, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input aria-label={`Link ${i + 1} label`} className="w-48" value={link.label} disabled={!canEdit} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <Input aria-label={`Link ${i + 1} URL`} className="min-w-0 flex-1" value={link.href} disabled={!canEdit} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" disabled={!canEdit} onClick={() => onChange(links.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
        </div>
      ))}
      {canEdit && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...links, { label: "", href: "" }])}>
          <Plus className="size-3.5" /> Add link
        </Button>
      )}
    </div>
  );
}

/** Page & widget text: every key the offers/rewards pages, promos and chat widget render, grouped by area, with a search box. */
function TextDictionaryEditor({ text, canEdit, onChange }: { text: Record<string, string>; canEdit: boolean; onChange: (text: Record<string, string>) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const keys = Object.keys(text).filter((k) => !q || k.toLowerCase().includes(q) || text[k].toLowerCase().includes(q)).sort();
  const groups = new Map<string, string[]>();
  for (const k of keys) {
    const g = k.split(".").slice(0, 2).join(".");
    groups.set(g, [...(groups.get(g) ?? []), k]);
  }
  return (
    <GlassCard className="space-y-3 p-5">
      <h2 className="text-sm font-semibold text-foreground">Page &amp; widget text ({Object.keys(text).length})</h2>
      <p className="text-xs text-muted-foreground">The wording of the offers &amp; rewards pages, offer pop-ups and the chat widget. Some entries use placeholders like {"{campaign}"}.</p>
      <Input aria-label="Search text" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {[...groups.entries()].map(([group, groupKeys]) => (
        <details key={group} className="rounded-xl border border-border/60 p-3" open={Boolean(q)}>
          <summary className="cursor-pointer font-mono text-xs font-semibold text-foreground">{group} ({groupKeys.length})</summary>
          <div className="mt-3 space-y-3">
            {groupKeys.map((key) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`text-${key}`} className="font-mono text-[11px] text-muted-foreground">{key}</Label>
                <Textarea id={`text-${key}`} rows={text[key].length > 80 ? 3 : 1} value={text[key]} disabled={!canEdit} onChange={(e) => onChange({ ...text, [key]: e.target.value })} />
              </div>
            ))}
          </div>
        </details>
      ))}
    </GlassCard>
  );
}
