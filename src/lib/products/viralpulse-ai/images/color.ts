/** Hex colour helpers shared by the kit and the compositor. Pure. */
export const isHex = (v: string) => /^#?[0-9a-fA-F]{6}$/.test(v.trim());
export const normHex = (v: string) => `#${v.trim().replace(/^#/, "").toLowerCase()}`;
