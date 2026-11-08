import "server-only";
import { listLiveOffers, listClientChoices, serviceCatalogue, getBrandSnapshot } from "@/lib/products/viralpulse-ai/brand";

/** Picker data shared by the campaign and post forms — all read live from the products that own it. */
export async function briefPickers() {
  const [offers, clients] = await Promise.all([listLiveOffers(30), listClientChoices()]);
  const services = serviceCatalogue().map((s) => s.value);
  const brand = await getBrandSnapshot();
  return { offers: offers.map((o) => ({ _id: o._id, title: o.title, badge: o.badge })), clients, services: [...new Set([...brand.brand.services, ...services])] };
}

export const toDateInput = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

const pad = (n: number) => String(n).padStart(2, "0");

/** `datetime-local` value (server local time). */
export const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Pre-fill for a schedule dialog: the current schedule, else a future planned time, else tomorrow. */
export function defaultScheduleInput(scheduledAt: Date | null, plannedAt: Date | null = null): string {
  const now = Date.now();
  return toLocalInput(scheduledAt ?? (plannedAt && plannedAt.getTime() > now ? plannedAt : new Date(now + 86400000)));
}
