const LS = new RegExp(String.fromCharCode(0x2028), "g");
const PS = new RegExp(String.fromCharCode(0x2029), "g");

/** Escapes `<` (so content can never close the tag or open another) and the JS line separators inside JSON. */
export function escapeJsonForScript(json: string): string {
  return json.replace(/</g, "\\u003c").replace(LS, "\\u2028").replace(PS, "\\u2029");
}

/** JSON for embedding inside a `<script type="application/ld+json">` tag. */
export function jsonForScript(value: unknown): string {
  return escapeJsonForScript(JSON.stringify(value));
}
