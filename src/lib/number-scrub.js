import { SAFE_MIN, SAFE_MAX, clampToLimits } from "./numeric-limits.js";

export const NUMBER_SCRUB_HINT =
  "Drag right or up to increase, left or down to decrease. Click to type. Shift: faster. Alt: finer.";

const PIXELS_PER_STEP = 4;
const DRAG_THRESHOLD = 4;

function stepSize(step) {
  return Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 0.1;
}

function decimals(value) {
  const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
  return Math.max(0, (mantissa.split(".")[1]?.length ?? 0) - Number(exponent));
}

// The adapters supply the existing model and constraints; this owns only the gesture.
export function createNumberScrubber({ read, write, onEnd = () => {} }) {
  let gesture = null;

  function finish() {
    if (!gesture) return;
    const { target, pointerId, axis } = gesture;
    gesture = null;
    target.ownerDocument.defaultView.removeEventListener("blur", finish);
    target.ownerDocument.documentElement.removeAttribute("data-number-scrubbing");
    target.removeAttribute("data-scrubbing");
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    onEnd(Boolean(axis));
  }

  function pointerdown(event) {
    const options = read();
    if (
      gesture || event.button !== 0 || event.isPrimary === false ||
      options.disabled || !Number.isFinite(options.value)
    ) return;
    event.preventDefault();
    const target = event.currentTarget;
    gesture = {
      target, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      lastX: event.clientX, lastY: event.clientY,
      origin: options.value, raw: options.value, requested: options.value,
      step: stepSize(options.step),
      fixedStep: Number.isFinite(Number(options.step)) && Number(options.step) > 0,
      axis: null,
    };
    target.setPointerCapture(event.pointerId);
    target.focus({ preventScroll: true });
    target.ownerDocument.defaultView.addEventListener("blur", finish);
  }

  function pointermove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const options = read();
    if (options.disabled) return finish();
    const g = gesture;
    // A parent may apply stricter constraints, such as the other linked dimension.
    if (options.value !== g.requested) {
      g.origin = g.raw = g.requested = options.value;
    }
    if (!g.axis) {
      const dx = event.clientX - g.startX, dy = event.clientY - g.startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_THRESHOLD) return;
      g.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      g.target.setAttribute("data-scrubbing", g.axis);
      g.target.ownerDocument.documentElement.setAttribute("data-number-scrubbing", g.axis);
    }
    event.preventDefault();
    const delta = g.axis === "x" ? event.clientX - g.lastX : g.lastY - event.clientY;
    g.lastX = event.clientX;
    g.lastY = event.clientY;
    const speed = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    const quantum = g.fixedStep ? g.step : g.step * (event.altKey ? 0.1 : 1);
    g.raw += delta / PIXELS_PER_STEP * g.step * speed;
    const ticks = (g.raw - g.origin) / quantum;
    const wholeTicks = Math.trunc(ticks + Math.sign(ticks) * 1e-9);
    const precision = Math.min(12, Math.max(decimals(g.origin), decimals(quantum)));
    const value = clampToLimits(
      Number((g.origin + wholeTicks * quantum).toFixed(precision)),
      { min: options.min ?? SAFE_MIN, max: options.max ?? SAFE_MAX },
    );
    // Discard travel beyond a limit so reversing direction responds immediately.
    if (g.raw < (options.min ?? SAFE_MIN) || g.raw > (options.max ?? SAFE_MAX)) {
      g.raw = value;
      g.origin = value;
    }
    g.requested = value;
    if (value !== options.value) write(value);
  }

  function pointerup(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const { target, axis } = gesture;
    finish();
    if (!axis) target.select();
  }

  function interrupted(event) {
    if (gesture && event.pointerId === gesture.pointerId) finish();
  }

  function keydown(event) {
    if (event.key === "Escape" && gesture) {
      event.preventDefault();
      finish();
    }
  }

  return {
    get dragging() { return Boolean(gesture?.axis); },
    events: {
      pointerdown, pointermove, pointerup, keydown,
      pointercancel: interrupted,
      lostpointercapture: interrupted,
      blur: finish,
    },
    dispose: finish,
  };
}
