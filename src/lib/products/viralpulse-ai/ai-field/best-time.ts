/**
 * "Best time to post" from the company's OWN published posts with recorded results. Pure. India-only product rule: hours are
 * read in IST (UTC+05:30). With too little data it says so instead of guessing.
 */

export interface PostSample {
  publishedAt: Date;
  /** Engagement actually recorded for the post (engagements, or likes+comments+shares+saves). */
  engagement: number;
}

export const BEST_TIME_MIN_POSTS = 10;
export const BEST_TIME_MIN_PER_HOUR = 2;
const IST_MIN = 330;

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DDTHH:mm` for a UTC instant, expressed in IST. */
export function istLocal(d: Date): string {
  const t = new Date(d.getTime() + IST_MIN * 60_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

export function istDate(d: Date): string {
  return istLocal(d).slice(0, 10);
}

export type BestTime = { ok: true; value: string; hour: number; basedOn: number; avg: number } | { ok: false; reason: string };

export function bestPostingTime(samples: PostSample[], now: Date): BestTime {
  const usable = samples.filter((s) => Number.isFinite(s.engagement) && s.engagement >= 0 && s.publishedAt instanceof Date && !Number.isNaN(s.publishedAt.getTime()));
  if (usable.length < BEST_TIME_MIN_POSTS) return { ok: false, reason: `Not enough data yet: ${usable.length} published post${usable.length === 1 ? "" : "s"} with recorded results (at least ${BEST_TIME_MIN_POSTS} are needed). Pick a time yourself.` };
  const byHour = new Map<number, { sum: number; n: number }>();
  for (const s of usable) {
    const h = Number(istLocal(s.publishedAt).slice(11, 13));
    const e = byHour.get(h) ?? { sum: 0, n: 0 };
    e.sum += s.engagement;
    e.n += 1;
    byHour.set(h, e);
  }
  let best: { hour: number; avg: number; n: number } | null = null;
  for (const [hour, e] of byHour) {
    if (e.n < BEST_TIME_MIN_PER_HOUR) continue;
    const avg = e.sum / e.n;
    if (!best || avg > best.avg || (avg === best.avg && hour < best.hour)) best = { hour, avg, n: e.n };
  }
  if (!best) return { ok: false, reason: "Your published posts are spread too thinly across the day to find a best hour. Pick a time yourself." };
  // Next occurrence of that hour at least one hour from now.
  const earliest = new Date(now.getTime() + 60 * 60_000);
  let day = istDate(earliest);
  let candidate = `${day}T${pad(best.hour)}:00`;
  if (candidate < istLocal(earliest)) {
    const next = new Date(new Date(`${day}T00:00:00Z`).getTime() + 86_400_000);
    day = next.toISOString().slice(0, 10);
    candidate = `${day}T${pad(best.hour)}:00`;
  }
  return { ok: true, value: candidate, hour: best.hour, basedOn: usable.length, avg: Math.round(best.avg * 10) / 10 };
}
