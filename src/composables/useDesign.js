// Drawing state: committed strokes with undo/redo, the live mask, and the stroke being drawn.
// Strokes are immutable once committed, so history entries share them and "is it baked?" is a
// reference comparison of stroke lists.
import { computed, ref, shallowRef } from "vue";
import { UNITS, rasterizeDesign, rasterizeSegment } from "../design/strip.js";

export function useDesign(spec, initial = []) {
  const strokes = shallowRef(initial);
  const past = shallowRef([]);
  const future = shallowRef([]);
  let mask = rasterizeDesign({ strokes: initial }, spec);
  let current = null;
  // Bumped on every mask change, including mid-stroke, so views redraw.
  const revision = ref(0);

  function commit(next) {
    past.value = [...past.value, strokes.value];
    future.value = [];
    strokes.value = next;
  }
  function rebuild() {
    mask = rasterizeDesign({ strokes: strokes.value }, spec);
    revision.value++;
  }

  // x, y in stroke units; x may run past the seam, it stays continuous within a stroke.
  function begin(x, y, { nib, erase }) {
    current = { erase, nib: { ...nib }, points: [x, y] };
    rasterizeSegment(mask, spec, current, 0);
    revision.value++;
  }
  function extend(x, y) {
    if (!current) return;
    const points = current.points;
    let px = x;
    const last = points.at(-2);
    while (px - last > UNITS / 2) px -= UNITS;
    while (last - px > UNITS / 2) px += UNITS;
    points.push(px, Math.max(0, Math.min(UNITS, y)));
    rasterizeSegment(mask, spec, current, points.length / 2 - 1);
    revision.value++;
  }
  function end() {
    if (!current) return;
    const stroke = current;
    current = null;
    commit([...strokes.value, stroke]);
  }
  function cancel() {
    if (!current) return;
    current = null;
    rebuild();
  }

  function undo() {
    if (!past.value.length) return;
    future.value = [strokes.value, ...future.value];
    strokes.value = past.value.at(-1);
    past.value = past.value.slice(0, -1);
    rebuild();
  }
  function redo() {
    if (!future.value.length) return;
    past.value = [...past.value, strokes.value];
    strokes.value = future.value[0];
    future.value = future.value.slice(1);
    rebuild();
  }
  function clear() {
    if (!strokes.value.length) return;
    commit([]);
    rebuild();
  }
  // Replace the whole design (shared link, debug sample); undoable like any edit.
  function load(next) {
    commit(next);
    rebuild();
  }

  return {
    strokes,
    revision,
    mask: () => mask,
    drawing: () => current !== null,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
    begin, extend, end, cancel, undo, redo, clear, load,
  };
}
