import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, slugify } from "@/lib/products/huddle-ai/db";
import { emit } from "@/lib/products/huddle-ai/events";
import { notifyMany } from "@/lib/products/huddle-ai/notifications";
import type { Channel, ChannelMember } from "@/lib/products/huddle-ai/channels";

/**
 * Project channels — a `chat_channels` row of `kind: "project"` bound to a PMS
 * project via `projectId`. Provisioned and kept in sync *from* Messenger with no
 * changes to the PMS data layer: `syncProjectChannel` reconciles one project's
 * channel + membership, and `provisionAllProjectChannels` sweeps every project
 * (throttled). PMS server actions call `syncProjectChannel` best-effort after a
 * project or member change; the sweep is the backstop.
 *
 * Channel membership = the Messenger accounts (`chat_users`) whose linked
 * `employeeId` is an active member of the PMS project, plus the project manager.
 * Employees without a Messenger login simply aren't added.
 */

const CHANNELS_COLLECTION = "chat_channels";
const MEMBERS_COLLECTION = "channel_members";
const META_COLLECTION = "chat_meta";
const PMS_PROJECTS = "pms_projects";
const PMS_MEMBERS = "pms_project_members";

interface PmsProjectDoc {
  _id: string;
  projectCode: string;
  name: string;
  description: string | null;
  status: string;
  projectManagerId: string | null;
  deletedAt: Date | null;
}

async function chatUserIdsForEmployees(employeeIds: string[]): Promise<{ byEmployee: Map<string, string>; userIds: string[] }> {
  const db = await getDb();
  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  if (ids.length === 0) return { byEmployee: new Map(), userIds: [] };
  const rows = await db
    .collection<{ _id: string; employeeId: string | null }>("chat_users")
    .find({ employeeId: { $in: ids }, deletedAt: null })
    .toArray();
  const byEmployee = new Map<string, string>();
  for (const r of rows) if (r.employeeId) byEmployee.set(r.employeeId, r._id);
  return { byEmployee, userIds: rows.map((r) => r._id) };
}

