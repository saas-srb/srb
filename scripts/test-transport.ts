/** End-to-end check of the encrypted API transport against a running dev server: npx tsx scripts/test-transport.ts [origin] */
import { b64uDecode, b64uEncode, ENVELOPE_VERSION, TRANSPORT_HEADERS as H } from "../src/lib/security/transport-shared";

const origin = process.argv[2] ?? "http://localhost:3000";
const enc = new TextEncoder();
const fail = (m: string): never => { console.error("✗ " + m); process.exit(1); };

async function main() {
  const html = await (await fetch(origin + "/privacy")).text();
  const serverPub = /serverKey\\?"\s*:\s*\\?"([A-Za-z0-9_-]{80,100})/.exec(html)?.[1];
  if (!serverPub) return fail("server public key not found in the page (is the transport secret configured?)");
  const subtle = crypto.subtle;
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  const theirs = await subtle.importKey("raw", b64uDecode(serverPub) as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await subtle.deriveBits({ name: "ECDH", public: theirs }, pair.privateKey, 256);
  const base = await subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  const derive = (info: string) => subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode(`selfrun-transport-${ENVELOPE_VERSION}`), info: enc.encode(info) }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const c2s = await derive("client-to-server"); const s2c = await derive("server-to-client");

  const path = "/api/consent"; const ts = Date.now();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const secretText = "VISITOR-MARKER-12345";
  const body = JSON.stringify({ choice: "accepted", version: 1, marker: secretText });
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(`POST\n${path}\n${ts}`) }, c2s, enc.encode(body)));
  const blob = new Uint8Array(12 + ct.length); blob.set(iv); blob.set(ct, 12);
  const wire = JSON.stringify({ e: b64uEncode(blob) });
  if (wire.includes(secretText)) return fail("request leaks plaintext");
  const res = await fetch(origin + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin, [H.key]: b64uEncode(pub), [H.time]: String(ts), [H.body]: "1", [H.contentType]: "application/json" },
    body: wire,
  });
  const text = await res.text();
  if (res.headers.get(H.reply) !== "1") return fail(`reply not sealed (status ${res.status}): ${text.slice(0, 120)}`);
  if (/error|ok|status/i.test(text.replace(/"e":"[^"]*"/, ""))) return fail("reply has readable fields");
  const rb = b64uDecode(JSON.parse(text).e);
  const plain = new TextDecoder().decode(await subtle.decrypt({ name: "AES-GCM", iv: rb.subarray(0, 12) as BufferSource, additionalData: enc.encode(`${res.status}\n${b64uEncode(iv)}`) }, s2c, rb.subarray(12) as BufferSource));
  console.log("✓ request sealed, reply sealed and opened:", plain.slice(0, 100));

  const replay = await fetch(origin + path, { method: "POST", headers: { "content-type": "application/json", origin, [H.key]: b64uEncode(pub), [H.time]: String(ts), [H.body]: "1", [H.contentType]: "application/json" }, body: wire });
  if (replay.status !== 400) return fail(`replay was accepted (${replay.status})`);
  console.log("✓ replay refused");
  const tampered = JSON.stringify({ e: b64uEncode(blob.map((b, i) => (i === 20 ? b ^ 1 : b))) });
  const bad = await fetch(origin + path, { method: "POST", headers: { "content-type": "application/json", origin, [H.key]: b64uEncode(pub), [H.time]: String(Date.now()), [H.body]: "1", [H.contentType]: "application/json" }, body: tampered });
  if (bad.status !== 400) return fail(`tampered request accepted (${bad.status})`);
  console.log("✓ tampered request refused");
  const plainCall = await fetch(origin + path, { method: "POST", headers: { "content-type": "application/json", origin }, body: body });
  console.log(`✓ plain call still served for third parties (status ${plainCall.status}, reply sealed: ${plainCall.headers.get(H.reply) === "1"})`);
}
main().catch((e) => fail(String(e)));
