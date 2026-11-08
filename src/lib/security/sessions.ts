import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { clearAllSessionCookies, destroySessionsEverywhere, sessionCollectionNames } from "@/lib/cross-module-sso";
import { HUB_SESSION_COOKIE } from "@/lib/hub-auth";
import { LOGIN_COOKIE, captureClient, loginEvents, loginSessions, recordLoginEvent, type LoginEventDoc, type LoginVia } from "@/lib/security/store";
import { countryName, flagEmoji, isPrivateAddress } from "@/lib/security/client-info";

/**
 * Sign-ins as devices. `startLoginSession` runs right after a person signs in (the Workspace session and every product session have just been
 * minted): it records the device and place, gives the sign-in an id, stamps that id on every session the sign-in created and puts it in a
 * cookie. After that a device can be listed, and ended exactly — or all of them at once.
 */

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const UUID = /^[0-9a-f-]{36}$/;

export async function startLoginSession(adminId: ObjectId, o: { startedAt: Date; via?: LoginVia; email: string }): Promise<string> {
  const client = await captureClient();
  const loginId = randomUUID();
  const now = new Date();
  await (await loginSessions()).insertOne({
    _id: loginId,
    adminId: adminId.toString(),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    ip: client.ip,
    userAgent: client.userAgent,
    device: client.device,
    location: client.location,
    via: o.via ?? "password",
    revokedAt: null,
    revokedReason: null,
  });
  // Every session this sign-in created, in every product, carries the id.
  const since = new Date(o.startedAt.getTime() - 2000);
  const db = await getDb();
  await Promise.all(sessionCollectionNames().map((n) => db.collection(n).updateMany({ adminId, createdAt: { $gte: since }, loginId: { $exists: false } }, { $set: { loginId } }).catch(() => {})));
  (await cookies()).set(LOGIN_COOKIE, loginId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_MS / 1000 });
  await recordLoginEvent({ type: "login", email: o.email || (await emailOf(adminId)), adminId: adminId.toString(), via: o.via ?? "password", loginId, client });
  return loginId;
}

async function currentLoginId(): Promise<string | null> {
  const v = (await cookies()).get(LOGIN_COOKIE)?.value;
  return v && UUID.test(v) ? v : null;
}

