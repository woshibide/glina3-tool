// Design <-> share-link text. Strokes become compact varints (nib, then point deltas), compressed with
// the platform's deflate and written as base64url, so a whole drawing fits in the URL with no server.
//
// Layout, version 1: version, stroke count, then per stroke: flags (bit 0 erase, bits 1-2 shape),
// size, angle, point count, and zigzag deltas for x and y (the first point relative to 0, 0).
import { NIB_SHAPES, validDesign } from "./strip.js";

const VERSION = 1;

function writer() {
  const bytes = [];
  const uint = (v) => {
    while (v > 127) {
      bytes.push((v & 127) | 128);
      v >>>= 7;
    }
    bytes.push(v);
  };
  const int = (v) => uint(v < 0 ? -2 * v - 1 : 2 * v);
  return { bytes, uint, int };
}

function reader(bytes) {
  let at = 0;
  const uint = () => {
    let v = 0;
    let shift = 0;
    for (;;) {
      if (at >= bytes.length) throw new Error("Design link is cut short.");
      const b = bytes[at++];
      v += (b & 127) * 2 ** shift;
      if (b < 128) return v;
      shift += 7;
      if (shift > 35) throw new Error("Design link has an invalid number.");
    }
  };
  const int = () => {
    const v = uint();
    return v % 2 ? -(v + 1) / 2 : v / 2;
  };
  return { uint, int, done: () => at === bytes.length };
}

export function packDesign(design) {
  const w = writer();
  w.uint(VERSION);
  w.uint(design.strokes.length);
  for (const { erase, nib, points } of design.strokes) {
    w.uint((erase ? 1 : 0) | (NIB_SHAPES.indexOf(nib.shape) << 1));
    w.uint(nib.size);
    w.uint(nib.angle);
    w.uint(points.length / 2);
    let x = 0;
    let y = 0;
    for (let i = 0; i < points.length; i += 2) {
      w.int(points[i] - x);
      w.int(points[i + 1] - y);
      x = points[i];
      y = points[i + 1];
    }
  }
  return Uint8Array.from(w.bytes);
}

export function unpackDesign(bytes) {
  const r = reader(bytes);
  const version = r.uint();
  if (version !== VERSION) throw new Error(`Design link version ${version} is not supported.`);
  const strokes = [];
  for (let s = r.uint(); s > 0; s--) {
    const flags = r.uint();
    const nib = { shape: NIB_SHAPES[flags >> 1], size: r.uint(), angle: r.uint() };
    const points = [];
    let x = 0;
    let y = 0;
    for (let n = r.uint(); n > 0; n--) {
      x += r.int();
      y += r.int();
      points.push(x, y);
    }
    strokes.push({ erase: Boolean(flags & 1), nib, points });
  }
  if (!r.done()) throw new Error("Design link has trailing data.");
  const design = { strokes };
  if (!validDesign(design)) throw new Error("Design link holds values outside the allowed range.");
  return design;
}

async function pipe(bytes, stream) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(out);
}

const toBase64Url = (bytes) => {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
const fromBase64Url = (text) => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("Design link has invalid characters.");
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

export async function encodeDesign(design) {
  return toBase64Url(await pipe(packDesign(design), new CompressionStream("deflate-raw")));
}

export async function decodeDesign(text) {
  let bytes;
  try {
    bytes = await pipe(fromBase64Url(text), new DecompressionStream("deflate-raw"));
  } catch (error) {
    throw new Error(`Design link is damaged: ${error.message}`);
  }
  return unpackDesign(bytes);
}
