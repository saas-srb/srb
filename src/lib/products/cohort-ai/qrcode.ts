/**
 * Minimal, dependency-free QR Code generator (byte mode, ECC level M, best
 * mask, versions 1–40). Adapted from Project Nayuki's public-domain reference
 * implementation (https://www.nayuki.io/page/qr-code-generator-library),
 * trimmed to the byte-segment path we need for certificate verification links.
 *
 * Client-safe (pure) — used to render an inline SVG on the verification page
 * and an embedded PNG-less SVG string in the certificate PDF.
 */

// ---- Galois-field arithmetic for Reed–Solomon ----------------------------

function reedSolomonMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function reedSolomonComputeDivisor(degree: number): number[] {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= reedSolomonMultiply(divisor[i], factor);
  }
  return result;
}

// ---- Error-correction tables (level M) ----------------------------------

const ECC_CODEWORDS_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const NUM_ERROR_CORRECTION_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];

function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(ver: number): number {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ver] * NUM_ERROR_CORRECTION_BLOCKS[ver]
  );
}

// ---- Bit buffer ---------------------------------------------------------

function appendBits(val: number, len: number, bb: number[]): void {
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

// ---- Core ------------------------------------------------------------------

export interface QrMatrix {
  size: number;
  /** row-major booleans; true = dark module */
  modules: boolean[][];
}

const PAD0 = 0xec;
const PAD1 = 0x11;

export function encodeQrByteMode(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);

  // Pick the smallest version that fits with an 8-bit or 16-bit length field.
  let version = 1;
  for (; version <= 40; version++) {
    const capacityBits = getNumDataCodewords(version) * 8;
    const ccLen = version < 10 ? 8 : 16;
    const usedBits = 4 + ccLen + bytes.length * 8;
    if (usedBits <= capacityBits) break;
  }
  if (version > 40) throw new Error("Data too long for QR code");

  const ccLen = version < 10 ? 8 : 16;
  const bb: number[] = [];
  appendBits(0b0100, 4, bb); // byte mode
  appendBits(bytes.length, ccLen, bb);
  for (const b of bytes) appendBits(b, 8, bb);

  const dataCapacityBits = getNumDataCodewords(version) * 8;
  appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
  appendBits(0, (8 - (bb.length % 8)) % 8, bb);
  for (let pad = PAD0; bb.length < dataCapacityBits; pad ^= PAD0 ^ PAD1) appendBits(pad, 8, bb);

  const dataCodewords: number[] = [];
  for (let i = 0; i < bb.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb[i + j];
    dataCodewords.push(byte);
  }

  // Split into blocks and interleave with ECC.
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[version];
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const rsDiv = reedSolomonComputeDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = dataCodewords.slice(k, k + datLen);
    k += datLen;
    const ecc = reedSolomonComputeRemainder(dat, rsDiv);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][i]);
    }
  }

  return renderMatrix(version, result);
}

function renderMatrix(version: number, codewords: number[]): QrMatrix {
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFn = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  // Timing patterns
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  // Finder patterns + separators
  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // Alignment patterns
  const alignPositions = getAlignmentPatternPositions(version);
  for (const ay of alignPositions) {
    for (const ax of alignPositions) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve format + version info areas
  reserveFormatInfo(size, setFn);
  if (version >= 7) reserveVersionInfo(version, size, setFn);

  // Place data with zig-zag
  let bitIdx = 0;
  const getBit = (n: number, i: number) => ((n >>> i) & 1) !== 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (isFunction[y][x]) continue;
        let dark = false;
        if (bitIdx < codewords.length * 8) {
          dark = getBit(codewords[bitIdx >>> 3], 7 - (bitIdx & 7));
          bitIdx++;
        }
        modules[y][x] = dark;
      }
    }
  }

  // Try all 8 masks, pick lowest penalty
  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestModules = modules;
  for (let mask = 0; mask < 8; mask++) {
    const test = modules.map((row) => row.slice());
    applyMask(test, isFunction, mask);
    drawFormatBits(test, isFunction, mask, size);
    const p = penaltyScore(test, size);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestMask = mask;
      bestModules = test;
    }
  }
  void bestMask;

  return { size, modules: bestModules };
}

function getAlignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

function reserveFormatInfo(size: number, setFn: (x: number, y: number, d: boolean) => void) {
  for (let i = 0; i < 9; i++) {
    setFn(i, 8, false);
    setFn(8, i, false);
  }
  for (let i = 0; i < 8; i++) {
    setFn(size - 1 - i, 8, false);
    setFn(8, size - 1 - i, false);
  }
  setFn(8, size - 8, true); // dark module
}

function reserveVersionInfo(version: number, size: number, setFn: (x: number, y: number, d: boolean) => void) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = ((version << 12) | rem) >>> 0;
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFn(a, b, bit);
    setFn(b, a, bit);
  }
}

function applyMask(modules: boolean[][], isFunction: boolean[][], mask: number) {
  const size = modules.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      let invert = false;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

function drawFormatBits(modules: boolean[][], isFunction: boolean[][], mask: number, size: number) {
  // ECC level M = 0b00
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) setModule(modules, isFunction, 8, i, getBitB(bits, i));
  setModule(modules, isFunction, 8, 7, getBitB(bits, 6));
  setModule(modules, isFunction, 8, 8, getBitB(bits, 7));
  setModule(modules, isFunction, 7, 8, getBitB(bits, 8));
  for (let i = 9; i < 15; i++) setModule(modules, isFunction, 14 - i, 8, getBitB(bits, i));

  for (let i = 0; i < 8; i++) setModule(modules, isFunction, size - 1 - i, 8, getBitB(bits, i));
  for (let i = 8; i < 15; i++) setModule(modules, isFunction, 8, size - 15 + i, getBitB(bits, i));
  setModule(modules, isFunction, 8, size - 8, true);
}

function getBitB(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

function setModule(modules: boolean[][], isFunction: boolean[][], x: number, y: number, dark: boolean) {
  modules[y][x] = dark;
  isFunction[y][x] = true;
}

function penaltyScore(modules: boolean[][], size: number): number {
  let penalty = 0;
  // Rule 1: runs of 5+
  for (let y = 0; y < size; y++) {
    let runColor = modules[y][0];
    let runLen = 1;
    for (let x = 1; x < size; x++) {
      if (modules[y][x] === runColor) {
        runLen++;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty++;
      } else {
        runColor = modules[y][x];
        runLen = 1;
      }
    }
  }
  for (let x = 0; x < size; x++) {
    let runColor = modules[0][x];
    let runLen = 1;
    for (let y = 1; y < size; y++) {
      if (modules[y][x] === runColor) {
        runLen++;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty++;
      } else {
        runColor = modules[y][x];
        runLen = 1;
      }
    }
  }
  // Rule 2: 2x2 blocks
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) penalty += 3;
    }
  }
  // Rule 4: proportion of dark
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) dark++;
  const total = size * size;
  const ratio = (dark * 100) / total;
  penalty += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return penalty;
}

// ---- SVG output ---------------------------------------------------------

export function qrToSvgPath(text: string): { size: number; path: string } {
  const { size, modules } = encodeQrByteMode(text);
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, path };
}

/** Full standalone SVG markup (quiet zone included). */
export function qrToSvg(text: string, pixelSize = 160): string {
  const { size, path } = qrToSvgPath(text);
  const quiet = 4;
  const dim = size + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/><g transform="translate(${quiet},${quiet})" fill="#000"><path d="${path}"/></g></svg>`;
}