/** Ends one sign-in (device): its sessions in every product. */
async function endLogin(adminId: ObjectId, loginId: string, reason: string, event: "logout" | "session_revoked" | "session_replaced", email: string): Promise<void> {
  const db = await getDb();
  await Promise.all(sessionCollectionNames().map((n) => db.collection(n).deleteMany({ adminId, loginId })));
  const res = await (await loginSessions()).findOneAndUpdate({ _id: loginId, adminId: adminId.toString(), revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
  await recordLoginEvent({ type: event, email, adminId: adminId.toString(), loginId, reason, ...(res ? { client: { ip: res.ip, userAgent: res.userAgent, device: res.device, location: res.location } } : {}) });
}

async function emailOf(adminId: ObjectId): Promise<string> {
  return (await (await getDb()).collection<{ email?: string }>("admin_users").findOne({ _id: adminId }, { projection: { email: 1 } }))?.email ?? "";
}

/** Normal sign-out: this device only. A sign-in from before devices were tracked has no id, so it ends the account's sessions as it used to. */
export async function signOutThisDevice(adminId: ObjectId): Promise<void> {
  const loginId = await currentLoginId();
  if (loginId) await endLogin(adminId, loginId, "signed_out", "logout", await emailOf(adminId));
  else await destroySessionsEverywhere(adminId);
  await clearAllSessionCookies();
}

/** Every device, including this one. */
export async function signOutEverywhere(adminId: ObjectId): Promise<void> {
  const email = await emailOf(adminId);
  await destroySessionsEverywhere(adminId);
  await recordLoginEvent({ type: "logout_everywhere", email, adminId: adminId.toString() });
}

// ── Listing ────────────────────────────────────────────────────────────────────

export interface SessionView {
  id: string;
  current: boolean;
  deviceLabel: string;
  deviceType: "desktop" | "mobile" | "tablet" | "app";
  browser: string;
  os: string;
  ip: string | null;
  place: string;
  flag: string;
  via: LoginVia;
  signedInAt: string;
  lastActiveAt: string;
  /** A sign-in from before devices were tracked: no device details. */
  legacy: boolean;
}

function placeLabel(loc: { label: string } | null, ip: string | null): string {
  if (loc?.label) return loc.label;
  return isPrivateAddress(ip) ? "Local network" : "Location unavailable";
}

export async function listActiveSessions(adminId: ObjectId): Promise<SessionView[]> {
  const db = await getDb();
  const now = new Date();
  const mine = await currentLoginId();
  const hubToken = (await cookies()).get(HUB_SESSION_COOKIE)?.value;
  const hub = db.collection<{ _id: ObjectId; tokenHash: string; loginId?: string; createdAt: Date; expiresAt: Date }>("hub_sessions");
  const liveHub = await hub.find({ adminId, expiresAt: { $gt: now } } as never).toArray();
  const liveIds = new Set(liveHub.map((h) => h.loginId).filter((x): x is string => Boolean(x)));
  const rows = await (await loginSessions()).find({ adminId: adminId.toString(), revokedAt: null, expiresAt: { $gt: now } }).sort({ lastSeenAt: -1 }).toArray();
  const out: SessionView[] = rows
    .filter((r) => liveIds.has(r._id))
    .map((r) => ({
      id: r._id,
      current: r._id === mine,
      deviceLabel: r.device.label,
      deviceType: r.device.type,
      browser: r.device.browser,
      os: r.device.os,
      ip: r.ip,
      place: placeLabel(r.location, r.ip),
      flag: flagEmoji(r.location?.countryCode ?? null),
      via: r.via,
      signedInAt: r.createdAt.toISOString(),
      lastActiveAt: r.lastSeenAt.toISOString(),
      legacy: false,
    }));
  const myHash = hubToken ? sha(hubToken) : null;
  for (const h of liveHub.filter((x) => !x.loginId)) {
    out.push({
      id: `legacy:${h._id.toString()}`,
      current: myHash === h.tokenHash && !mine,
      deviceLabel: "Earlier sign-in",
      deviceType: "desktop",
      browser: "Unknown",
      os: "Unknown",
      ip: null,
      place: "No details recorded",
      flag: "🌐",
      via: "password",
      signedInAt: h.createdAt.toISOString(),
      lastActiveAt: h.createdAt.toISOString(),
      legacy: true,
    });
  }
  return out.sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt));
}

/** Ends one listed sign-in. The caller must be the account's owner (the action checks the session). */
export async function revokeSession(adminId: ObjectId, id: string): Promise<{ ok: boolean; self: boolean }> {
  const email = await emailOf(adminId);
  const mine = await currentLoginId();
  if (id.startsWith("legacy:")) {
    const _id = id.slice(7);
    if (!ObjectId.isValid(_id)) return { ok: false, self: false };
    const db = await getDb();
    const doc = await db.collection<{ _id: ObjectId; adminId: ObjectId; tokenHash: string; createdAt: Date }>("hub_sessions").findOne({ _id: new ObjectId(_id), adminId } as never);
    if (!doc) return { ok: false, self: false };
    const token = (await cookies()).get(HUB_SESSION_COOKIE)?.value;
    const self = Boolean(token && sha(token) === doc.tokenHash);
    const from = new Date(doc.createdAt.getTime() - 60_000);
    const to = new Date(doc.createdAt.getTime() + 60_000);
    await Promise.all(sessionCollectionNames().map((n) => db.collection(n).deleteMany({ adminId, loginId: { $exists: false }, createdAt: { $gte: from, $lte: to } })));
    await recordLoginEvent({ type: "session_revoked", email, adminId: adminId.toString(), reason: "ended_by_user" });
    return { ok: true, self };
  }
  if (!UUID.test(id)) return { ok: false, self: false };
  const exists = await (await loginSessions()).findOne({ _id: id, adminId: adminId.toString(), revokedAt: null });
  if (!exists) return { ok: false, self: false };
  await endLogin(adminId, id, "ended_by_user", "session_revoked", email);
  return { ok: true, self: id === mine };
}

