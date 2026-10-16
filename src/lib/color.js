// Conversion stays independent of the picker; hue is retained when saturation is zero.
import { parseHex } from "./values.js";
export function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
const hexFromRgb = (channels) =>
  "#" +
  channels.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
export function toHsv(hex, previousHue = 0) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const h = !d
    ? previousHue
    : ((max === r
        ? (g - b) / d
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4) *
        60 +
        360) %
      360;
  return { h, s: max ? (d / max) * 100 : 0, v: max * 100 };
}
export function fromHsv(h, s, v) {
  s /= 100;
  v /= 100;
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return hexFromRgb([f(5), f(3), f(1)]);
}
export function hsl(hex) {
  const { h, s, v } = toHsv(hex);
  const l = (v / 100) * (1 - s / 200);
  return [
    Math.round(h),
    Math.round(
      l === 0 || l === 1 ? 0 : ((v / 100 - l) / Math.min(l, 1 - l)) * 100,
    ),
    Math.round(l * 100),
  ];
}
export function parseColor(format, text, previous) {
  if (format === "HEX") return parseHex(text, previous);
  const pattern =
    format === "RGBA"
      ? /^(?:rgba\(\s*)?(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d*\.?\d+)\s*\)?$/i
      : /^(?:hsl\(\s*)?(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%?\s*,\s*(\d+(?:\.\d+)?)%?\s*\)?$/i;
  const match = text.trim().match(pattern);
  if (!match) return null;
  const numbers = match.slice(1).map(Number);
  if (format === "RGBA") {
    if (numbers.slice(0, 3).some((v) => v > 255) || numbers[3] > 1) return null;
    return { hex: hexFromRgb(numbers.slice(0, 3)), alpha: numbers[3] };
  }
  const [h, s, l] = numbers;
  if (h > 360 || s > 100 || l > 100) return null;
  const v = l + (s * Math.min(l, 100 - l)) / 100;
  return {
    hex: fromHsv(h % 360, v ? 200 * (1 - l / v) : 0, v),
    alpha: previous.alpha,
  };
}
