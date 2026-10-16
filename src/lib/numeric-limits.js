// null removes a user limit. Domain limits remain independent of editable limits.
export const SAFE_MIN = Number.MIN_SAFE_INTEGER;
export const SAFE_MAX = Number.MAX_SAFE_INTEGER;
export function validLimits(
  value,
  { integer = false, hardMin = SAFE_MIN, hardMax = SAFE_MAX } = {},
) {
  return Boolean(
    value &&
    [value.min, value.max].every(
      (n) =>
        n === null ||
        (Number.isFinite(n) &&
          Math.abs(n) <= SAFE_MAX &&
          n >= hardMin &&
          n <= hardMax &&
          (!integer || Number.isInteger(n))),
    ) &&
    (value.min === null || value.max === null || value.min <= value.max),
  );
}
export function effectiveLimits(
  limits,
  hardMin = SAFE_MIN,
  hardMax = SAFE_MAX,
) {
  return {
    min: Math.max(hardMin, Math.min(hardMax, limits.min ?? hardMin)),
    max: Math.max(hardMin, Math.min(hardMax, limits.max ?? hardMax)),
  };
}
export function clampToLimits(value, limits) {
  return Math.max(limits.min, Math.min(limits.max, value));
}
export function parseLimit(
  text,
  side,
  limits,
  { integer = false, hardMin = SAFE_MIN, hardMax = SAFE_MAX } = {},
) {
  const raw = text.trim().replace("−", "-");
  const value = raw === "-0" ? null : Number(raw);
  if (
    !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) ||
    (value !== null &&
      (!Number.isFinite(value) ||
        Math.abs(value) > SAFE_MAX ||
        (integer && !Number.isInteger(value))))
  ) {
    return {
      error: `Enter ${integer ? "a whole number" : "a number"}, or -0 for no custom limit.`,
    };
  }
  if (value !== null && (value < hardMin || value > hardMax)) {
    const restriction =
      hardMin !== SAFE_MIN && hardMax !== SAFE_MAX
        ? `between ${hardMin} and ${hardMax}`
        : hardMin !== SAFE_MIN
          ? `${hardMin} or greater`
          : `${hardMax} or less`;
    return { error: `Enter ${restriction}, or -0 to use the valid domain.` };
  }
  const next = { ...limits, [side]: value };
  if (!validLimits(next))
    return { error: "Minimum must be less than or equal to maximum." };
  return { value: next };
}
// A finite viewport for an unbounded control. Freeze this scale for each drag.
export function displayLimits(limits, values, fallback = { min: 0, max: 100 }) {
  let min = limits.min ?? Math.min(fallback.min, ...values);
  let max = limits.max ?? Math.max(fallback.max, ...values);
  if (min >= max) {
    if (limits.min === null) min = max - 1;
    else max = min + 1;
  }
  return { min, max };
}
export function moveInterval(initial, part, delta, limits) {
  if (part === "band") {
    const shift = Math.max(
      limits.min - initial.min,
      Math.min(limits.max - initial.max, delta),
    );
    return { min: initial.min + shift, max: initial.max + shift };
  }
  return {
    ...initial,
    [part]: clampToLimits(initial[part] + delta, {
      min: part === "min" ? limits.min : initial.min,
      max: part === "min" ? initial.max : limits.max,
    }),
  };
}
