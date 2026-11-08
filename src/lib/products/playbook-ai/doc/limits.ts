/** Structural limits enforced by the PBDoc validator (server-side, on every save) and mirrored by the editor. Pure, client-safe. */
export const PBDOC_LIMITS = {
  /** Whole document, counted over every block, list item, row, cell and inline node. */
  maxNodes: 60_000,
  maxBodyBlocks: 3_000,
  maxZoneBlocks: 12,
  /** Nesting of section / conditional / repeat. */
  maxContainerDepth: 4,
  /** Nesting of lists inside lists. */
  maxListDepth: 4,
  maxText: 20_000,
  maxInlinePerBlock: 2_000,
  maxListItems: 500,
  maxTableCols: 12,
  maxTableRows: 500,
  maxCellBlocks: 20,
  maxCalloutBlocks: 20,
  maxSections: 80,
  maxTitle: 200,
  maxLabel: 200,
  maxHint: 300,
  maxHref: 2_000,
  maxCaption: 300,
  maxAlt: 300,
  maxFallback: 200,
  maxConditionValue: 200,
  maxSpacerMm: 100,
  minColPct: 5,
} as const;

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** `namespace.field` or `namespace.group.field` (up to four parts), lower-case. */
export const VAR_KEY_RE = /^[a-z][a-z0-9_]{0,39}(\.[a-z][a-z0-9_]{0,39}){1,3}$/;
export const IDENT_RE = /^[a-z][a-z0-9_]{0,39}$/;
export const SECTION_KEY_RE = IDENT_RE;
export const FILE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const ALLOWED_LINK_SCHEMES = ["http:", "https:", "mailto:", "tel:"] as const;
