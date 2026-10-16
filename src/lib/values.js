export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
// Preserve overshoot: normalized values outside 0–1 extend beyond the output range.
export const remapValue = (value, { min, max }) => min + (max - min) * value;
export const finite = (value, min, max) =>
  Number.isFinite(value) && value >= min && value <= max;
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const validColor = (c) =>
  c &&
  typeof c.hex === "string" &&
  /^#[0-9a-f]{6}$/i.test(c.hex) &&
  finite(c.alpha, 0, 1);
export const rgba = (c) =>
  `rgb(${parseInt(c.hex.slice(1, 3), 16)} ${parseInt(c.hex.slice(3, 5), 16)} ${parseInt(c.hex.slice(5, 7), 16)} / ${c.alpha})`;
export const hexAlpha = (c) =>
  c.hex +
  Math.round(c.alpha * 255)
    .toString(16)
    .padStart(2, "0");
// Null means this key belongs to the browser, not the control.
export function arrowDelta(event) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
    return null;
  event.preventDefault();
  const step = event.shiftKey ? 5 : 1;
  return {
    x:
      event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
    y: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
  };
}
export function parseHex(text, previous) {
  const value = text.trim();
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return null;
  return {
    hex: value.slice(0, 7).toLowerCase(),
    alpha:
      value.length === 9 ? parseInt(value.slice(7), 16) / 255 : previous.alpha,
  };
}
