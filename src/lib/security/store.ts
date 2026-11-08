import "server-only";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { readClient, type ClientInfo, type DeviceInfo, type LocationInfo } from "@/lib/security/client-info";

/**
 * Where people are signed in, and the history of sign-ins. Two company-scoped collections:
 *  - `login_sessions`: one row per sign-in (device) — what the Security page lists and lets a person end. Every session the sign-in
 *    created in any product carries its `loginId`, so ending a device ends exactly that device, everywhere.
 *  - `login_events`: the append-only history (sign-ins, failed attempts, sign-outs, sessions ended), kept 180 days.
 */

export const LOGIN_COOKIE = "login_id";
const EVENT_TTL_SECONDS = 180 * 24 * 60 * 60;

export type LoginVia = "password" | "invite" | "support";
export type LoginEventType = "login" | "login_failed" | "login_locked" | "logout" | "logout_everywhere" | "session_revoked" | "session_replaced" | "password_reset";

export interface LoginSessionDoc {
  _id: string;
  adminId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  ip: string | null;
  userAgent: string;
  device: DeviceInfo;
  location: LocationInfo | null;
  via: LoginVia;
  revokedAt: Date | null;
  revokedReason: string | null;
}

export interface LoginEventDoc {
  _id: ObjectId;
  at: Date;
  adminId: string | null;
  email: string;
  type: LoginEventType;
  ip: string | null;
  userAgent: string;
  device: DeviceInfo;
  location: LocationInfo | null;
  via?: LoginVia;
  loginId?: string;
  reason?: string;
}

let indexed = false;

export async function loginSessions() {
  const c = (await getDb()).collection<LoginSessionDoc>("login_sessions");
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ adminId: 1, revokedAt: 1, expiresAt: -1 }).catch(() => {}), c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }).catch(() => {})]);
    await (await getDb()).collection("login_events").createIndex({ at: 1 }, { expireAfterSeconds: EVENT_TTL_SECONDS }).catch(() => {});
    await (await getDb()).collection("login_events").createIndex({ adminId: 1, at: -1 }).catch(() => {});
  }
  return c;
}

export async function loginEvents() {
  await loginSessions(); // makes sure the indexes exist
  return (await getDb()).collection<LoginEventDoc>("login_events");
}

/** The request being served, or an empty description outside a request (scripts, crons). */
export async function captureClient(): Promise<ClientInfo> {
  try {
    return readClient(await headers());
  } catch {
    return readClient(new Headers());
  }
}

export async function recordLoginEvent(e: { type: LoginEventType; email: string; adminId?: string | null; via?: LoginVia; loginId?: string; reason?: string; client?: ClientInfo }): Promise<void> {
  try {
    const client = e.client ?? (await captureClient());
    await (await loginEvents()).insertOne({
      _id: new ObjectId(),
      at: new Date(),
      adminId: e.adminId ?? null,
      email: e.email.toLowerCase().slice(0, 200),
      type: e.type,
      ip: client.ip,
      userAgent: client.userAgent,
      device: client.device,
      location: client.location,
      ...(e.via ? { via: e.via } : {}),
      ...(e.loginId ? { loginId: e.loginId } : {}),
      ...(e.reason ? { reason: e.reason } : {}),
    });
  } catch (err) {
    console.error("[security] could not record login event", err);
  }
}
