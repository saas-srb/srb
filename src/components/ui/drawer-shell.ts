/**
 * The ONE right-hand drawer shell: Notifications, Account, Ask AI-style drawers and every configuration panel (Integrations, Product settings) share
 * it, so they open at the same width with the same slide-in, header and close pattern. About 416px on a desktop; the whole screen on a phone.
 * `DRAWER_WIDE_CLASS` is the optional "Expand" width (about 720px, desktop only) for panels that hold wide tables.
 */
export const DRAWER_WIDTH_PX = 416;
export const DRAWER_WIDE_PX = 720;
export const DRAWER_SHELL_CLASS = "flex h-full w-full flex-col gap-0 border-border/70 p-0 data-[side=right]:w-full data-[side=right]:sm:w-[26rem] data-[side=right]:sm:max-w-[26rem]";
export const DRAWER_WIDE_CLASS = "data-[side=right]:sm:w-[45rem] data-[side=right]:sm:max-w-[45rem]";
/** The header of every drawer: bottom border, the same padding, room for the close button. */
export const DRAWER_HEADER_CLASS = "border-b border-border/60 px-5 py-4 pr-12";
