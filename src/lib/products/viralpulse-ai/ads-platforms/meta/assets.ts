import { MetaApiError } from "./errors";
import type { MetaClient } from "./client";

/**
 * Asset upload to a Meta ad account. Images: base64 `bytes` to `adimages` (returns a hash). Videos: chunked `advideos` upload
 * (start -> transfer* -> finish), the offsets in each reply drive the next chunk; then poll the video until it is ready.
 * The bytes come from a `ByteSource` (the media library's Blob stream) so a video is never held in memory whole.
 */

export interface ByteSource {
  /** Total size in bytes. */
  size: number;
  /** A fresh stream from byte 0. */
  open(): Promise<ReadableStream<Uint8Array>>;
}

/** Reads sequential ranges from a stream, re-opening it when asked to go back. */
export class RangeReader {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private pos = 0;
  private rest: Uint8Array = new Uint8Array(0);
  constructor(private readonly src: ByteSource) {}

  private async reopen() {
    await this.reader?.cancel().catch(() => {});
    this.reader = (await this.src.open()).getReader();
    this.pos = 0;
    this.rest = new Uint8Array(0);
  }

  async read(start: number, end: number): Promise<Uint8Array> {
    if (!this.reader || start < this.pos) await this.reopen();
    while (this.pos < start) await this.pull(start - this.pos);
    return this.pull(end - start, true);
  }

  private async pull(n: number, keep = false): Promise<Uint8Array> {
    const parts: Uint8Array[] = [];
    let got = 0;
    while (got < n) {
      if (this.rest.length === 0) {
        const r = await this.reader!.read();
        if (r.done) break;
        this.rest = r.value;
      }
      const take = Math.min(n - got, this.rest.length);
      if (keep) parts.push(this.rest.subarray(0, take));
      this.rest = this.rest.subarray(take);
      got += take;
      this.pos += take;
    }
    if (!keep) return new Uint8Array(0);
    const out = new Uint8Array(got);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  async close() {
    await this.reader?.cancel().catch(() => {});
    this.reader = null;
  }
}

export async function readAll(src: ByteSource): Promise<Buffer> {
  const rr = new RangeReader(src);
  try {
    return Buffer.from(await rr.read(0, src.size));
  } finally {
    await rr.close();
  }
}

export async function uploadImage(client: MetaClient, actId: string, src: ByteSource, filename: string): Promise<string> {
  const bytes = (await readAll(src)).toString("base64");
  const r = await client.post<{ images?: Record<string, { hash?: string }> }>(`${actId}/adimages`, { bytes, name: filename }, { idempotentWrite: true });
  const hash = r.images ? Object.values(r.images)[0]?.hash : undefined;
  if (!hash) throw new MetaApiError("Meta accepted the image but returned no image hash.", 200, null, null, "unknown", false);
  return hash;
}

interface StartReply {
  upload_session_id: string;
  video_id: string;
  start_offset: string;
  end_offset: string;
}
interface TransferReply {
  start_offset: string;
  end_offset: string;
}

export async function uploadVideo(client: MetaClient, actId: string, src: ByteSource, title: string, opts: { sleep?: (ms: number) => Promise<void>; pollMs?: number; maxPolls?: number } = {}): Promise<string> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const start = await client.post<StartReply>(`${actId}/advideos`, { upload_phase: "start", file_size: src.size }, { idempotentWrite: true });
  if (!start.upload_session_id || !start.video_id) throw new MetaApiError("Meta did not start the video upload.", 200, null, null, "unknown", false);
  const rr = new RangeReader(src);
  try {
    let s = Number(start.start_offset);
    let e = Number(start.end_offset);
    // Bounded: a chunk can only move the offset forward or repeat a few times.
    for (let guard = 0; s < src.size && guard < 10_000; guard++) {
      const chunk = await rr.read(s, Math.min(e, src.size));
      const form = new FormData();
      form.set("upload_phase", "transfer");
      form.set("upload_session_id", start.upload_session_id);
      form.set("start_offset", String(s));
      form.set("video_file_chunk", new Blob([chunk as BlobPart]), "chunk");
      const r = await client.request<TransferReply>("POST", `${actId}/advideos`, { body: form, idempotentWrite: true });
      s = Number(r.start_offset);
      e = Number(r.end_offset);
    }
  } finally {
    await rr.close();
  }
  await client.post(`${actId}/advideos`, { upload_phase: "finish", upload_session_id: start.upload_session_id, title: title.slice(0, 250) }, { idempotentWrite: true });
  // Wait for processing.
  const max = opts.maxPolls ?? 40;
  for (let i = 0; i < max; i++) {
    const v = await client.get<{ status?: { video_status?: string; processing_progress?: number } }>(start.video_id, { fields: "status" });
    const st = v.status?.video_status;
    if (st === "ready") return start.video_id;
    if (st === "error") throw new MetaApiError("Meta could not process the video. Check the file format and try another export.", 200, null, null, "validation", false);
    await sleep(opts.pollMs ?? 3000);
  }
  throw new MetaApiError("Meta is still processing the video. Try the launch again in a few minutes; the upload is kept.", 200, null, null, "transient", true, [], null, 60_000);
}
