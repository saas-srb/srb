/** Client-side mirrors of the server serialization shapes in `src/lib/huddle-ai/*`. */

export type MessageScope = { type: "channel"; id: string } | { type: "dm"; id: string };

export type AttachmentKind = "image" | "voice" | "video" | "file";

export interface Attachment {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  kind: AttachmentKind;
  durationMs?: number;
}

export interface DirectoryUser {
  _id: string;
  displayName: string;
  email: string;
  title: string | null;
  department: string | null;
  avatarUrl: string | null;
  roles?: string[];
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
  mine: boolean;
}

export interface ClientMessage {
  _id: string;
  seq: number;
  scope: MessageScope;
  author: DirectoryUser | null;
  authorId: string;
  body: string;
  attachments: Attachment[];
  mentions: string[];
  parentId: string | null;
  forwardedFrom: { authorName: string; scopeLabel: string } | null;
  callMeta: {
    callId: string;
    mode: "audio" | "video";
    outcome: "accepted" | "missed" | "declined" | "no_answer";
    durationSec: number;
    participantIds: string[];
  } | null;
  edited: boolean;
  deleted: boolean;
  reactions: ReactionGroup[];
  thread: { replyCount: number; lastReplyAt: string | null } | null;
  starred: boolean;
  createdAt: string;
}

export interface MemberLite {
  _id: string;
  displayName: string;
  avatarUrl?: string | null;
  role?: string;
}
