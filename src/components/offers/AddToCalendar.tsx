"use client";

import { CalendarPlus } from "lucide-react";
import { useText } from "@/components/products/sitecraft-ai/TextContext";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Real reminder, no backend needed: an .ics file (Apple/Outlook) or a Google Calendar link for the campaign start. */
export default function AddToCalendar({ name, startsAt, endsAt, description }: { name: string; startsAt: string; endsAt: string; description?: string }) {
  const tx = useText();
  const { brand } = useSiteInfo();
  const brandName = brand.namePrimary + brand.nameAccent;
  const slug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "offers";
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const title = `${name} goes live — ${brandName}`;
  const details = description ?? "Limited-time offers on software, AI, training, internships and developer hiring.";
  const url = typeof window !== "undefined" ? `${window.location.origin}/offers` : "/offers";

  function downloadIcs() {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:-//${brandName}//Offers//EN`,
      "BEGIN:VEVENT",
      `UID:offer-${stamp(start)}@${slug}`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(new Date(Math.min(start.getTime() + 3600_000, end.getTime())))}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${details}\\n${url}`,
      `URL:${url}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${title}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = `${slug}-offer-reminder.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${stamp(start)}/${stamp(new Date(Math.min(start.getTime() + 3600_000, end.getTime())))}&details=${encodeURIComponent(details + "\n" + url)}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={downloadIcs} className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20">
        <CalendarPlus className="size-4" />{tx("offers.addToCalendar.add-to-calendar")}</button>
      <a href={google} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-white/70 underline underline-offset-2 hover:text-white">
        {tx("offers.addToCalendar.google-calendar")}</a>
    </div>
  );
}
