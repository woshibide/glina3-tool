// Write the baked cup maps as PNG files: npm run maps -- <folder>
// Images use the usual texture orientation: the top row is v = 1 (inner floor), the bottom row v = 0 (base centre).
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { createCupGeometry } from "../src/scene/cup.js";
import { LOOK, bakeSurface } from "../src/scene/surface.js";

const folder = process.argv[2];
if (!folder) {
  console.error("Missing output folder. Use: npm run maps -- <folder>");
  process.exit(1);
}
const out = resolve(folder);
mkdirSync(out, { recursive: true });

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}
// pixel(row, column, buffer, offset) writes one pixel of bytesPerPixel bytes.
function png(width, height, { colorType, bitDepth, bytesPerPixel }, pixel) {
  const stride = width * bytesPerPixel + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) pixel(y, x, raw, y * stride + 1 + x * bytesPerPixel);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(bitDepth, 8);
  header.writeUInt8(colorType, 9);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const { sectionMm, sectionLengthMm } = createCupGeometry();
const bake = bakeSurface({ points: sectionMm, length: sectionLengthMm });
const { columns, rows } = bake;
const source = (y, x) => (rows - 1 - y) * columns + x;

const rgb = (data) =>
  png(columns, rows, { colorType: 2, bitDepth: 8, bytesPerPixel: 3 }, (y, x, buffer, at) => {
    const i = source(y, x) * 4;
    buffer[at] = data[i];
    buffer[at + 1] = data[i + 1];
    buffer[at + 2] = data[i + 2];
  });

let min = Infinity;
let max = -Infinity;
for (const v of bake.height) {
  if (v < min) min = v;
  if (v > max) max = v;
}
const height = png(columns, rows, { colorType: 0, bitDepth: 16, bytesPerPixel: 2 }, (y, x, buffer, at) => {
  buffer.writeUInt16BE(Math.round(((bake.height[source(y, x)] - min) / (max - min)) * 65535), at);
});

writeFileSync(resolve(out, "cup_albedo.png"), rgb(bake.albedo));
writeFileSync(resolve(out, "cup_normal.png"), rgb(bake.normal));
writeFileSync(resolve(out, "cup_orm.png"), rgb(bake.orm));
writeFileSync(resolve(out, "cup_height.png"), height);
writeFileSync(
  resolve(out, "cup_maps.json"),
  `${JSON.stringify({ columns, rows, sectionLengthMm, heightMm: { black: min, white: max }, look: LOOK }, null, 2)}\n`,
);
console.log(`Wrote cup_albedo, cup_normal, cup_orm, cup_height (${columns} x ${rows}) and cup_maps.json to ${out}`);
