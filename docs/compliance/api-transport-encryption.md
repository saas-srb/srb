# Encrypted API transport

Every `/api/*` JSON route (185 route files) and every Server Action now take its request body, and returns its JSON reply, inside an AES-256-GCM envelope on top of HTTPS. The
Network tab, proxies and logs show `{"e":"…"}` only.

## How it works
- The server has one static ECDH P-256 key derived from `API_TRANSPORT_SECRET` (else `PLATFORM_ENCRYPTION_KEY`). Pages receive its **public** half only.
- Each page load the browser makes its own non-extractable ECDH key, sends the public half in `x-ek`, and both sides derive the AES keys with HKDF. Nothing is stored on the server.
- Each message has a fresh IV; method, path, timestamp (±5 min) and, for replies, the request's IV are authenticated data, so replays, tampering, route swaps and swapped replies are refused.
- `TransportBoot` (root layout) wraps `fetch` for same-origin `/api/` calls, so existing code is unchanged. `withTransport()` wraps each route handler.

## Server Actions
Next.js reads an action's body itself, so the browser seals the whole call (page, Next's action headers, arguments) and posts it to `/api/secure/action`. That route opens it and makes the same call to the same page on the same host (never `/api/`, never another host, only the headers Next's action protocol needs; identity such as cookies comes from the real request), then returns status, headers and body inside the sealed reply. The call passes the normal gate, sessions and permissions. The person's address travels in a signed `x-internal-ip` header (HMAC, 60 s) so rate limits stay per person.

## What is not sealed (and why)
- Webhooks, cron, OAuth callbacks and the app-build callback: third parties call them in their own format.
- Streams (chat, SSE), files, PDFs, CSV exports and images: not JSON.
- The **query string** of a GET, and multipart **file uploads** (the reply is sealed; the upload travels over HTTPS only).
- **Server Action** calls larger than 3 MB are sent as Next.js sends them (HTTPS only).
- Gate refusals (rate limit, no session) are plain and carry no data.
- Scripted clients (curl, tests) without the headers are served as before in development; production still refuses them at the gate.

## Honest limit
The signed-in person's browser must decrypt to display, so this hides traffic from the network, intermediaries and logs, not from the user's own
page. Public keys and the `x-ek` header are visible by design; the secret and private keys never leave their side.

## Operate
Set `API_TRANSPORT_SECRET` in production (changing it only makes open pages reload once). Without any secret in production the layer is off and the API
works as before. Check with `npm run test:transport` against a running server.
