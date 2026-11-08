import type { PBDoc, ZoneBlock } from "@/lib/products/playbook-ai/doc/types";
import type { PageSettings } from "@/lib/products/playbook-ai/doc/page";
import type { DocumentSnapshot, DocumentStore } from "@/components/doc-editor/core/store";
import type { VariableDef } from "@/components/doc-editor/core/variables";
import type { ImageUploader } from "@/components/doc-editor/ui/commands";

/** Company brand tokens used by the header and footer preview and the page. All optional; the editor never invents a brand. */
export interface BrandTokens {
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

/** Values for fields that appear in headers and footers. Missing ones show as a labelled token. */
export interface ZoneValues {
  docNumber?: string;
  version?: string;
  date?: string;
  title?: string;
}

/** Comment hook points. The comments feature itself is built later; the editor only marks blocks and reports requests. */
export interface CommentHooks {
  /** Ids of blocks that have comments: they get a marker in the page. */
  commentedBlockIds?: ReadonlySet<string>;
  /** The user asked to comment on a block (toolbar or shortcut). */
  onRequestComment?: (ctx: { blockId: string; quote: string }) => void;
  /** The user clicked a commented block. */
  onCommentedBlockClick?: (blockId: string) => void;
}

export interface DocEditorProps {
  documentId: string;
  store: DocumentStore;
  /** The document as loaded by the host (server component or action). The editor starts from this and from its `version`. */
  initial: DocumentSnapshot;
  /** The variable registry for the picker. */
  variables: VariableDef[];
  /** Values for the "resolved" preview. Keys are variable and placeholder keys. */
  previewValues?: Record<string, string>;
  zoneValues?: ZoneValues;
  brand?: BrandTokens;
  /**
   * What the page view shows when it differs from what is stored (for example the company letterhead merged into the header at render time).
   * Display only: it is never saved. Without it the document's own page settings, header and footer are shown.
   */
  view?: { page?: PageSettings; header?: ZoneBlock[]; footer?: ZoneBlock[] };
  /** Shown above the page when the document is read-only for a reason the user should know (for example "Someone else is editing"). */
  readOnlyReason?: string;
  readOnly?: boolean;
  /** Pluggable image upload. Without it the image button is hidden. */
  uploadImage?: ImageUploader;
  resolveImageUrl?: (fileId: string) => string | null;
  maxImageBytes?: number;
  /** Returns a URL (or blob URL) of the real PDF for the given document. Shown in the "PDF preview" tab. */
  renderPreview?: (doc: PBDoc) => Promise<string>;
  comments?: CommentHooks;
  /** Pause between the last edit and the automatic save. */
  autosaveMs?: number;
  /** Called whenever there are unsaved changes (or none). */
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
}
