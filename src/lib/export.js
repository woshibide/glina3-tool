// Deterministic PNG / MP4 / WebM export for canvas renderers, including WebGL.
// The exporter renders offline on its own canvas from a frozen snapshot, by output time; it never records the preview.
export const FORMATS = { mp4: "MP4", webm: "WebM", png: "PNG" };
export const MIME = { png: "image/png", mp4: "video/mp4", webm: "video/webm" };
export const MAX_EDGE = 4096;
export const MAX_DURATION = 120;

// Output pixels for a composition aspect and a long edge; video needs even dimensions.
export function outputSize({ width, height }, longEdge) {
  const scale = longEdge / Math.max(width, height);
  const even = (value) => Math.max(2, Math.round((value * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

// Frame indices 0..count-1; the last frame is clipped so the total equals the duration.
export function frameSchedule(duration, fps) {
  const frameTotal = duration * fps;
  const roundoff = Number.EPSILON * Math.max(1, frameTotal);
  const count = Math.max(1, Math.ceil(frameTotal - roundoff));
  return Array.from({ length: count }, (_, i) => {
    const time = i / fps;
    return { time, duration: Math.min(1 / fps, duration - time) };
  });
}

export function validateExport({ format, width, height, fps, duration }) {
  if (!MIME[format]) throw new Error(`Unknown format "${format}".`);
  if (![width, height].every((n) => Number.isInteger(n) && n >= 2 && n <= MAX_EDGE))
    throw new Error(`Output size must be whole pixels between 2 and ${MAX_EDGE}.`);
  if (format === "png") return;
  if (width % 2 || height % 2) throw new Error("Video dimensions must be even.");
  if (!(Number.isFinite(fps) && fps >= 1 && fps <= 120)) throw new Error("FPS must be between 1 and 120.");
  if (!(Number.isFinite(duration) && duration > 0 && duration <= MAX_DURATION))
    throw new Error(`Duration must be above 0 and at most ${MAX_DURATION} s.`);
}

export function exportFilename(name, { format, width, height, fps }, date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const rate = format === "png" ? "" : `-${+fps.toFixed(3)}fps`;
  const safe = name.replace(/[^a-z0-9-]+/gi, "-");
  return `${safe}-${width}x${height}${rate}-${stamp}.${format}`;
}

const abortError = () => new DOMException("Export canceled.", "AbortError");

// settings: { format, width, height, fps, duration, time }.
// createTarget({ width, height }) returns { canvas, draw(time), dispose() } for the frozen snapshot;
// draw(time) must leave the finished frame on canvas. The exporter disposes the target.
// PNG renders `time`; video renders 0..duration. Resolves to a nonempty Blob of the chosen format.
export async function exportCanvas({ settings, createTarget, signal, onProgress }) {
  validateExport(settings);
  const { format, width, height, fps, duration } = settings;
  let mediabunny, codec;
  if (format !== "png") {
    mediabunny = await import("mediabunny");
    const options = { width, height, bitrate: mediabunny.QUALITY_HIGH };
    const candidates = format === "mp4" ? ["avc"] : ["vp9", "vp8"];
    for (const candidate of candidates) {
      if (await mediabunny.canEncodeVideo(candidate, options)) {
        codec = candidate;
        break;
      }
    }
    if (!codec)
      throw new Error(format === "mp4"
        ? `This browser cannot encode H.264 at ${width} × ${height}. Choose WebM or a smaller size.`
        : `This browser cannot encode VP9 or VP8 at ${width} × ${height}. Try a smaller size.`);
  }
  if (signal.aborted) throw abortError();

  const target = createTarget({ width, height });
  const { canvas, draw } = target;
  try {
    if (format === "png") {
      draw(settings.time);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, MIME.png));
      if (!blob?.size) throw new Error("The PNG encoder returned an empty file.");
      return blob;
    }
    return await encodeVideo(mediabunny, codec, canvas, draw, settings, signal, onProgress);
  } finally {
    target.dispose();
  }
}

async function encodeVideo(mediabunny, codec, canvas, draw, { format, fps, duration }, signal, onProgress) {
  const { Output, BufferTarget, CanvasSource, Mp4OutputFormat, WebMOutputFormat, QUALITY_HIGH } = mediabunny;
  const output = new Output({
    format: format === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  try {
    const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 1 });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();
    const frames = frameSchedule(duration, fps);
    for (let i = 0; i < frames.length; i++) {
      if (signal.aborted) throw abortError();
      draw(frames[i].time);
      await source.add(frames[i].time, frames[i].duration);
      onProgress?.({ stage: "rendering", done: i + 1, total: frames.length });
      if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve));
    }
    if (signal.aborted) throw abortError();
    onProgress?.({ stage: "finalizing", done: frames.length, total: frames.length });
    source.close();
    await output.finalize();
    if (signal.aborted) throw abortError();
    const buffer = output.target.buffer;
    if (!buffer?.byteLength) throw new Error("The video encoder returned an empty file.");
    return new Blob([buffer], { type: MIME[format] });
  } finally {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => {});
  }
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
