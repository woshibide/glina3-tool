import { computed, onScopeDispose, reactive, ref, watch } from "vue";
import { clamp } from "../lib/values.js";
// The one composition clock: preview, scrubbing, frame stepping, and export all read its time.
// Each page owns one engine and passes it to every control that plays or previews motion.
// The animation frame loop runs only while playing. Time and play state are transient; never save them.
export function usePlayback({ total, range = () => ({ start: 0, end: total(), loop: false }), fps }) {
  const time = ref(0);
  const playing = ref(false);
  let frame = 0;
  let last = null;

  function tick(now) {
    const { start, end, loop } = range();
    if (last !== null) {
      const next = time.value + Math.min(0.1, (now - last) / 1000);
      if (loop && end > start) time.value = next >= end ? start + ((next - end) % (end - start)) : next;
      else time.value = Math.min(end, next);
    }
    last = now;
    if (!loop && time.value >= end) playing.value = false;
    else frame = requestAnimationFrame(tick);
  }
  watch(playing, (on) => {
    cancelAnimationFrame(frame);
    last = null;
    if (on) frame = requestAnimationFrame(tick);
  });

  // Playing from outside the range, or from its end, starts at its beginning.
  function toggle() {
    const { start, end } = range();
    if (!playing.value && (time.value >= end || time.value < start)) time.value = start;
    playing.value = !playing.value;
  }
  function scrub(value) {
    playing.value = false;
    time.value = clamp(value, 0, total());
  }
  function stepFrame(delta) {
    scrub((Math.round(time.value * fps()) + delta) / fps());
  }

  watch(total, (value) => {
    if (time.value > value) time.value = value;
  });
  const pause = () => {
    if (document.hidden) playing.value = false;
  };
  document.addEventListener("visibilitychange", pause);
  onScopeDispose(() => {
    cancelAnimationFrame(frame);
    document.removeEventListener("visibilitychange", pause);
  });

  return reactive({
    time,
    playing,
    total: computed(total),
    range: computed(range),
    fps: computed(fps),
    toggle,
    scrub,
    stepFrame,
  });
}
