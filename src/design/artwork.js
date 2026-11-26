import { layerRelief } from "./strip.js";
import { LOOK } from "../scene/surface.js";

export async function loadArtwork(url, stage, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Cup artwork failed to load (${response.status}).`);
  const bitmap = await createImageBitmap(await response.blob());
  const { columns, rows } = stage.strip;
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  try {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, columns, rows);
    ctx.drawImage(bitmap, 0, 0, columns, rows);
  } finally {
    bitmap.close();
  }
  const { data } = ctx.getImageData(0, 0, columns, rows);
  const mask = new Uint8Array(columns * rows);
  for (let i = 0; i < mask.length; i++) mask[i] = 255 - data[i * 4];
  return layerRelief(mask, stage.strip, {
    layerMm: LOOK.layerMm,
    topMm: Math.max(...stage.section.sectionMm.map(point => point.y)),
  });
}
