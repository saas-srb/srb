/** Reads an MP4's duration from its `moov/mvhd` box without any dependency. Returns null for anything that isn't a parseable MP4. */
export function mp4DurationSecs(buf: Buffer): number | null {
  const find = (start: number, end: number, type: string): { s: number; e: number } | null => {
    let p = start;
    while (p + 8 <= end) {
      let size = buf.readUInt32BE(p);
      const t = buf.toString("latin1", p + 4, p + 8);
      let header = 8;
      if (size === 1) {
        if (p + 16 > end) return null;
        size = Number(buf.readBigUInt64BE(p + 8));
        header = 16;
      } else if (size === 0) size = end - p;
      if (size < header || p + size > end) return null;
      if (t === type) return { s: p + header, e: p + size };
      p += size;
    }
    return null;
  };
  try {
    const moov = find(0, buf.length, "moov");
    if (!moov) return null;
    const mvhd = find(moov.s, moov.e, "mvhd");
    if (!mvhd) return null;
    const version = buf.readUInt8(mvhd.s);
    let timescale: number;
    let duration: number;
    if (version === 1) {
      timescale = buf.readUInt32BE(mvhd.s + 20);
      duration = Number(buf.readBigUInt64BE(mvhd.s + 24));
    } else {
      timescale = buf.readUInt32BE(mvhd.s + 12);
      duration = buf.readUInt32BE(mvhd.s + 16);
    }
    if (!timescale) return null;
    return Math.round((duration / timescale) * 100) / 100;
  } catch {
    return null;
  }
}

export function looksLikeMp4(buf: Buffer): boolean {
  return buf.length > 12 && buf.toString("latin1", 4, 8) === "ftyp";
}