/** Every device except this one. */
export async function revokeOtherSessions(adminId: ObjectId): Promise<number> {
  const mine = await currentLoginId();
  const all = await listActiveSessions(adminId);
  let n = 0;
  for (const s of all) {
    if (s.current || s.id === mine) continue;
    if ((await revokeSession(adminId, s.id)).ok) n++;
  }
  return n;
}

/** The devices signed in to this account other than this browser's own sign-in. */
export async function otherDevices(adminId: ObjectId): Promise<SessionView[]> {
  return (await listActiveSessions(adminId)).filter((s) => !s.current);
}

/**
 * Ends every sign-in of the account except `keepLoginId`: used when a plan allows one device at a time and a new device has signed in.
 * Each ended device is signed out in every product and the event says why.
 */
export async function endOtherDevices(adminId: ObjectId, keepLoginId: string): Promise<number> {
  const email = await emailOf(adminId);
  let n = 0;
  for (const s of await listActiveSessions(adminId)) {
    if (s.id === keepLoginId) continue;
    if (s.legacy) {
      if ((await revokeSession(adminId, s.id)).ok) n++;
    } else {
      await endLogin(adminId, s.id, "replaced_by_new_sign_in", "session_replaced", email);
      n++;
    }
  }
  return n;
}

// ── History ────────────────────────────────────────────────────────────────────

export interface HistoryView {
  id: string;
  at: string;
  type: LoginEventDoc["type"];
  title: string;
  tone: "good" | "bad" | "neutral" | "warn";
  deviceLabel: string;
  deviceType: "desktop" | "mobile" | "tablet" | "app";
  ip: string | null;
  place: string;
  flag: string;
  via: LoginVia | null;
  /** A sign-in from a country this account had not signed in from before. */
  newCountry: boolean;
}

const TITLES: Record<LoginEventDoc["type"], { title: string; tone: HistoryView["tone"] }> = {
  login: { title: "Signed in", tone: "good" },
  login_failed: { title: "Failed sign-in attempt", tone: "bad" },
  login_locked: { title: "Blocked: account temporarily locked", tone: "bad" },
  logout: { title: "Signed out", tone: "neutral" },
  logout_everywhere: { title: "Signed out of every device", tone: "warn" },
  session_revoked: { title: "A device was signed out", tone: "warn" },
  session_replaced: { title: "Signed out: the account signed in on another device (free plan: one device at a time)", tone: "warn" },
  password_reset: { title: "Password was reset", tone: "warn" },
};

export async function listLoginHistory(adminId: ObjectId, email: string, limit = 60): Promise<HistoryView[]> {
  const events = await (await loginEvents()).find({ $or: [{ adminId: adminId.toString() }, { email: email.toLowerCase() }] }).sort({ at: -1 }).limit(400).toArray();
  // Walk oldest → newest to know which sign-ins came from a country not seen before.
  const seen = new Set<string>();
  const flagged = new Set<string>();
  for (const e of [...events].reverse()) {
    if (e.type !== "login") continue;
    const cc = e.location?.countryCode;
    if (cc && seen.size > 0 && !seen.has(cc)) flagged.add(e._id.toString());
    if (cc) seen.add(cc);
  }
  return events.slice(0, limit).map((e) => ({
    id: e._id.toString(),
    at: e.at.toISOString(),
    type: e.type,
    title: TITLES[e.type].title,
    tone: TITLES[e.type].tone,
    deviceLabel: e.device.label,
    deviceType: e.device.type,
    ip: e.ip,
    place: placeLabel(e.location, e.ip),
    flag: flagEmoji(e.location?.countryCode ?? null),
    via: e.via ?? null,
    newCountry: flagged.has(e._id.toString()),
  }));
}

export { countryName };