/** Reconcile one PMS project's channel + membership. Best-effort — never throws. */
export async function syncProjectChannel(projectId: string): Promise<string | null> {
  try {
    const db = await getDb();
    const project = await db.collection<PmsProjectDoc>(PMS_PROJECTS).findOne({ _id: projectId });
    if (!project) return null;

    const channels = db.collection<Channel>(CHANNELS_COLLECTION);
    const members = db.collection<ChannelMember>(MEMBERS_COLLECTION);
    let channel = await channels.findOne({ projectId, ...notDeleted });

    // Project deleted / cancelled → archive the channel, keep the history.
    if (project.deletedAt || project.status === "cancelled") {
      if (channel && !channel.archivedAt) {
        await channels.updateOne({ _id: channel._id }, { $set: { archivedAt: new Date(), updatedAt: new Date() } });
      }
      return channel?._id ?? null;
    }

    // Desired membership: active project members + the PM, mapped to chat users.
    const memberRows = await db
      .collection<{ employeeId: string; active: boolean; deletedAt: Date | null }>(PMS_MEMBERS)
      .find({ projectId, deletedAt: null, active: true })
      .toArray();
    const employeeIds = memberRows.map((m) => m.employeeId);
    if (project.projectManagerId) employeeIds.push(project.projectManagerId);
    const { byEmployee, userIds: desiredIds } = await chatUserIdsForEmployees(employeeIds);
    const ownerId = project.projectManagerId ? byEmployee.get(project.projectManagerId) ?? null : null;
    const desired = new Set(desiredIds);

    const now = new Date();

    if (!channel) {
      if (desired.size === 0) return null; // nobody to add yet — wait for the sweep
      const doc: Channel = {
        _id: newId(),
        kind: "project",
        slug: await uniqueSlug(`prj ${project.projectCode}`),
        name: project.name,
        description: project.description,
        topic: `${project.projectCode} · project channel`,
        avatarUrl: null,
        visibility: "private",
        projectId,
        pinnedMessageIds: [],
        archivedAt: null,
        lastActivityAt: now,
        lastMessagePreview: null,
        ...createStamp(ownerId),
      };
      await channels.insertOne(doc);
      channel = doc;
      await members.insertMany(
        [...desired].map(
          (userId): ChannelMember => ({
            _id: newId(),
            channelId: doc._id,
            userId,
            role: userId === ownerId ? "owner" : "member",
            joinedAt: now,
            lastReadSeq: 0,
            mutedUntil: null,
            notificationPref: "all",
            ...createStamp(ownerId),
          })
        )
      );
      await notifyMany([...desired], {
        type: "channel_invite",
        title: `Project channel created: ${project.name}`,
        body: "You've been added to the project's team channel.",
        link: `/huddle-ai/projects`,
        dedupeKey: `project_channel_created:${doc._id}`,
      });
      await emit({ scope: { type: "channel", id: doc._id }, kind: "channel", payload: { action: "created", channelId: doc._id }, actorId: ownerId });
      return doc._id;
    }

    // Existing channel: unarchive if the project came back, keep name in sync.
    const patch: Record<string, unknown> = {};
    if (channel.archivedAt) patch.archivedAt = null;
    if (channel.name !== project.name) patch.name = project.name;
    if ((channel.description ?? null) !== (project.description ?? null)) patch.description = project.description;
    if (Object.keys(patch).length > 0) {
      await channels.updateOne({ _id: channel._id }, { $set: { ...patch, updatedAt: now } });
    }

    // Membership diff.
    const currentRows = await members.find({ channelId: channel._id, deletedAt: null }).toArray();
    const current = new Set(currentRows.map((r) => r.userId as string));

    const toAdd = [...desired].filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !desired.has(id));

    for (const userId of toAdd) {
      await members.updateOne(
        { channelId: channel._id, userId },
        {
          $set: { deletedAt: null, role: (userId === ownerId ? "owner" : "member") as ChannelMember["role"], ...updateStamp(ownerId) },
          $setOnInsert: {
            _id: newId(),
            joinedAt: now,
            lastReadSeq: 0,
            mutedUntil: null,
            notificationPref: "all" as ChannelMember["notificationPref"],
            createdAt: now,
            createdBy: ownerId,
          },
        },
        { upsert: true }
      );
      await emit({ scope: { type: "user", id: userId }, kind: "channel", payload: { action: "added_to_channel", channelId: channel._id }, actorId: ownerId });
    }
    if (toAdd.length > 0) {
      await notifyMany(toAdd, {
        type: "channel_invite",
        title: `Added to project channel: ${project.name}`,
        body: null,
        link: `/huddle-ai/projects`,
        dedupeKey: `project_channel_add:${channel._id}:${now.toISOString().slice(0, 10)}`,
      });
    }
    for (const userId of toRemove) {
      await members.updateOne({ channelId: channel._id, userId }, { $set: { deletedAt: now, ...updateStamp(ownerId) } });
      await emit({ scope: { type: "user", id: userId }, kind: "channel", payload: { action: "removed_from_channel", channelId: channel._id }, actorId: ownerId });
    }
    if (toAdd.length + toRemove.length > 0) {
      await emit({ scope: { type: "channel", id: channel._id }, kind: "channel", payload: { action: "members_synced", channelId: channel._id }, actorId: ownerId });
    }

    return channel._id;
  } catch {
    return null;
  }
}

async function uniqueSlug(base: string): Promise<string> {
  const db = await getDb();
  const c = db.collection(CHANNELS_COLLECTION);
  const root = slugify(base);
  let slug = root;
  let n = 1;
  while (await c.findOne({ slug, deletedAt: null })) slug = `${root}-${++n}`;
  return slug;
}

/** Sweep every non-deleted PMS project. Throttled to once / 10 minutes across the app. */
export async function provisionAllProjectChannels(): Promise<void> {
  try {
    const db = await getDb();
    const meta = db.collection<{ _id: string; lastRun: Date }>(META_COLLECTION);
    const now = new Date();
    const claim = await meta.findOneAndUpdate(
      { _id: "project_channel_sweep", lastRun: { $lt: new Date(now.getTime() - 10 * 60 * 1000) } },
      { $set: { lastRun: now } },
      { returnDocument: "after" }
    );
    if (!claim) {
      const existing = await meta.findOne({ _id: "project_channel_sweep" });
      if (existing) return;
      await meta.updateOne({ _id: "project_channel_sweep" }, { $setOnInsert: { lastRun: now } }, { upsert: true });
    }

    const projects = await db
      .collection<PmsProjectDoc>(PMS_PROJECTS)
      .find({ deletedAt: null })
      .project<{ _id: string }>({ _id: 1 })
      .toArray();
    for (const p of projects) await syncProjectChannel(p._id);
  } catch {
    // sweep failures must never break a render
  }
}

export async function getProjectChannelSlug(projectId: string): Promise<string | null> {
  const db = await getDb();
  const channel = await db
    .collection<{ slug: string }>(CHANNELS_COLLECTION)
    .findOne({ projectId, deletedAt: null }, { projection: { slug: 1 } });
  return channel?.slug ?? null;
}
